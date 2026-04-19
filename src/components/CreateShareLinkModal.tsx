import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/lib/auth";
import { Loader2, Eye, EyeOff } from "lucide-react";
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
    has_password?: boolean;
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
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      setPassword(""); // Never pre-fill password for security
      setShowPassword(false);
      setSelectedViewId(editingLink.view_id ?? null);
    } else {
      setSlug("");
      setPassword("");
      setShowPassword(false);
      setSelectedViewId(null);
    }
  }, [open, editingLink]);

  const handleSlugChange = (value: string) => {
    if (/^[a-z0-9-]*$/.test(value)) setSlug(value);
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

  /** Hash the password via the share-link-auth edge function (bcrypt, server-side). */
  const hashPassword = async (plaintext: string): Promise<string> => {
    const { data, error } = await supabase.functions.invoke('share-link-auth', {
      body: { action: 'hash', password: plaintext },
    });
    if (error) throw error;
    if (!data?.hash) throw new Error('Failed to hash password');
    return data.hash as string;
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

    // Password is required for new links. For edits, empty = keep existing password.
    if (!editingLink && !password.trim()) {
      toast({
        title: "Password required",
        description: "Enter a password to protect this share link.",
        variant: "destructive",
      });
      return;
    }

    if (password.trim() && password.trim().length < 4) {
      toast({
        title: "Password too short",
        description: "Password must be at least 4 characters.",
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
        // Clear legacy email allowlist — password-only access now
        allowed_emails: [],
      };

      // Hash the password if provided (bcrypt via edge function)
      if (password.trim()) {
        const hash = await hashPassword(password.trim());
        baseData.password_hash = hash;
      }
      // If editing and no password entered, don't overwrite the existing hash

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
        toast({ title: "Share link created", description: `Access at /shared/${slug}` });
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

  const hasExistingPassword = !!(editingLink?.has_password);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {editingLink ? "Edit Share Link" : "Create Share Link"}
          </DialogTitle>
          <DialogDescription>
            Configure a password-protected link to share this report.
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

          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="share-password">Password</Label>
            <div className="relative">
              <Input
                id="share-password"
                type={showPassword ? "text" : "password"}
                placeholder={editingLink && hasExistingPassword ? "Leave empty to keep current password" : "Enter a password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {editingLink && hasExistingPassword
                ? "Leave empty to keep the existing password. Enter a new password to change it."
                : "Anyone with this password can access the shared report."}
            </p>
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
                {editingLink ? "Updating..." : "Creating..."}
              </>
            ) : editingLink ? (
              "Update Link"
            ) : (
              "Create Link"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
