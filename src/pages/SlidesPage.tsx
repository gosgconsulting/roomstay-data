import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { ArrowLeft, Plus, Presentation, LogOut } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { SlideListItem } from "@/components/slides/SlideListItem";
import { CreateSlideModal } from "@/components/slides/CreateSlideModal";
import { useSlides, useDeleteSlide, useRefreshSlideData } from "@/hooks/useSlides";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SlideWithDetails } from "@/types/slides";

interface Account {
  id: string;
  name: string;
  description: string | null;
}

export default function SlidesPage() {
  const navigate = useNavigate();
  const { accountId } = useParams<{ accountId: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [slideToDelete, setSlideToDelete] = useState<SlideWithDetails | null>(null);
  const [refreshingSlideId, setRefreshingSlideId] = useState<string | null>(null);

  const { data: slides = [], isLoading: slidesLoading } = useSlides(accountId || null);
  const deleteSlide = useDeleteSlide();
  const refreshSlideData = useRefreshSlideData();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (session && accountId) {
      loadAccount();
    }
  }, [session, accountId]);

  const checkAuth = async () => {
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) throw error;

      if (!session) {
        navigate("/auth");
        return;
      }

      setSession(session);
    } catch (error) {
      console.error("Error checking auth:", error);
      toast({
        title: "Authentication Error",
        description: "Please sign in again.",
        variant: "destructive",
      });
      navigate("/auth");
    }
  };

  const loadAccount = async () => {
    if (!session || !accountId) return;

    try {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, name, description")
        .eq("id", accountId)
        .eq("user_id", session.user.id)
        .single();

      if (error) throw error;

      if (!data) {
        toast({
          title: "Account Not Found",
          description: "This account does not exist or you don't have access.",
          variant: "destructive",
        });
        navigate("/");
        return;
      }

      setAccount(data);
      setIsLoading(false);
    } catch (error) {
      console.error("Error loading account:", error);
      toast({
        title: "Error",
        description: "Failed to load account.",
        variant: "destructive",
      });
      navigate("/");
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      navigate("/auth");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const handleViewSlide = (slide: SlideWithDetails) => {
    navigate(`/tools/slides/${accountId}/view/${slide.id}`);
  };

  const handleEditSlide = (slide: SlideWithDetails) => {
    navigate(`/tools/slides/${accountId}/edit/${slide.id}`);
  };

  const handleDeleteSlide = (slide: SlideWithDetails) => {
    setSlideToDelete(slide);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!slideToDelete || !accountId) return;
    
    deleteSlide.mutate({
      id: slideToDelete.id,
      account_id: accountId,
    });
    setDeleteDialogOpen(false);
    setSlideToDelete(null);
  };

  const handleRefreshSlide = async (slide: SlideWithDetails) => {
    setRefreshingSlideId(slide.id);
    try {
      await refreshSlideData.mutateAsync(slide.id);
    } finally {
      setRefreshingSlideId(null);
    }
  };

  const handleSlideCreated = (slide: any) => {
    toast({
      title: "Slide created",
      description: "Your slide has been created. Fetching data...",
    });
    // Refresh data for the new slide
    refreshSlideData.mutate(slide.id);
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/?account=${accountId}`)}
              title="Back to account"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Presentation className="h-6 w-6" />
                Slides
              </h1>
              <p className="text-sm text-muted-foreground">
                {account?.name} • Pre-rendered data snapshots
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium">{session?.user?.email}</p>
              <p className="text-xs text-muted-foreground">Account</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Section Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Your Slides</h2>
              <p className="text-sm text-muted-foreground">
                {slides.length} slide{slides.length !== 1 ? "s" : ""}
              </p>
            </div>
            <Button onClick={() => setCreateModalOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Slide
            </Button>
          </div>

          {/* Slides List */}
          {slidesLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto"></div>
              <p className="text-sm text-muted-foreground mt-2">Loading slides...</p>
            </div>
          ) : slides.length > 0 ? (
            <div className="space-y-4">
              {slides.map((slide) => (
                <SlideListItem
                  key={slide.id}
                  slide={slide}
                  onView={handleViewSlide}
                  onEdit={handleEditSlide}
                  onDelete={handleDeleteSlide}
                  onRefresh={handleRefreshSlide}
                  isRefreshing={refreshingSlideId === slide.id}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Presentation className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No slides yet</h3>
                <p className="text-muted-foreground mb-6">
                  Create your first slide to display pre-rendered data snapshots.
                </p>
                <Button onClick={() => setCreateModalOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Your First Slide
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Create Modal */}
      {session && accountId && (
        <CreateSlideModal
          open={createModalOpen}
          onOpenChange={setCreateModalOpen}
          accountId={accountId}
          userId={session.user.id}
          onSlideCreated={handleSlideCreated}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Slide</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{slideToDelete?.name}"? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
