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
} from "lucide-react";

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
  { value: "budget", label: "Budget", icon: <DollarSign className="h-4 w-4" /> },
  { value: "booking", label: "Booking", icon: <BookOpen className="h-4 w-4" /> },
  { value: "price-check", label: "Price Check", icon: <Tag className="h-4 w-4" /> },
];

interface ReportSidebarProps {
  selectedTab: string;
  onTabChange: (tab: string) => void;
  onDataSources: () => void;
  onDimensions: () => void;
  onForecast: () => void;
  onPriceWidget: () => void;
  reportName?: string;
}

export function ReportSidebar({
  selectedTab,
  onTabChange,
  onDataSources,
  onDimensions,
  onForecast,
  onPriceWidget,
  reportName,
}: ReportSidebarProps) {
  return (
    <aside className="flex flex-col w-56 shrink-0 border-r bg-card h-screen sticky top-0 overflow-y-auto">
      {/* Brand / report name */}
      <div className="px-4 py-5 border-b">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
            <BarChart2 className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-sm truncate leading-tight">
            {reportName || "Data Studio"}
          </span>
        </div>
      </div>

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

      {/* Bottom actions */}
      <div className="px-2 py-3 border-t space-y-0.5">
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

        <p className="mt-3 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Tools
        </p>
        <button
          onClick={onForecast}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors text-left"
        >
          <TrendingUp className="h-4 w-4" />
          Forecast
        </button>
        <button
          onClick={onPriceWidget}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors text-left"
        >
          <LineChart className="h-4 w-4" />
          Price Widget
        </button>
      </div>
    </aside>
  );
}
