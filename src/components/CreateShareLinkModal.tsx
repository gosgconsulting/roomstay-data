import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/lib/auth";

interface CreateShareLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editingLink?: {
    id: string;
    slug: string;
    report_ids: string[];
  } | null;
  accountId?: string;
}

interface Report {
  id: string;
  name: string;
}

export const CreateShareLinkModal = ({
  open,
  onOpenChange,
  onSuccess,
  editingLink,
  accountId
}: CreateShareLinkModalProps) => {
  const [slug, setSlug] = useState("");
  const [password, setPassword] = useState("");
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  // FIX: useUser returns a UseQueryResult; get user from its data
  const { data: userResult } = useUser();
  const user = userResult?.user;

  useEffect(() => {
    if (open) {
      loadReportsAndAutoSelect();
      if (editingLink) {
        setSlug(editingLink.slug);
        setPassword(""); // Don't show existing password
      } else {
        setSlug("");
        setPassword("");
      }
    }
  }, [open, editingLink, accountId]);

  const loadReportsAndAutoSelect = async () => {
    if (!user) return;

    // Check if user is master account
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .single();

    const isMaster = profile?.email === "contact@gosgconsulting.com";

    let allReports: Report[] = [];

    if (isMaster) {
      // Master account: Load ALL reports for the account
      let query = supabase
        .from("reports")
        .select("id, name");

      // Filter by account if provided
      if (accountId) {
        query = query.eq("account_id", accountId);
      }

      const { data, error } = await query.order("name");

      if (error) {
        console.error("Error loading reports:", error);
        return;
      }

      allReports = data || [];
    } else {
      // Regular user: Load own reports for this account only
      let query = supabase
        .from("reports")
        .select("id, name")
        .eq("user_id", user.id);

      // Filter by account if provided (required for regular users)
      if (accountId) {
        query = query.eq("account_id", accountId);
      }

      const { data: ownReports, error: ownError } = await query.order("name");

      if (ownError) {
        console.error("Error loading own reports:", ownError);
        return;
      }

      allReports = ownReports || [];
    }

    setReports(allReports);
    
    // Automatically select all reports from this account
    const allReportIds = allReports.map(r => r.id);
    setSelectedReports(allReportIds);
    
    console.log('[SHARE] Auto-selected all reports for account:', {
      accountId,
      reportCount: allReportIds.length
    });
  };

  const validateSlug = (value: string) => {
    // Only allow lowercase letters, numbers, and hyphens
    return /^[a-z0-9-]*$/.test(value);
  };

  const handleSlugChange = (value: string) => {
    if (validateSlug(value)) {
      setSlug(value);
    }
  };



  const handleSubmit = async () => {
    if (!slug.trim()) {
      toast({
        title: "Slug required",
        description: "Please enter a slug for the share link",
        variant: "destructive",
      });
      return;
    }

    if (slug.length < 3) {
      toast({
        title: "Slug too short",
        description: "Slug must be at least 3 characters long",
        variant: "destructive",
      });
      return;
    }

    if (!editingLink && !password) {
      toast({
        title: "Password required",
        description: "Please enter a password",
        variant: "destructive",
      });
      return;
    }

    if (password && password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters long",
        variant: "destructive",
      });
      return;
    }

    if (selectedReports.length === 0) {
      toast({
        title: "No reports available",
        description: "No reports found for this account. Please create a report first.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    if (!user) return;

    // Simple hash (in production, use proper bcrypt or similar)
    const passwordHash = btoa(password || editingLink?.slug || "");

    if (editingLink) {
      // Update existing link
      const updateData: any = {
        report_ids: selectedReports,
      };
      
      // Only update password if one was provided
      if (password) {
        updateData.password_hash = passwordHash;
      }

      const { error } = await supabase
        .from("share_links")
        .update(updateData)
        .eq("id", editingLink.id);

      setLoading(false);

      if (error) {
        toast({
          title: "Error",
          description: "Failed to update share link",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Share link updated",
        description: `/${slug} has been updated`,
      });
    } else {
      // Create new link
      const { error } = await supabase
        .from("share_links")
        .insert({
          slug: slug.toLowerCase().trim(),
          password_hash: passwordHash,
          report_ids: selectedReports,
          created_by: user.id,
          account_id: accountId,
        });

      setLoading(false);

      if (error) {
        if (error.code === "23505") { // Unique constraint violation
          toast({
            title: "Slug already exists",
            description: "This slug is already in use. Please choose another one.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Error",
            description: "Failed to create share link",
            variant: "destructive",
          });
        }
        return;
      }

      toast({
        title: "Share link created",
        description: `Access your reports at /${slug}`,
      });
    }

    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {editingLink ? "Edit Share Link" : "Create Share Link"}
          </DialogTitle>
          <DialogDescription>
            {editingLink 
              ? "Update the password for this share link. All reports from this account will be shared."
              : "Create a password-protected link to share all reports from this account publicly"
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">/</span>
              <Input
                id="slug"
                placeholder="roomstay"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                disabled={!!editingLink}
                className="flex-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Only lowercase letters, numbers, and hyphens (min. 3 characters)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">
              Password {editingLink && "(leave empty to keep current)"}
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Minimum 6 characters
            </p>
          </div>

          <div className="space-y-2">
            <Label>Reports to Share</Label>
            <div className="rounded-md border p-4 bg-muted/50">
              <p className="text-sm text-muted-foreground mb-2">
                All reports from this account will be shared automatically:
              </p>
              <ul className="text-sm space-y-1">
                {reports.length > 0 ? (
                  reports.map((report) => (
                    <li key={report.id} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                      {report.name}
                    </li>
                  ))
                ) : (
                  <li className="text-muted-foreground">No reports available for this account</li>
                )}
              </ul>
              <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
                💡 This includes the "All Reports" view
              </p>
            </div>
          </div>

          <Button 
            onClick={handleSubmit} 
            disabled={loading}
            className="w-full"
          >
            {editingLink ? "Update Link" : "Create Link"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};