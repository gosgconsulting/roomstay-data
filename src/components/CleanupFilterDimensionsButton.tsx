import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCcw } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { cleanupExcessiveFilterDimensions } from "@/lib/cleanup-filter-dimensions";

/**
 * Button component to trigger one-time cleanup of excessive filter dimensions
 * This can be removed after the cleanup is complete
 */
export function CleanupFilterDimensionsButton() {
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const { toast } = useToast();
  
  const handleCleanup = async () => {
    setIsCleaningUp(true);
    
    try {
      const result = await cleanupExcessiveFilterDimensions();
      
      if (result.success) {
        toast({
          title: "Cleanup Complete",
          description: `Successfully reset ${result.cleaned} report view(s) to default filter dimensions.`,
          variant: "default",
        });
      } else {
        toast({
          title: "Cleanup Failed",
          description: result.error || "An error occurred during cleanup",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Cleanup Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsCleaningUp(false);
    }
  };
  
  return (
    <Button
      onClick={handleCleanup}
      disabled={isCleaningUp}
      variant="outline"
      size="sm"
      className="gap-2"
    >
      <RefreshCcw className={`h-4 w-4 ${isCleaningUp ? 'animate-spin' : ''}`} />
      {isCleaningUp ? 'Cleaning up...' : 'Cleanup Filter Dimensions'}
    </Button>
  );
}
