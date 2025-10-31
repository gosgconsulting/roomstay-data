import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CreateShareLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editingLink?: {
    id: string;
    slug: string;
    report_ids: string[];
  } | null;
}

interface Report {
  id: string;
  name: string;
}

export const CreateShareLinkModal = ({ 
  open, 
  onOpenChange, 
  onSuccess,
  editingLink 
}: CreateShareLinkModalProps) => {
  const [slug, setSlug] = useState("");
  const [password, setPassword] = useState("");
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadReports();
      if (editingLink) {
        setSlug(editingLink.slug);
        setSelectedReports(editingLink.report_ids);
        setPassword(""); // Don't show existing password
      } else {
        setSlug("");
        setPassword("");
        setSelectedReports([]);
      }
    }
  }, [open, editingLink]);

  const loadReports = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("reports")
      .select("id, name")
      .eq("user_id", user.id)
      .order("name");

    if (error) {
      console.error("Error loading reports:", error);
      return;
    }

    setReports(data || []);
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

  const toggleReport = (reportId: string) => {
    setSelectedReports(prev => 
      prev.includes(reportId)
        ? prev.filter(id => id !== reportId)
        : [...prev, reportId]
    );
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
        title: "No reports selected",
        description: "Please select at least one report",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
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
              ? "Update the reports and password for this share link"
              : "Create a password-protected link to share your reports publicly"
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
            <Label>Select Reports</Label>
            <ScrollArea className="h-[200px] rounded-md border p-4">
              <div className="space-y-3">
                {reports.map((report) => (
                  <div key={report.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={report.id}
                      checked={selectedReports.includes(report.id)}
                      onCheckedChange={() => toggleReport(report.id)}
                    />
                    <label
                      htmlFor={report.id}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {report.name}
                    </label>
                  </div>
                ))}
              </div>
            </ScrollArea>
            {reports.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No reports available
              </p>
            )}
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