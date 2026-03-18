import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Share2, RefreshCw, Loader2, Database, Layers, ArrowLeft } from "lucide-react";
import { SlideReport } from "@/types/slideReports";

type CurrencyCode = 'AUD' | 'USD';

interface SlideViewHeaderProps {
  selectedTab: string;
  setSelectedTab: (value: string) => void;
  navigate: (path: string) => void;
  accountId: string;
  setIsShareModalOpen: (open: boolean) => void;
  handleRefreshDataWithModal: () => void;
  isRefreshModalOpen: boolean;
  slideReport?: SlideReport | null;
  // Currency switcher (Master Report only)
  displayCurrency?: CurrencyCode;
  onDisplayCurrencyChange?: (currency: CurrencyCode) => void;
  // Data source / dimensions actions
  onDataSources?: () => void;
  onDimensions?: () => void;
}

export function SlideViewHeader({
  navigate,
  accountId,
  setIsShareModalOpen,
  handleRefreshDataWithModal,
  isRefreshModalOpen,
  slideReport,
  displayCurrency,
  onDisplayCurrencyChange,
  onDataSources,
  onDimensions,
}: SlideViewHeaderProps) {
  const showCurrencySwitcher = displayCurrency !== undefined && onDisplayCurrencyChange !== undefined;

  const handleDataSources = () => {
    if (onDataSources) {
      onDataSources();
    } else {
      navigate(accountId ? `/tools/data-sources/${accountId}` : '/tools/data-sources');
    }
  };

  const handleDimensions = () => {
    if (onDimensions) {
      onDimensions();
    } else {
      navigate(accountId ? `/tools/dimensions/${accountId}` : '/tools/dimensions');
    }
  };

  return (
    <header className="h-14 border-b bg-card px-4 flex items-center justify-between shrink-0">
      {/* Left: back + report name */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => navigate('/')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-foreground">
            {slideReport?.name || "Data Studio"}
          </span>
          {slideReport?.last_refreshed_at && (
            <span className="text-[10px] text-muted-foreground">
              Refreshed {new Date(slideReport.last_refreshed_at).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        {showCurrencySwitcher && displayCurrency && onDisplayCurrencyChange && (
          <Select value={displayCurrency} onValueChange={(v) => onDisplayCurrencyChange(v as CurrencyCode)}>
            <SelectTrigger className="h-8 w-[88px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AUD">AUD</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={handleDataSources}
        >
          <Database className="h-3.5 w-3.5" />
          Data Sources
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={handleDimensions}
        >
          <Layers className="h-3.5 w-3.5" />
          Dimensions
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => setIsShareModalOpen(true)}
        >
          <Share2 className="h-3.5 w-3.5" />
          Share
        </Button>

        {!slideReport?.configuration?.isChildReport && (
          <Button
            variant="default"
            size="sm"
            className="h-8 gap-1.5 bg-primary hover:bg-primary/90"
            onClick={handleRefreshDataWithModal}
            disabled={isRefreshModalOpen}
          >
            {isRefreshModalOpen ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh Data
          </Button>
        )}
      </div>
    </header>
  );
}
