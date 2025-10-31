import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, Mail } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ShareModalProps {
  reportId: string;
  reportName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Share {
  id: string;
  shared_with_email: string;
  created_at: string;
}

export const ShareModal = ({ reportId, reportName, open, onOpenChange }: ShareModalProps) => {
  const [email, setEmail] = useState("");
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadShares();
    }
  }, [open, reportId]);

  const loadShares = async () => {
    const { data, error } = await supabase
      .from("report_shares")
      .select("*")
      .eq("report_id", reportId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading shares:", error);
      return;
    }

    setShares(data || []);
  };

  const handleShare = async () => {
    if (!email.trim()) {
      toast({
        title: "Email required",
        description: "Please enter an email address",
        variant: "destructive",
      });
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    
    const { error } = await supabase
      .from("report_shares")
      .insert({
        report_id: reportId,
        shared_with_email: email.toLowerCase().trim(),
        created_by: userData.user?.id,
      });

    setLoading(false);

    if (error) {
      if (error.code === "23505") { // Unique constraint violation
        toast({
          title: "Already shared",
          description: "This report is already shared with this email",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to share report",
          variant: "destructive",
        });
      }
      return;
    }

    toast({
      title: "Report shared",
      description: `${reportName} is now accessible to ${email}`,
    });

    setEmail("");
    loadShares();
  };

  const handleRemoveShare = async (shareId: string, sharedEmail: string) => {
    const { error } = await supabase
      .from("report_shares")
      .delete()
      .eq("id", shareId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to remove access",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Access removed",
      description: `${sharedEmail} can no longer access this report`,
    });

    loadShares();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Share "{reportName}"</DialogTitle>
          <DialogDescription>
            Grant access to this report by entering an email address. Users will see it in their reports list when logged in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <div className="flex gap-2">
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleShare();
                  }
                }}
              />
              <Button onClick={handleShare} disabled={loading}>
                <Mail className="mr-2 h-4 w-4" />
                Share
              </Button>
            </div>
          </div>

          {shares.length > 0 && (
            <div className="space-y-2">
              <Label>People with access</Label>
              <ScrollArea className="h-[200px] rounded-md border p-4">
                <div className="space-y-2">
                  {shares.map((share) => (
                    <div
                      key={share.id}
                      className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{share.shared_with_email}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveShare(share.id, share.shared_with_email)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {shares.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No one has access yet. Share this report by adding email addresses above.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
