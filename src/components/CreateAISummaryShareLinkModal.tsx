import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/lib/auth";
import { Sparkles, Copy, Check } from "lucide-react";

interface CreateAISummaryShareLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  summaryId: string;
  summaryName: string;
  accountId?: string;
}

export const CreateAISummaryShareLinkModal = ({
  open,
  onOpenChange,
  onSuccess,
  summaryId,
  summaryName,
  accountId,
}: CreateAISummaryShareLinkModalProps) => {
  const [slug, setSlug] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [existingLink, setExistingLink] = useState<{ id: string; slug: string } | null>(null);
  const { toast } = useToast();
  const { data: userResult } = useUser();
  const user = userResult?.user;

  useEffect(() => {
    if (open) {
      checkExistingLink();
      setSlug("");
      setPassword("");
      setCopied(false);
    }
  }, [open, summaryId]);

  const checkExistingLink = async () => {
    // Check if there's already a share link for this AI Summary
    const { data } = await supabase
      .from("share_links")
      .select("id, slug")
      .eq("slug", `ai-${summaryId.substring(0, 8)}`)
      .single();

    if (data) {
      setExistingLink(data);
      setSlug(data.slug);
    } else {
      setExistingLink(null);
      // Generate default slug based on summary ID
      setSlug(`ai-${summaryId.substring(0, 8)}`);
    }
  };

  const validateSlug = (value: string) => {
    return /^[a-z0-9-]*$/.test(value);
  };

  const handleSlugChange = (value: string) => {
    if (validateSlug(value)) {
      setSlug(value);
    }
  };

  const copyLink = () => {
    const link = `${window.location.origin}/shared/ai-summary/${slug}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

    if (!existingLink && !password) {
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

    setLoading(true);

    if (!user) {
      setLoading(false);
      return;
    }

    const passwordHash = btoa(password || slug);

    if (existingLink) {
      // Update existing link
      const updateData: any = {
        report_ids: [summaryId], // Store summary ID in report_ids
      };
      
      if (password) {
        updateData.password_hash = passwordHash;
      }

      const { error } = await supabase
        .from("share_links")
        .update(updateData)
        .eq("id", existingLink.id);

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
        description: `Your AI Summary is available at /shared/ai-summary/${slug}`,
      });
    } else {
      // Create new link with slug that will route to SharedAISummary
      const { error } = await supabase
        .from("share_links")
        .insert({
          slug: slug.toLowerCase().trim(),
          password_hash: passwordHash,
          report_ids: [summaryId], // Store summary ID in report_ids
          created_by: user.id,
          account_id: accountId,
        });

      setLoading(false);

      if (error) {
        if (error.code === "23505") {
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
        description: `Your AI Summary is available at /shared/ai-summary/${slug}`,
      });
    }

    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {existingLink ? "Update Share Link" : "Share AI Summary"}
          </DialogTitle>
          <DialogDescription>
            {existingLink 
              ? "Update the password for this share link."
              : "Create a password-protected link to share this AI Summary publicly"
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>AI Summary</Label>
            <div className="rounded-md border p-3 bg-muted/50">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="font-medium">{summaryName}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">/shared/ai-summary/</span>
              <Input
                id="slug"
                placeholder="my-summary"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                disabled={!!existingLink}
                className="flex-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Only lowercase letters, numbers, and hyphens (min. 3 characters)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">
              Password {existingLink && "(leave empty to keep current)"}
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

          {existingLink && (
            <div className="space-y-2">
              <Label>Share Link</Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={`${window.location.origin}/shared/ai-summary/${slug}`}
                  className="flex-1 text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={copyLink}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}

          <Button 
            onClick={handleSubmit} 
            disabled={loading}
            className="w-full"
          >
            {existingLink ? "Update Link" : "Create Link"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
