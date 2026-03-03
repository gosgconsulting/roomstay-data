import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Share2, Database, Settings2, RefreshCw, Loader2 } from "lucide-react";
import { SlideReport } from "@/types/slideReports";

type CurrencyCode = 'AUD' | 'USD';

interface SlideViewHeaderProps {
  selectedTab: string;
  setSelectedTab: (value: string) => void;
  navigate: (path: string) => void;
  accountId: string;
  setIsShareModalOpen: (open: boolean) => void;
  setIsDataModalOpen: (open: boolean) => void;
  setIsEditSourceOpen: (open: boolean) => void;
  handleRefreshDataWithModal: () => void;
  isRefreshModalOpen: boolean;
  slideReport?: SlideReport | null;
  // Currency switcher (Master Report only)
  displayCurrency?: CurrencyCode;
  onDisplayCurrencyChange?: (currency: CurrencyCode) => void;
  audPerUsd?: number | null;
  isFxLoading?: boolean;
  onRefreshFxRate?: () => void;
}

export function SlideViewHeader({
  selectedTab,
  setSelectedTab,
  navigate,
  accountId,
  setIsShareModalOpen,
  setIsDataModalOpen,
  setIsEditSourceOpen,
  handleRefreshDataWithModal,
  isRefreshModalOpen,
  slideReport,
  displayCurrency,
  onDisplayCurrencyChange,
  audPerUsd,
  isFxLoading,
  onRefreshFxRate,
}: SlideViewHeaderProps) {
  const showCurrencySwitcher = slideReport?.name === 'Master Report';

  return (
    <div className="border-b bg-card px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate(`/tools/reports/${accountId}`)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          {/* Tabs in header */}
          <TabsList>
            <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Overview</TabsTrigger>
            <TabsTrigger value="metasearch">Metasearch</TabsTrigger>
            <TabsTrigger value="sem">SEM</TabsTrigger>
            <TabsTrigger value="social">Social</TabsTrigger>
            <TabsTrigger value="budget">Budget</TabsTrigger>
            <TabsTrigger value="booking">Booking</TabsTrigger>
            <TabsTrigger value="price-check">Price Check</TabsTrigger>
          </TabsList>
        </div>
        <div className="flex items-center gap-2">
          {showCurrencySwitcher && displayCurrency && onDisplayCurrencyChange && (
            <div className="flex items-center gap-2 mr-2">
              <span className="text-xs text-muted-foreground">Currency</span>
              <Select value={displayCurrency} onValueChange={(v) => onDisplayCurrencyChange(v as CurrencyCode)}>
                <SelectTrigger className="h-8 w-[88px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUD">AUD</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>
                  1 USD = {typeof audPerUsd === 'number' && isFinite(audPerUsd) ? audPerUsd.toFixed(4) : '-'} AUD
                </span>
                {onRefreshFxRate && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={onRefreshFxRate}
                    disabled={!!isFxLoading}
                    title="Refresh exchange rate"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isFxLoading ? 'animate-spin' : ''}`} />
                  </Button>
                )}
              </div>
            </div>
          )}

          {slideReport?.last_refreshed_at && (
            <span className="text-xs text-muted-foreground mr-2">
              Last refreshed: {new Date(slideReport.last_refreshed_at).toLocaleString()}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => setIsShareModalOpen(true)}>
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsDataModalOpen(true)}>
            <Database className="h-4 w-4 mr-2" />
            Data
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsEditSourceOpen(true)}>
            <Settings2 className="h-4 w-4 mr-2" />
            Edit Source
          </Button>
          {/* Only show Refresh Data button for master reports (not child reports) */}
          {!slideReport?.configuration?.isChildReport && (
            <Button 
              variant="default" 
              size="sm" 
              onClick={handleRefreshDataWithModal}
              disabled={isRefreshModalOpen}
              className="bg-primary hover:bg-primary/90"
            >
              {isRefreshModalOpen ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh Data
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}