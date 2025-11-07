import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, MousePointer, Eye, DollarSign, Target, Percent } from "lucide-react";
import { CombinedMetrics } from "@/lib/combined-analytics";

interface CombinedKPIMetricsCardsProps {
  metrics: CombinedMetrics;
  reportCount: number;
  isLoading?: boolean;
}

export const CombinedKPIMetricsCards = ({ 
  metrics, 
  reportCount,
  isLoading = false 
}: CombinedKPIMetricsCardsProps) => {
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
      title: "Impressions",
      value: formatNumber(metrics.impressions),
      icon: Eye,
      color: "text-blue-600"
    },
    {
      title: "Clicks",
      value: formatNumber(metrics.clicks),
      icon: MousePointer,
      color: "text-purple-600"
    },
    {
      title: "CTR",
      value: formatPercentage(metrics.ctr),
      icon: Percent,
      color: "text-cyan-600"
    },
    {
      title: "Conversions",
      value: formatNumber(metrics.conversions),
      icon: Target,
      color: "text-orange-600"
    },
    {
      title: "Conversion Rate",
      value: formatPercentage(metrics.conversionRate),
      icon: TrendingUp,
      color: "text-green-600"
    },
    {
      title: "CPC",
      value: formatCurrency(metrics.cpc),
      icon: DollarSign,
      color: "text-yellow-600"
    },
    {
      title: "Cost",
      value: formatCurrency(metrics.cost),
      icon: DollarSign,
      color: "text-red-600"
    },
    {
      title: "Revenue",
      value: formatCurrency(metrics.revenue),
      icon: DollarSign,
      color: "text-emerald-600"
    },
    {
      title: "ROAS",
      value: formatDecimal(metrics.roas),
      icon: TrendingUp,
      color: "text-green-600"
    },
    {
      title: "Cost of Sale",
      value: formatPercentage(metrics.costOfSale),
      icon: Percent,
      color: "text-amber-600"
    }
  ];

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
        <span className="text-sm text-muted-foreground">
          {reportCount} report{reportCount !== 1 ? 's' : ''} combined
        </span>
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
    </div>
  );
};
