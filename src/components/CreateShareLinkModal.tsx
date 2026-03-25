import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/lib/auth";
import { ArrowLeft, ArrowRight, Loader2, Lock } from "lucide-react";
import { isChannelBasedFormat } from "@/lib/filterFormatUtils";
import { formatDateToLocalIso } from "@/lib/monthUtils";
import {
  getChannelDefaultMainDimension,
  flattenLockedDimensionIds,
  type Channel,
  type MinimalDimension,
} from "@/lib/dimensionDefaults";
import { loadDimensionsForUser } from "@/lib/dimensionLoader";
import { Badge } from "@/components/ui/badge";

interface CreateShareLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editingLink?: {
    id: string;
    slug: string;
    report_ids: string[];
    dimension_filters?: Record<string, Record<string, string[]>>;
    view_id?: string | null;
    slide_report_id?: string | null;
    locked_dimension_ids?: string[];
    selected_year?: string;
    selected_month?: string;
    custom_date_range?: { from: string; to: string };
    date_preset?: string;
  } | null;
  accountId?: string;
  slideReportId?: string | null;
  availableViews?: Array<{ id: string | null; name: string }>;
  currentFilterValues?: Record<string, Record<string, string[]>>;
  currentDateSelection?: {
    selectedYear: string;
    selectedMonth: string;
    customDateRange?: import("react-day-picker").DateRange;
    datePreset?: string;
  };
  /** Channel → report ID map for the account (from useSlideReportPage / accountReportIds) */
  channelReportIds?: Partial<Record<Channel, string | null>>;
}

type DimensionFilters = Record<string, Record<string, string[]>>;

const CHANNELS: Channel[] = ['metasearch', 'sem', 'social'];

const CHANNEL_LABELS: Record<Channel, string> = {
  metasearch: 'Metasearch',
  sem: 'SEM',
  social: 'Social',
};

export const CreateShareLinkModal = ({
  open,
  onOpenChange,
  onSuccess,
  editingLink,
  accountId,
  slideReportId,
  availableViews = [],
  currentFilterValues,
  currentDateSelection,
  channelReportIds,
}: CreateShareLinkModalProps) => {
  // ─── Step 1 state ─────────────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2>(1);
  const [slug, setSlug] = useState("");
  const [password, setPassword] = useState("");
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ─── Step 2 state ─────────────────────────────────────────────────────────
  // Dimensions available per channel (loaded from DB)
  const [channelDimensions, setChannelDimensions] = useState<Partial<Record<Channel, MinimalDimension[]>>>({});
  const [loadingDimensions, setLoadingDimensions] = useState(false);
  // Per-channel selected locked dimension ID
  const [lockedDimByChannel, setLockedDimByChannel] = useState<Partial<Record<Channel, string>>>({});

  const { toast } = useToast();
  const { data: userResult } = useUser();
  const user = userResult?.user;

  // Channels that have a report configured for this account
  const activeChannels = CHANNELS.filter(
    (ch) => channelReportIds && channelReportIds[ch]
  );

  // ─── Reset on open ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setChannelDimensions({});
    setLockedDimByChannel({});

    if (editingLink) {
      setSlug(editingLink.slug);
      setPassword("");
      setSelectedViewId(editingLink.view_id ?? null);
    } else {
      setSlug("");
      setPassword("");
      setSelectedViewId(null);
    }
  }, [open]);

  // ─── Load dimensions when entering Step 2 ─────────────────────────────────
  const loadDimensionsForAllChannels = useCallback(async () => {
    if (!accountId) return;
    setLoadingDimensions(true);
    try {
      const results: Partial<Record<Channel, MinimalDimension[]>> = {};

      await Promise.all(
        activeChannels.map(async (channel) => {
          const reportId = channelReportIds?.[channel] ?? undefined;
          try {
            // Use the canonical loader (account → custom → global precedence)
            const dims = await loadDimensionsForUser(
              user?.id ?? '',
              reportId,
              { accountId, typeFilter: 'text' }
            );
            results[channel] = dims.map((d) => ({ id: d.id, name: d.name }));
          } catch (err) {
            console.error(`[CreateShareLinkModal] Error loading dimensions for ${channel}:`, err);
            results[channel] = [];
          }
        })
      );

      setChannelDimensions(results);

      // Apply defaults: if editing, pre-fill from existing locked_dimension_ids;
      // otherwise, apply product defaults (Hotel for metasearch, Account for sem/social).
      const defaults: Partial<Record<Channel, string>> = {};
      const existingLocked = editingLink?.locked_dimension_ids ?? [];

      for (const channel of activeChannels) {
        const dims = results[channel] ?? [];
        if (existingLocked.length > 0) {
          // Try to find the existing locked dim in this channel's dims
          const match = dims.find((d) => existingLocked.includes(d.id));
          if (match) {
            defaults[channel] = match.id;
            continue;
          }
        }
        // Fallback: apply product default
        const defaultDim = getChannelDefaultMainDimension(channel, dims);
        if (defaultDim) defaults[channel] = defaultDim.id;
      }
      setLockedDimByChannel(defaults);
    } finally {
      setLoadingDimensions(false);
    }
  }, [accountId, user?.id, activeChannels, channelReportIds, editingLink?.locked_dimension_ids]);

  useEffect(() => {
    if (step === 2) {
      void loadDimensionsForAllChannels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, loadDimensionsForAllChannels]);

  // ─── Validation ───────────────────────────────────────────────────────────
  const validateStep1 = (): boolean => {
    if (!slug.trim() || slug.length < 3) {
      toast({
        title: "Slug required",
        description: "Slug must be at least 3 characters (lowercase letters, numbers, hyphens).",
        variant: "destructive",
      });
      return false;
    }
    if (!editingLink && !password) {
      toast({
        title: "Password required",
        description: "Please enter a password for the share link.",
        variant: "destructive",
      });
      return false;
    }
    if (password && password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleSlugChange = (value: string) => {
    if (/^[a-z0-9-]*$/.test(value)) setSlug(value);
  };

  const handleNextToStep2 = () => {
    if (!validateStep1()) return;
    setStep(2);
  };

  // ─── Build filters to store ───────────────────────────────────────────────
  const buildFiltersToStore = async (): Promise<DimensionFilters> => {
    if (!slideReportId) return {};

    // Prefer saved view filters when a view is selected
    if (selectedViewId) {
      try {
        const { data: view } = await supabase
          .from("views")
          .select("filter_values")
          .eq("id", selectedViewId)
          .single();
        if (view?.filter_values && typeof view.filter_values === "object") {
          return view.filter_values as DimensionFilters;
        }
      } catch (err) {
        console.error("[CreateShareLinkModal] Error loading view filters:", err);
      }
    }

    // Fall back to current Data Studio filters
    if (currentFilterValues && Object.keys(currentFilterValues).length > 0) {
      if (isChannelBasedFormat(currentFilterValues)) {
        return currentFilterValues;
      }
    }

    return {};
  };

  // ─── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const passwordHash = btoa(password || editingLink?.slug || "");
      const filtersToStore = await buildFiltersToStore();

      // Collect locked dimension IDs from step 2 selections
      const lockedDimensionIds = flattenLockedDimensionIds(lockedDimByChannel);

      const baseData: Record<string, unknown> = {
        dimension_filters: filtersToStore,
        slide_report_id: slideReportId,
        account_id: accountId,
        locked_dimension_ids: lockedDimensionIds,
        view_id: selectedViewId ?? null,
      };

      // Include current date selection
      if (currentDateSelection) {
        baseData.selected_year = currentDateSelection.selectedYear;
        baseData.selected_month = currentDateSelection.selectedMonth;
        baseData.date_preset = currentDateSelection.datePreset;
        if (
          currentDateSelection.customDateRange?.from &&
          currentDateSelection.customDateRange?.to
        ) {
          baseData.custom_date_range = {
            from: formatDateToLocalIso(currentDateSelection.customDateRange.from),
            to: formatDateToLocalIso(currentDateSelection.customDateRange.to),
          };
        }
      }

      if (editingLink) {
        const updateData: Record<string, unknown> = { ...baseData };
        if (password) updateData.password_hash = passwordHash;

        const { error } = await supabase
          .from("share_links")
          .update(updateData)
          .eq("id", editingLink.id);

        if (error) throw error;
        toast({ title: "Share link updated", description: `/${slug} has been updated` });
      } else {
        const insertData: Record<string, unknown> = {
          ...baseData,
          slug: slug.toLowerCase().trim(),
          password_hash: passwordHash,
          created_by: user.id,
          // report_ids kept for backward compatibility (resolved from slideReport)
          report_ids: channelReportIds
            ? Object.values(channelReportIds).filter(Boolean)
            : [],
        };

        const { error } = await supabase.from("share_links").insert(insertData);
        if (error) {
          if (error.code === "23505") {
            toast({
              title: "Slug already exists",
              description: "Please choose a different slug.",
              variant: "destructive",
            });
            setLoading(false);
            return;
          }
          throw error;
        }
        toast({ title: "Share link created", description: `Access at /${slug}` });
      }

      onSuccess();
    } catch (err) {
      console.error("[CreateShareLinkModal] Submit error:", err);
      toast({
        title: "Error",
        description: editingLink ? "Failed to update share link" : "Failed to create share link",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {editingLink ? "Edit Share Link" : "Create Share Link"}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Configure a password-protected link to share this report."
              : "Choose which dimension viewers cannot change per channel."}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={step === 1 ? "font-semibold text-foreground" : ""}>
            1. Link settings
          </span>
          <span>/</span>
          <span className={step === 2 ? "font-semibold text-foreground" : ""}>
            2. Dimension locks
          </span>
        </div>

        {step === 1 ? (
          <div className="space-y-4 py-2">
            {/* Slug */}
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">/</span>
                <Input
                  id="slug"
                  placeholder="my-report"
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  disabled={!!editingLink}
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, hyphens — min. 3 characters.
              </p>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">
                Password{editingLink ? " (leave empty to keep current)" : ""}
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Minimum 6 characters.</p>
            </div>

            {/* Optional view */}
            {slideReportId && availableViews.length > 0 && (
              <div className="space-y-2">
                <Label>View to Share (Optional)</Label>
                <Select
                  value={selectedViewId ?? "none"}
                  onValueChange={(v) => setSelectedViewId(v === "none" ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No view (default filters)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No view (default filters)</SelectItem>
                    {availableViews
                      .filter((v) => v.id !== null && v.id !== "unsaved")
                      .map((view) => (
                        <SelectItem key={view.id} value={view.id!}>
                          {view.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {selectedViewId
                    ? "Selected view's filters will be applied for viewers."
                    : "Viewers can change filters freely."}
                </p>
              </div>
            )}

            {/* Active channels summary */}
            {activeChannels.length > 0 && (
              <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Channels included in this share:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {activeChannels.map((ch) => (
                    <Badge key={ch} variant="secondary">
                      {CHANNEL_LABELS[ch]}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={handleNextToStep2} className="w-full" disabled={loading}>
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              The selected dimension will be locked for viewers — they cannot change it.
              Other filters remain editable.
            </p>

            {loadingDimensions ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading dimensions…</span>
              </div>
            ) : (
              <div className="space-y-3">
                {activeChannels.map((channel) => {
                  const dims = channelDimensions[channel] ?? [];
                  const selectedId = lockedDimByChannel[channel] ?? "";
                  return (
                    <div key={channel} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                        <Label className="text-sm font-medium">
                          {CHANNEL_LABELS[channel]}
                        </Label>
                      </div>
                      <Select
                        value={selectedId || "none"}
                        onValueChange={(v) =>
                          setLockedDimByChannel((prev) => ({
                            ...prev,
                            [channel]: v === "none" ? undefined : v,
                          }))
                        }
                        disabled={dims.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              dims.length === 0
                                ? "No dimensions available"
                                : "Select locked dimension"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No lock (viewers can change)</SelectItem>
                          {dims.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={loading || loadingDimensions}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {editingLink ? "Updating…" : "Creating…"}
                  </>
                ) : editingLink ? (
                  "Update Link"
                ) : (
                  "Create Link"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
