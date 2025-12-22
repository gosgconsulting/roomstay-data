import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Database, Clock, RefreshCw, Trash2 } from "lucide-react";
import { useCacheStatus, useCacheActions } from "@/hooks/useCacheStatus";
import { formatDistanceToNow } from "date-fns";

interface CacheStatusIndicatorProps {
  reportId: string | null;
  onRefreshData?: () => void;
}

export function CacheStatusIndicator({ reportId, onRefreshData }: CacheStatusIndicatorProps) {
  const cacheStatus = useCacheStatus(reportId);
  const { clearCache, refreshCache } = useCacheActions();

  if (!reportId || cacheStatus.dataSourceCount === 0) {
    return null;
  }

  const handleClearCache = () => {
    clearCache();
    onRefreshData?.();
  };

  const handleRefreshCache = () => {
    refreshCache();
    onRefreshData?.();
  };

  const getCacheStatusText = () => {
    if (cacheStatus.cachedSourceCount === 0) {
      return "No cached data";
    }
    
    if (cacheStatus.cachedSourceCount === cacheStatus.dataSourceCount) {
      return "All data cached";
    }
    
    return `${cacheStatus.cachedSourceCount}/${cacheStatus.dataSourceCount} cached`;
  };

  const getCacheAgeText = () => {
    if (cacheStatus.cacheAge === undefined) {
      return "Unknown age";
    }
    
    if (cacheStatus.cacheAge < 1) {
      return "Just cached";
    }
    
    if (cacheStatus.cacheAge < 60) {
      return `${cacheStatus.cacheAge}m old`;
    }
    
    const hours = Math.floor(cacheStatus.cacheAge / 60);
    if (hours < 24) {
      return `${hours}h old`;
    }
    
    const days = Math.floor(hours / 24);
    return `${days}d old`;
  };

  const getLastSyncText = () => {
    if (!cacheStatus.lastSyncTime) {
      return "Never synced";
    }
    
    try {
      return `Last sync: ${formatDistanceToNow(new Date(cacheStatus.lastSyncTime), { addSuffix: true })}`;
    } catch {
      return "Last sync: Unknown";
    }
  };

  const variant = cacheStatus.isDataCached ? "secondary" : "outline";
  const icon = cacheStatus.isDataCached ? Database : Clock;
  const IconComponent = icon;

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant={variant} className="gap-1 cursor-help">
              <IconComponent className="h-3 w-3" />
              {getCacheStatusText()}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-sm space-y-1">
              <div className="font-medium">Cache Status</div>
              <div>{getCacheStatusText()}</div>
              {cacheStatus.isDataCached && (
                <div className="text-muted-foreground">{getCacheAgeText()}</div>
              )}
              <div className="text-muted-foreground">{getLastSyncText()}</div>
              <div className="text-xs text-muted-foreground mt-2">
                Cached data loads instantly. Use "Sync" to refresh from source.
              </div>
            </div>
          </TooltipContent>
        </Tooltip>

        {cacheStatus.isDataCached && (
          <div className="flex gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={handleRefreshCache}
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-sm">Refresh cached data</div>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                  onClick={handleClearCache}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-sm">Clear cache (force reload from source)</div>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
