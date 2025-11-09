import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, MousePointer, Eye, DollarSign, Target, Percent, Settings } from "lucide-react";
import { CombinedMetrics } from "@/lib/combined-analytics";
import { useState } from "react";
import { CombinedKPIConfigModal } from "@/components/CombinedKPIConfigModal";

interface CombinedKPIMetricsCardsProps {
  metrics: CombinedMetrics;
  reportCount: number;
  isLoading?: boolean;
  visibleKPIs?: string[];
  onVisibleKPIsChange?: (kpis: string[]) => void;
}

export const CombinedKPIMetricsCards = ({ 
  metrics, 
  reportCount,
  isLoading = false,
  visibleKPIs = ["impressions", "clicks", "ctr", "conversions", "conversionRate", "cpc", "cost", "revenue", "roas", "costOfSale"],
  onVisibleKPIsChange
}: CombinedKPIMetricsCardsProps) => {
  const [showKPIConfig, setShowKPIConfig] = useState(false);
  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(2)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(2)}K`;
    }
    return num.toFixed(0);
  };

  const formatCurrency = (num: number): string => {
    return `$${formatNumber(num)}`;
  };

  const formatPercentage = (num: number): string => {
    return `${num.toFixed(2)}%`;
  };

  const formatDecimal = (num: number): string => {
    return num.toFixed(2);
  };

  const kpiCards = [
    {
      id: "impressions",
      title: "Impressions",
      value: formatNumber(metrics.impressions),
      icon: Eye,
      color: "text-blue-600"
    },
    {
      id: "clicks",
      title: "Clicks",
      value: formatNumber(metrics.clicks),
      icon: MousePointer,
      color: "text-purple-600"
    },
    {
      id: "ctr",
      title: "CTR",
      value: formatPercentage(metrics.ctr),
      icon: Percent,
      color: "text-cyan-600"
    },
    {
      id: "conversions",
      title: "Conversions",
      value: formatNumber(metrics.conversions),
      icon: Target,
      color: "text-orange-600"
    },
    {
      id: "conversionRate",
      title: "Conversion Rate",
      value: formatPercentage(metrics.conversionRate),
      icon: TrendingUp,
      color: "text-green-600"
    },
    {
      id: "cpc",
      title: "CPC",
      value: formatCurrency(metrics.cpc),
      icon: DollarSign,
      color: "text-yellow-600"
    },
    {
      id: "cost",
      title: "Cost",
      value: formatCurrency(metrics.cost),
      icon: DollarSign,
      color: "text-red-600"
    },
    {
      id: "revenue",
      title: "Revenue",
      value: formatCurrency(metrics.revenue),
      icon: DollarSign,
      color: "text-emerald-600"
    },
    {
      id: "roas",
      title: "ROAS",
      value: formatDecimal(metrics.roas),
      icon: TrendingUp,
      color: "text-green-600"
    },
    {
      id: "costOfSale",
      title: "Cost of Sale",
      value: formatPercentage(metrics.costOfSale),
      icon: Percent,
      color: "text-amber-600"
    }
  ].filter(card => visibleKPIs.includes(card.id));

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpiCards.map((card, index) => (
          <Card key={index}>
            <CardContent className="p-6">
              <div className="animate-pulse space-y-2">
                <div className="h-4 bg-muted rounded w-1/2"></div>
                <div className="h-8 bg-muted rounded w-3/4"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Combined Analytics</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowKPIConfig(true)}
            className="h-8 px-3 text-xs"
          >
            <Settings className="h-4 w-4 mr-1" />
            Edit KPIs
          </Button>
          <span className="text-sm text-muted-foreground">
            {reportCount} report{reportCount !== 1 ? 's' : ''} combined
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpiCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <Card key={index} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      {card.title}
                    </p>
                    <p className="text-2xl font-bold">
                      {card.value}
                    </p>
                  </div>
                  <Icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      
      <CombinedKPIConfigModal
        open={showKPIConfig}
        onOpenChange={setShowKPIConfig}
        visibleKPIs={visibleKPIs}
        onSave={(kpis) => onVisibleKPIsChange?.(kpis)}
      />
    </div>
  );
};
