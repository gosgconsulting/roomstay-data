import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface ChannelTabsListProps {
  selectedChannels: ('metasearch' | 'sem' | 'social')[];
  activeChannelTab: 'metasearch' | 'sem' | 'social' | null;
  setActiveChannelTab: (channel: 'metasearch' | 'sem' | 'social') => void;
  getChannelBadgeCount?: (channel: string) => number;
}

export function ChannelTabsList({
  selectedChannels,
  activeChannelTab,
  setActiveChannelTab,
  getChannelBadgeCount,
}: ChannelTabsListProps) {
  return (
    <div className="w-48 border-r pr-4">
      <ScrollArea className="h-full">
        <div className="space-y-1">
          {selectedChannels.map(channel => {
            const badgeCount = getChannelBadgeCount?.(channel) || 0;
            return (
              <button
                key={channel}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between",
                  activeChannelTab === channel
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                )}
                onClick={() => setActiveChannelTab(channel)}
              >
                <span className="truncate capitalize">{channel}</span>
                {badgeCount > 0 && (
                  <span className="text-xs opacity-70">{badgeCount}</span>
                )}
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
