import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Share2, Database, Settings2, RefreshCw, Loader2 } from "lucide-react";
import { SlideReport } from "@/types/slideReports";

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
}: SlideViewHeaderProps) {
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
          </TabsList>
        </div>
        <div className="flex items-center gap-2">
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
