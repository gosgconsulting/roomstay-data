import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LoadingToastProps {
  isVisible: boolean;
  loadingComponents: Set<string>;
  onDismiss?: () => void;
}

export const LoadingToast = ({ isVisible, loadingComponents, onDismiss }: LoadingToastProps) => {
  const [progress, setProgress] = useState(0);
  const [isDismissed, setIsDismissed] = useState(false);

  // Reset dismissed state when loading starts
  useEffect(() => {
    if (isVisible && loadingComponents.size > 0) {
      setIsDismissed(false);
    }
  }, [isVisible, loadingComponents.size]);

  // Auto-hide when no components are loading
  useEffect(() => {
    if (loadingComponents.size === 0 && isVisible) {
      const timer = setTimeout(() => {
        setIsDismissed(true);
      }, 1000); // Hide after 1 second when loading completes
      
      return () => clearTimeout(timer);
    }
  }, [loadingComponents.size, isVisible]);

  // Simulate progress based on loading components
  useEffect(() => {
    if (!isVisible || isDismissed) {
      setProgress(0);
      return;
    }

    const totalComponents = 3; // metrics, chart, table
    const loadedComponents = totalComponents - loadingComponents.size;
    const targetProgress = (loadedComponents / totalComponents) * 100;

    // Smooth progress animation
    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev < targetProgress) {
          return Math.min(prev + 2, targetProgress);
        }
        return prev;
      });
    }, 50);

    return () => clearInterval(timer);
  }, [isVisible, loadingComponents.size, isDismissed]);

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  if (!isVisible || isDismissed || loadingComponents.size === 0) {
    return null;
  }

  const getLoadingMessage = () => {
    const components = Array.from(loadingComponents);
    if (components.length === 0) {
      return "Loading complete";
    }
    if (components.length === 1) {
      return `Loading ${components[0]}...`;
    }
    return `Loading ${components.length} components...`;
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-2 slide-in-from-right-2">
      <Card className="w-80 shadow-lg border-l-4 border-l-primary">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
              <span className="text-sm font-medium">Loading Report Data</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 hover:bg-muted"
              onClick={handleDismiss}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{getLoadingMessage()}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
          
          {loadingComponents.size > 1 && (
            <div className="mt-2 text-xs text-muted-foreground">
              <div className="flex flex-wrap gap-1">
                {Array.from(loadingComponents).map((component) => (
                  <span key={component} className="bg-muted px-2 py-1 rounded text-xs">
                    {component}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
