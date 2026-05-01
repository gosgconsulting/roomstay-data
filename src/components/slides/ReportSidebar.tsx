import { cn } from "@/lib/utils";
import {
  BarChart2,
  TrendingUp,
  Globe,
  Users,
  DollarSign,
  BookOpen,
  Tag,
  Database,
  Layers,
  LineChart,
  UserCog,
  GalleryHorizontalEnd,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { ApplyViewOptions } from "@/hooks/useDataStudioFilters";

interface View {
  id: string | null;
  name: string;
}

interface Tab {
  value: string;
  label: string;
  icon: React.ReactNode;
}

const TABS: Tab[] = [
  { value: "overview", label: "Overview", icon: <BarChart2 className="h-4 w-4" /> },
  { value: "metasearch", label: "Metasearch", icon: <Globe className="h-4 w-4" /> },
  { value: "sem", label: "SEM", icon: <TrendingUp className="h-4 w-4" /> },
  { value: "social", label: "Social", icon: <Users className="h-4 w-4" /> },
];

interface ReportSidebarProps {
  selectedTab: string;
  onTabChange: (tab: string) => void;
  onDataSources: () => void;
  onDimensions: () => void;
  onTags: () => void;
  onSlides: () => void;
  onUsers: () => void;
  reportName?: string;
  /** View selector (above Reports) */
  selectedViewId: string | null;
  setSelectedViewId: (viewId: string | null) => void;
  availableViews: View[];
  handleApplyView: (viewId: string | null, options?: ApplyViewOptions) => void;
  isReadOnlyMode: boolean;
  /** True for non-owner users with restricted view access — hides admin UI */
  isRestrictedUser?: boolean;
  userLabel?: string;
  onSignOut?: () => Promise<void> | void;
}

export function ReportSidebar({
  selectedTab,
  onTabChange,
  onDataSources,
  onDimensions,
  onTags,
  onSlides,
  onUsers,
  reportName,
  selectedViewId,
  setSelectedViewId,
  availableViews,
  handleApplyView,
  isReadOnlyMode,
  isRestrictedUser = false,
  userLabel,
  onSignOut,
}: ReportSidebarProps) {
  return (
    <aside className="flex flex-col w-56 shrink-0 border-r bg-card h-screen sticky top-0 overflow-y-auto">
      {/* Brand */}
      <div className="px-4 py-5 border-b">
        <div className="flex flex-col leading-tight">
          <span className="font-semibold text-sm truncate">Data Studio</span>
          {userLabel ? (
            <span className="text-xs text-muted-foreground truncate">by {userLabel}</span>
          ) : (
            <span className="text-xs text-muted-foreground truncate">{reportName || "Workspace"}</span>
          )}
        </div>
      </div>

      {/* View: [dropdown] save icon — above Reports */}
      {/* Show view selector for owners (non-read-only) AND restricted/viewer-mode users */}
      {(!isReadOnlyMode || isRestrictedUser) && (
        <div className="px-2 py-3 border-b space-y-2">
          <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            View
          </p>
          <div className="flex items-center gap-1.5 px-1">
            <Select
              value={selectedViewId === null ? "master" : selectedViewId || "master"}
              onValueChange={(value) => {
                if (isReadOnlyMode) return;
                const newViewId = value === "master" ? null : value === "unsaved" ? "unsaved" : value;
                setSelectedViewId(newViewId);
                if (newViewId !== "unsaved") {
                  handleApplyView(
                    newViewId,
                    newViewId
                      ? { skipDateRestore: true, skipComparisonRestore: true }
                      : { skipComparisonRestore: true }
                  );
                }
              }}
              disabled={isReadOnlyMode || isRestrictedUser}
            >
              <SelectTrigger className="h-8 flex-1 min-w-0 text-xs bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableViews.map((view) => (
                  <SelectItem key={view.id === null ? "master" : view.id} value={view.id === null ? "master" : view.id}>
                    {view.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Navigation tabs */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Reports
        </p>
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => onTabChange(tab.value)}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors text-left",
              selectedTab === tab.value
                ? "bg-primary/10 text-primary font-semibold"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Bottom actions — show for owners AND restricted/viewer-mode users (sign out) */}
      {(!isReadOnlyMode || isRestrictedUser) && (
        <div className="px-2 py-3 border-t space-y-0.5">
          {!isRestrictedUser && (
            <>
              <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Manage
              </p>
              <button
                onClick={onDataSources}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors text-left"
              >
                <Database className="h-4 w-4" />
                Data Sources
              </button>
              <button
                onClick={onDimensions}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors text-left"
              >
                <Layers className="h-4 w-4" />
                Dimensions
              </button>
              <button
                onClick={onTags}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors text-left"
              >
                <Tag className="h-4 w-4" />
                Tags
              </button>
              <button
                onClick={onSlides}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors text-left"
              >
                <GalleryHorizontalEnd className="h-4 w-4" />
                Slides
              </button>
              <button
                onClick={onUsers}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors text-left"
              >
                <UserCog className="h-4 w-4" />
                Users
              </button>

              <p className="mt-3 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                DEV
              </p>
              <button
                onClick={() => onTabChange("budget")}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors text-left",
                  selectedTab === "budget"
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <DollarSign className="h-4 w-4" />
                Budget
              </button>
              <button
                disabled
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground/70 cursor-not-allowed text-left"
              >
                <BookOpen className="h-4 w-4" />
                Booking
              </button>
              <button
                disabled
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground/70 cursor-not-allowed text-left"
              >
                <Tag className="h-4 w-4" />
                Prie check
              </button>
              <button
                disabled
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground/70 cursor-not-allowed text-left"
              >
                <LineChart className="h-4 w-4" />
                Widget
              </button>
            </>
          )}
          {onSignOut && (
            <button
              onClick={() => void onSignOut()}
              className="mt-3 w-full px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign out
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
