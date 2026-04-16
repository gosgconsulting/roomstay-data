import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, Edit, Plus, Link as LinkIcon, Copy } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CreateShareLinkModal } from "./CreateShareLinkModal";
import { useUser } from "@/lib/auth";

interface ShareModalProps {
  reportId: string;
  reportName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  channelReportIds?: Partial<Record<'metasearch' | 'sem' | 'social', string | null>>;
}

interface ShareLink {
  id: string;
  slug: string;
  report_ids: string[];
  created_at: string;
  allowed_emails?: string[];
  view_id?: string | null;
  slide_report_id?: string | null;
  locked_dimension_ids?: string[];
  selected_year?: string;
  selected_month?: string;
  custom_date_range?: { from: string; to: string };
  date_preset?: string;
}

export const ShareModal = ({ reportId, reportName, open, onOpenChange, accountId, slideReportId, availableViews = [], currentFilterValues, currentDateSelection, channelReportIds }: ShareModalProps) => {
  const { data: userData } = useUser();
  const user = userData?.user || null;
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingLink, setEditingLink] = useState<ShareLink | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadShareLinks();
    }
  }, [open, accountId]);

  const loadShareLinks = async () => {
    setLoading(true);
    if (!user) return;

    let query = supabase
      .from("share_links")
      .select("*")
      .eq("created_by", user.id);

    // Filter by account if provided
    if (accountId) {
      query = query.eq("account_id", accountId);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    setLoading(false);

    if (error) {
      console.error("Error loading share links:", error);
      return;
    }

    setShareLinks(data || []);
  };

  const handleDeleteLink = async (linkId: string, slug: string) => {
    const { error } = await supabase
      .from("share_links")
      .delete()
      .eq("id", linkId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete share link",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Share link deleted",
      description: `/${slug} has been removed`,
    });

    loadShareLinks();
  };

  const handleCopyLink = (slug: string) => {
    const url = `${window.location.origin}/shared/${slug}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied",
      description: "Share link copied to clipboard",
    });
  };

  const handleEditLink = (link: ShareLink) => {
    setEditingLink(link);
    setShowCreateModal(true);
  };

  const handleCreateSuccess = () => {
    setShowCreateModal(false);
    setEditingLink(null);
    loadShareLinks();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Share Links</DialogTitle>
            <DialogDescription>
              Create email-restricted links to share reports with specific people.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Loading share links...
              </p>
            ) : shareLinks.length > 0 ? (
              <div className="space-y-2">
                <ScrollArea className="h-[300px] rounded-md border p-4">
                  <div className="space-y-3">
                    {shareLinks.map((link) => (
                      <div
                        key={link.id}
                        className="flex items-center justify-between p-3 rounded-md bg-muted/50"
                      >
                        <div className="flex-1 min-w-0 mr-4">
                          <div className="flex items-center gap-2 mb-1">
                            <LinkIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm font-medium truncate">/shared/{link.slug}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {link.report_ids.length} report{link.report_ids.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyLink(link.slug)}
                            title="Copy link"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditLink(link)}
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteLink(link.id, link.slug)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No share links yet. Create your first one below.
              </p>
            )}

            <Button 
              onClick={() => setShowCreateModal(true)} 
              className="w-full gap-2"
            >
              <Plus className="h-4 w-4" />
              Create Link
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CreateShareLinkModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onSuccess={handleCreateSuccess}
        editingLink={editingLink}
        accountId={accountId}
        slideReportId={slideReportId}
        availableViews={availableViews}
        currentFilterValues={currentFilterValues}
        currentDateSelection={currentDateSelection}
        channelReportIds={channelReportIds}
      />
    </>
  );
};
