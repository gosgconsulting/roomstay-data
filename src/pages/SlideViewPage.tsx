import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { ArrowLeft, RefreshCw, Pencil, Share2, Download, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useSlide, useRefreshSlideData } from "@/hooks/useSlides";
import { SlideRenderer } from "@/components/slides/SlideRenderer";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

export default function SlideViewPage() {
  const navigate = useNavigate();
  const { accountId, slideId } = useParams<{ accountId: string; slideId: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { data: slide, isLoading: slideLoading } = useSlide(slideId || null);
  const refreshSlideData = useRefreshSlideData();

  useEffect(() => {
    checkAuth();
  }, []);

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
      setIsLoading(false);
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

  const handleRefresh = async () => {
    if (!slideId) return;
    await refreshSlideData.mutateAsync(slideId);
  };

  const handleEdit = () => {
    navigate(`/tools/slides/${accountId}/edit/${slideId}`);
  };

  if (isLoading || slideLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Loading slide...</p>
        </div>
      </div>
    );
  }

  if (!slide) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="py-12 text-center">
            <h2 className="text-xl font-semibold mb-2">Slide not found</h2>
            <p className="text-muted-foreground mb-4">
              This slide doesn't exist or you don't have access to it.
            </p>
            <Button onClick={() => navigate(`/tools/slides/${accountId}`)}>
              Back to Slides
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const cachedData = slide.cached_data || {};
  const hasData = cachedData.rows && cachedData.rows.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(`/tools/slides/${accountId}`)}
                title="Back to slides"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold">{slide.name}</h1>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {slide.data_source_name && (
                    <span>Source: {slide.data_source_name}</span>
                  )}
                  {slide.last_refreshed_at && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Data from {format(new Date(slide.last_refreshed_at), "MMM d, h:mm a")}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshSlideData.isPending}
                className="gap-2"
              >
                <RefreshCw
                  className={`h-4 w-4 ${refreshSlideData.isPending ? "animate-spin" : ""}`}
                />
                Refresh Data
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleEdit}
                className="gap-2"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
              <Button variant="outline" size="sm" className="gap-2">
                <Share2 className="h-4 w-4" />
                Share
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {!hasData ? (
          <Card>
            <CardContent className="py-12 text-center">
              <h3 className="text-lg font-medium mb-2">No data cached</h3>
              <p className="text-muted-foreground mb-4">
                Click "Refresh Data" to fetch the latest data from your data source.
              </p>
              <Button
                onClick={handleRefresh}
                disabled={refreshSlideData.isPending}
                className="gap-2"
              >
                <RefreshCw
                  className={`h-4 w-4 ${refreshSlideData.isPending ? "animate-spin" : ""}`}
                />
                Refresh Data Now
              </Button>
            </CardContent>
          </Card>
        ) : slide.components.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <h3 className="text-lg font-medium mb-2">No components configured</h3>
              <p className="text-muted-foreground mb-4">
                Data is cached ({cachedData.rowCount} rows). Edit this slide to add charts and tables.
              </p>
              <div className="flex items-center justify-center gap-4">
                <Badge variant="secondary">
                  {cachedData.rowCount} rows cached
                </Badge>
                <Button onClick={handleEdit} className="gap-2">
                  <Pencil className="h-4 w-4" />
                  Configure Components
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {cachedData.rowCount} rows
              </Badge>
              <Badge variant="outline">
                {slide.components.length} component{slide.components.length !== 1 ? "s" : ""}
              </Badge>
            </div>
            <SlideRenderer
              components={slide.components}
              cachedData={cachedData}
            />
          </div>
        )}
      </main>
    </div>
  );
}
