import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/lib/auth";
import { Loader2, Plus, X } from "lucide-react";
import { isChannelBasedFormat } from "@/lib/filterFormatUtils";
import { formatDateToLocalIso } from "@/lib/monthUtils";
import {
  getChannelDefaultMainDimension,
  flattenLockedDimensionIds,
  type Channel,
} from "@/lib/dimensionDefaults";
import { loadDimensionsForUser } from "@/lib/dimensionLoader";

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
    allowed_emails?: string[];
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
  channelReportIds?: Partial<Record<Channel, string | null>>;
}

type DimensionFilters = Record<string, Record<string, string[]>>;

const CHANNELS: Channel[] = ['metasearch', 'sem', 'social'];

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

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
  const [slug, setSlug] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [allowedEmails, setAllowedEmails] = useState<string[]>([]);
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { toast } = useToast();
  const { data: userResult } = useUser();
  const user = userResult?.user;

  const activeChannels = CHANNELS.filter(
    (ch) => channelReportIds && channelReportIds[ch]
  );

  // Reset on open
  useEffect(() => {
    if (!open) return;
    if (editingLink) {
      setSlug(editingLink.slug);
      setEmailInput("");
      setAllowedEmails(editingLink.allowed_emails ?? []);
      setSelectedViewId(editingLink.view_id ?? null);
    } else {
      setSlug("");
      setEmailInput("");
      setAllowedEmails([]);
      setSelectedViewId(null);
    }
  }, [open, editingLink]);

  const handleSlugChange = (value: string) => {
    if (/^[a-z0-9-]*$/.test(value)) setSlug(value);
  };

  const handleAddEmail = () => {
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed) return;
    if (!isValidEmail(trimmed)) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    if (allowedEmails.includes(trimmed)) {
      toast({ title: "Already added", description: `${trimmed} is already in the list.`, variant: "destructive" });
      return;
    }
    setAllowedEmails(prev => [...prev, trimmed]);
    setEmailInput("");
  };

  const handleRemoveEmail = (email: string) => {
    setAllowedEmails(prev => prev.filter(e => e !== email));
  };

  const handleEmailKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddEmail();
    }
  };

  // Build filters to store — prefer saved view filters when a view is selected
  const buildFiltersToStore = async (): Promise<DimensionFilters> => {
    if (!slideReportId) return {};

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

    if (currentFilterValues && Object.keys(currentFilterValues).length > 0) {
      if (isChannelBasedFormat(currentFilterValues)) {
        return currentFilterValues;
      }
    }

    return {};
  };

  // Auto-resolve locked dimension IDs from product defaults (no user interaction needed)
  const resolveLockedDimensionIds = async (): Promise<string[]> => {
    if (!accountId || !user?.id) return [];

    try {
      const lockedByChannel: Partial<Record<Channel, string>> = {};

      await Promise.all(
        activeChannels.map(async (channel) => {
          const reportId = channelReportIds?.[channel] ?? undefined;
          try {
            const dims = await loadDimensionsForUser(user.id, reportId, {
              accountId,
              typeFilter: 'text',
            });
            const minDims = dims.map((d) => ({ id: d.id, name: d.name }));
            const defaultDim = getChannelDefaultMainDimension(channel, minDims);
            if (defaultDim) lockedByChannel[channel] = defaultDim.id;
          } catch {
            // Non-fatal
          }
        })
      );

      return flattenLockedDimensionIds(lockedByChannel);
    } catch {
      return [];
    }
  };

  const handleSubmit = async () => {
    if (!user) return;

    // Validation
    if (!slug.trim() || slug.length < 3) {
      toast({
        title: "Slug required",
        description: "Slug must be at least 3 characters (lowercase letters, numbers, hyphens).",
        variant: "destructive",
      });
      return;
    }
    if (allowedEmails.length === 0) {
      toast({
        title: "At least one email required",
        description: "Add at least one email address that can access this link.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const [filtersToStore, lockedDimensionIds] = await Promise.all([
        buildFiltersToStore(),
        resolveLockedDimensionIds(),
      ]);

      const baseData: Record<string, unknown> = {
        dimension_filters: filtersToStore,
        slide_report_id: slideReportId,
        account_id: accountId,
        locked_dimension_ids: lockedDimensionIds,
        view_id: selectedViewId ?? null,
        allowed_emails: allowedEmails,
        // Clear any legacy password hash so the email gate is used
        password_hash: "",
      };

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
        const { error } = await supabase
          .from("share_links")
          .update(baseData)
          .eq("id", editingLink.id);

        if (error) throw error;
        toast({ title: "Share link updated", description: `/${slug} has been updated` });
      } else {
        const insertData: Record<string, unknown> = {
          ...baseData,
          slug: slug.toLowerCase().trim(),
          created_by: user.id,
          report_ids: channelReportIds
            ? Object.values(channelReportIds).filter(Boolean)
            : [],
        };

        const { error } = await supabase.from("share_links").insert(insertData as any);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {editingLink ? "Edit Share Link" : "Create Share Link"}
          </DialogTitle>
          <DialogDescription>
            Configure an email-restricted link to share this report.
          </DialogDescription>
        </DialogHeader>

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

          {/* Email allowlist */}
          <div className="space-y-2">
            <Label>Allowed Emails</Label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="name@example.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={handleEmailKeyDown}
                className="flex-1"
              />
              <Button type="button" variant="outline" size="icon" onClick={handleAddEmail}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Only these email addresses will be able to access the link.
            </p>
            {allowedEmails.length > 0 && (
              <div className="flex flex-col gap-1 mt-1">
                {allowedEmails.map((email) => (
                  <div
                    key={email}
                    className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm bg-muted/40"
                  >
                    <span className="truncate">{email}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveEmail(email)}
                      className="ml-2 text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* View selection */}
          {slideReportId && availableViews.length > 0 && (
            <div className="space-y-2">
              <Label>View to Share <span className="text-muted-foreground font-normal">(Optional)</span></Label>
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

          {/* Active channels preview */}
          {activeChannels.length > 0 && (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium">Channels included in this share: </span>
              {activeChannels.map((ch) => (
                <span key={ch} className="inline-flex items-center rounded-full border px-2 py-0.5 mr-1 bg-background capitalize">
                  {ch}
                </span>
              ))}
            </div>
          )}

          <Button onClick={handleSubmit} className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {editingLink ? "Updating…" : "Creating…"}
              </>
            ) : editingLink ? (
              "Update Link"
            ) : (
              "Next →"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
