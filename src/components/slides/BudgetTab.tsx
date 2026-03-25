import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent as TabsContentInner } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SlideReport, SlideReportPivotData } from "@/types/slideReports";
import { MONTH_NAMES } from "@/constants/slideViewConstants";
import { formatNumber } from "@/lib/slideViewHelpers";
import { calculateProfit } from "@/lib/budgetCalculations";
import type { ApplyViewOptions } from "@/hooks/useDataStudioFilters";

/** Derive display label and pivot key from row.month (handles "August 2025" or "2025-08"). */
function getMonthDisplayAndKey(rowMonth: string): { display: string; key: string } {
  const trimmed = rowMonth.trim();
  const parts = trimmed.split(' ');
  if (parts.length >= 2 && isNaN(parseInt(parts[0], 10))) {
    const monthName = parts[0];
    const year = parts[1];
    const monthIndex = MONTH_NAMES.indexOf(monthName);
    const key = monthIndex >= 0 ? `${year}-${String(monthIndex + 1).padStart(2, '0')}` : trimmed;
    return { display: `${monthName} ${year}`, key };
  }
  const [y, m] = trimmed.split('-');
  const monthNum = parseInt(m, 10);
  if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12 && y?.length >= 4) {
    const monthName = MONTH_NAMES[monthNum - 1];
    return { display: `${monthName} ${y}`, key: `${y}-${String(monthNum).padStart(2, '0')}` };
  }
  return { display: trimmed, key: trimmed };
}

function BudgetTabSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <Skeleton className="h-5 w-48" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-20" />
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="metasearch">Metasearch</TabsTrigger>
            <TabsTrigger value="sem">SEM</TabsTrigger>
            <TabsTrigger value="social">Social</TabsTrigger>
          </TabsList>
          <div className="space-y-2">
            <div className="flex gap-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex gap-4 py-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}

interface View {
  id: string;
  name: string;
}

interface BudgetMonthlyRow {
  month: string;
  metasearchBudget: number;
  semBudget: number;
  socialBudget: number;
  metasearchActual: number;
  semActual: number;
  socialActual: number;
  metasearch: number;
  sem: number;
  social: number;
}

interface PnlConfig {
  spender: 'client' | 'agency';
  recurrentFee: number;
  percentCost: number;
  percentRevenue: number;
}

interface BudgetTabProps {
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  selectedViewId: string | null;
  setSelectedViewId: (viewId: string | null) => void;
  isReadOnlyMode: boolean;
  views: View[];
  handleApplyView: (viewId: string | null, options?: ApplyViewOptions) => void;
  isLoadingViewBudgets: boolean;
  /** True while display-data API is in flight (avoids glitch when budget data arrives late). */
  isLoadingDisplayData?: boolean;
  budgetMonthlyData: BudgetMonthlyRow[];
  slideReport?: SlideReport | null;
  /** Single source of truth: use when provided (e.g. effectivePivotData from slide_report_channel_* tables). Falls back to slideReport.pivot_data. */
  pivotData?: SlideReportPivotData | null;
  forecastEnabled: boolean;
  setForecastEnabled: (enabled: boolean) => void;
  pnlModeEnabled: boolean;
  setPnlModeEnabled: (enabled: boolean) => void;
  editingBudget: { month: string; channel: string | null } | null;
  editBudgetValue: string;
  handleStartEditBudget: (month: string, channel: string | null, currentBudget: number) => void;
  handleSaveBudget: () => void;
  handleCancelEditBudget: () => void;
  setEditBudgetValue: (value: string) => void;
  editingPnl: { month: string; channel: string | null; field: 'spender' | 'recurrentFee' | 'percentCost' | 'percentRevenue' } | null;
  editPnlValue: string;
  handleStartEditPnl: (month: string, channel: string | null, field: 'spender' | 'recurrentFee' | 'percentCost' | 'percentRevenue', currentValue: string | number) => void;
  handleSavePnl: () => void;
  handleCancelEditPnl: () => void;
  setEditPnlValue: (value: string) => void;
  pnlConfig: Record<string, PnlConfig>;
  setPnlConfig: (config: Record<string, PnlConfig> | ((prev: Record<string, PnlConfig>) => Record<string, PnlConfig>)) => void;
}

export function BudgetTab({
  selectedYear,
  setSelectedYear,
  selectedViewId,
  setSelectedViewId,
  isReadOnlyMode,
  views,
  handleApplyView,
  isLoadingViewBudgets,
  isLoadingDisplayData = false,
  budgetMonthlyData,
  slideReport,
  pivotData: pivotDataProp,
  forecastEnabled,
  setForecastEnabled,
  pnlModeEnabled,
  setPnlModeEnabled,
  editingBudget,
  editBudgetValue,
  handleStartEditBudget,
  handleSaveBudget,
  handleCancelEditBudget,
  setEditBudgetValue,
  editingPnl,
  editPnlValue,
  handleStartEditPnl,
  handleSavePnl,
  handleCancelEditPnl,
  setEditPnlValue,
  pnlConfig,
  setPnlConfig,
}: BudgetTabProps) {
  const renderBudgetTable = (channel: 'overview' | 'metasearch' | 'sem' | 'social') => {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Month</TableHead>
            <TableHead className="text-right">Budget</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            {pnlModeEnabled ? (
              <>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Cost of Sale</TableHead>
                <TableHead className="text-right">Spender</TableHead>
                <TableHead className="text-right">Recurrent Fee</TableHead>
                <TableHead className="text-right">% Ad Spend</TableHead>
                <TableHead className="text-right">% Revenue</TableHead>
                <TableHead className="text-right">Profit</TableHead>
              </>
            ) : forecastEnabled ? (
              <>
                <TableHead className="text-right">CPC</TableHead>
                <TableHead className="text-right">Total Revenue</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Share</TableHead>
                <TableHead className="text-right">Est. Revenue</TableHead>
                <TableHead className="text-right">Est. Share</TableHead>
              </>
            ) : (
              <>
                <TableHead className="text-right">Difference</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">ROAS</TableHead>
                <TableHead className="text-right">Cost of Sale</TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {budgetMonthlyData.map((row) => {
            const pivotData = pivotDataProp ?? (slideReport?.pivot_data as SlideReportPivotData | null);
            const { display: monthDisplay, key: monthKey } = getMonthDisplayAndKey(row.month);
            
            let budgetRow: number;
            let actualRow: number;
            let revenueRow: number;
            let channelConfig: PnlConfig | null = null;
            let isEditing: boolean;
            let isEditingPnl: boolean;
            
            if (channel === 'overview') {
              budgetRow = row.metasearchBudget + row.semBudget + row.socialBudget;
              actualRow = row.metasearchActual + row.semActual + row.socialActual;
              revenueRow = row.metasearch + row.sem + row.social;
              isEditing = editingBudget?.month === row.month && editingBudget?.channel === null;
              isEditingPnl = editingPnl?.month === row.month && editingPnl?.channel === null;
              
              // For overview, use average of all channels
              const avgRecurrentFee = (pnlConfig.metasearch.recurrentFee + pnlConfig.sem.recurrentFee + pnlConfig.social.recurrentFee) / 3;
              const avgPercentCost = (pnlConfig.metasearch.percentCost + pnlConfig.sem.percentCost + pnlConfig.social.percentCost) / 3;
              const avgPercentRevenue = (pnlConfig.metasearch.percentRevenue + pnlConfig.sem.percentRevenue + pnlConfig.social.percentRevenue) / 3;
              const overviewSpender = pnlConfig.metasearch.spender === 'agency' || pnlConfig.sem.spender === 'agency' || pnlConfig.social.spender === 'agency' ? 'agency' : 'client';
              channelConfig = {
                spender: overviewSpender,
                recurrentFee: avgRecurrentFee,
                percentCost: avgPercentCost,
                percentRevenue: avgPercentRevenue,
              };
            } else {
              budgetRow = channel === 'metasearch' ? row.metasearchBudget : channel === 'sem' ? row.semBudget : row.socialBudget;
              actualRow = channel === 'metasearch' ? row.metasearchActual : channel === 'sem' ? row.semActual : row.socialActual;
              revenueRow = channel === 'metasearch' ? row.metasearch : channel === 'sem' ? row.sem : row.social;
              isEditing = editingBudget?.month === row.month && editingBudget?.channel === channel;
              isEditingPnl = editingPnl?.month === row.month && editingPnl?.channel === channel;
              channelConfig = pnlConfig[channel];
            }
            
            const roas = actualRow > 0 ? revenueRow / actualRow : 0;
            const costOfSale = revenueRow > 0 ? (actualRow / revenueRow) * 100 : 0;
            const variance = budgetRow - actualRow;
            
            // Get clicks for CPC calculation
            let clicks = 0;
            if (channel === 'overview') {
              const monthlyMetrics = pivotData?.overview?.monthly?.[monthKey];
              clicks = monthlyMetrics?.clicks || 0;
            } else {
              const channelMetrics = pivotData?.channels?.[channel]?.monthly?.[monthKey];
              clicks = channelMetrics?.clicks || 0;
            }
            const cpc = clicks > 0 ? actualRow / clicks : 0;
            
            // Forecast calculations
            const totalRevenue = revenueRow; // Use actual revenue as total for now
            const revenueShare = totalRevenue > 0 ? (revenueRow / totalRevenue) * 100 : 0;
            const avgRoas = actualRow > 0 ? revenueRow / actualRow : 1;
            const estRevenue = budgetRow * avgRoas;
            const estRevenueShare = totalRevenue > 0 ? (estRevenue / totalRevenue) * 100 : 0;
            
            // PnL calculations - using centralized utility
            const profit = channelConfig 
              ? calculateProfit(actualRow, revenueRow, channelConfig)
              : 0;
            
            return (
              <TableRow key={monthKey}>
                <TableCell className="font-medium">{monthDisplay}</TableCell>
                <TableCell 
                  className={`text-right ${channel === 'overview' ? '' : 'cursor-pointer hover:bg-muted/50'}`}
                  onClick={channel === 'overview' ? undefined : () => handleStartEditBudget(row.month, channel, budgetRow)}
                >
                  {isEditing ? (
                    <Input
                      type="number"
                      value={editBudgetValue}
                      onChange={(e) => setEditBudgetValue(e.target.value)}
                      onBlur={handleSaveBudget}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveBudget();
                        if (e.key === 'Escape') handleCancelEditBudget();
                      }}
                      className="w-24 text-right"
                      autoFocus
                    />
                  ) : (
                    formatNumber(budgetRow, 'currency')
                  )}
                </TableCell>
                <TableCell className="text-right">{formatNumber(actualRow, 'currency')}</TableCell>
                {pnlModeEnabled ? (
                  <>
                    <TableCell className="text-right">{formatNumber(revenueRow, 'currency')}</TableCell>
                    <TableCell className="text-right">{costOfSale.toFixed(2)}%</TableCell>
                    <TableCell 
                      className="text-right cursor-pointer hover:bg-muted/50"
                      onClick={() => channelConfig && handleStartEditPnl(row.month, channel === 'overview' ? null : channel, 'spender', channelConfig.spender)}
                    >
                      {isEditingPnl && editingPnl?.field === 'spender' ? (
                        <Select
                          value={editPnlValue}
                          onValueChange={(value) => {
                            setEditPnlValue(value);
                            handleSavePnl();
                          }}
                          onOpenChange={(open) => !open && handleCancelEditPnl()}
                        >
                          <SelectTrigger className="w-24 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="client">Client</SelectItem>
                            <SelectItem value="agency">Agency</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        channelConfig?.spender === 'client' ? 'Client' : 'Agency'
                      )}
                    </TableCell>
                    <TableCell 
                      className="text-right cursor-pointer hover:bg-muted/50"
                      onClick={() => channelConfig && handleStartEditPnl(row.month, channel === 'overview' ? null : channel, 'recurrentFee', channelConfig.recurrentFee)}
                    >
                      {isEditingPnl && editingPnl?.field === 'recurrentFee' ? (
                        <Input
                          type="number"
                          value={editPnlValue}
                          onChange={(e) => setEditPnlValue(e.target.value)}
                          onBlur={handleSavePnl}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSavePnl();
                            if (e.key === 'Escape') handleCancelEditPnl();
                          }}
                          className="w-24 text-right"
                          autoFocus
                        />
                      ) : (
                        formatNumber(channelConfig?.recurrentFee || 0, 'currency')
                      )}
                    </TableCell>
                    <TableCell 
                      className="text-right cursor-pointer hover:bg-muted/50"
                      onClick={() => channelConfig && handleStartEditPnl(row.month, channel === 'overview' ? null : channel, 'percentCost', channelConfig.percentCost)}
                    >
                      {isEditingPnl && editingPnl?.field === 'percentCost' ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={editPnlValue}
                          onChange={(e) => setEditPnlValue(e.target.value)}
                          onBlur={handleSavePnl}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSavePnl();
                            if (e.key === 'Escape') handleCancelEditPnl();
                          }}
                          className="w-24 text-right"
                          autoFocus
                        />
                      ) : (
                        `${channelConfig?.percentCost.toFixed(2) || 0}%`
                      )}
                    </TableCell>
                    <TableCell 
                      className="text-right cursor-pointer hover:bg-muted/50"
                      onClick={() => channelConfig && handleStartEditPnl(row.month, channel === 'overview' ? null : channel, 'percentRevenue', channelConfig.percentRevenue)}
                    >
                      {isEditingPnl && editingPnl?.field === 'percentRevenue' ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={editPnlValue}
                          onChange={(e) => setEditPnlValue(e.target.value)}
                          onBlur={handleSavePnl}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSavePnl();
                            if (e.key === 'Escape') handleCancelEditPnl();
                          }}
                          className="w-24 text-right"
                          autoFocus
                        />
                      ) : (
                        `${channelConfig?.percentRevenue.toFixed(2) || 0}%`
                      )}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {formatNumber(profit, 'currency')}
                    </TableCell>
                  </>
                ) : forecastEnabled ? (
                  <>
                    <TableCell className="text-right">{formatNumber(cpc, 'currency', undefined, 2)}</TableCell>
                    <TableCell className="text-right">{formatNumber(totalRevenue, 'currency')}</TableCell>
                    <TableCell className="text-right">{formatNumber(revenueRow, 'currency')}</TableCell>
                    <TableCell className="text-right">{revenueShare.toFixed(1)}%</TableCell>
                    <TableCell className="text-right">{formatNumber(estRevenue, 'currency')}</TableCell>
                    <TableCell className="text-right">{estRevenueShare.toFixed(1)}%</TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className={`text-right font-medium ${variance >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {variance >= 0 ? '+' : ''}{formatNumber(variance, 'currency')}
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(revenueRow, 'currency')}</TableCell>
                    <TableCell className="text-right">{roas.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{costOfSale.toFixed(2)}%</TableCell>
                  </>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  };

  return (
    <TabsContent value="budget" className="space-y-6">
      {/* Budget Filters: Year and View */}
      <div className="flex items-end justify-end gap-6">
        {/* Year Filter */}
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Year:
          </span>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[130px] bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              <SelectItem value="2024">2024</SelectItem>
              <SelectItem value="2025">2025</SelectItem>
              <SelectItem value="2026">2026</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* View selector */}
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">View:</span>
          <Select 
            value={selectedViewId === null ? 'master' : selectedViewId || 'master'} 
            onValueChange={(value) => {
              if (isReadOnlyMode) return;
              const newViewId = value === 'master' ? null : (value === 'unsaved' ? 'unsaved' : value);
              setSelectedViewId(newViewId);
              // Immediately apply the view filters (unless it's Unsaved)
              if (newViewId !== 'unsaved') {
                handleApplyView(
                  newViewId,
                  newViewId ? { skipDateRestore: true } : undefined
                );
              }
            }}
            disabled={isReadOnlyMode}
          >
            <SelectTrigger className="w-[150px] text-sm bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="master">Master</SelectItem>
              {views.map((view) => (
                <SelectItem key={view.id} value={view.id}>
                  {view.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {(isLoadingViewBudgets || isLoadingDisplayData) ? (
        <BudgetTabSkeleton />
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">Monthly Budget Breakdown {selectedYear === 'all' ? '(All Years)' : `(${selectedYear})`}</CardTitle>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="forecast-toggle"
                  checked={forecastEnabled}
                  onCheckedChange={setForecastEnabled}
                  disabled={pnlModeEnabled}
                />
                <Label htmlFor="forecast-toggle" className="text-sm cursor-pointer">
                  Forecast Mode
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="pnl-toggle"
                  checked={pnlModeEnabled}
                  onCheckedChange={setPnlModeEnabled}
                  disabled={forecastEnabled}
                />
                <Label htmlFor="pnl-toggle" className="text-sm cursor-pointer">
                  PnL Mode
                </Label>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="metasearch">Metasearch</TabsTrigger>
                <TabsTrigger value="sem">SEM</TabsTrigger>
                <TabsTrigger value="social">Social</TabsTrigger>
              </TabsList>
              
              <TabsContentInner value="overview">
                {renderBudgetTable('overview')}
              </TabsContentInner>
              
              <TabsContentInner value="metasearch">
                {renderBudgetTable('metasearch')}
              </TabsContentInner>
              
              <TabsContentInner value="sem">
                {renderBudgetTable('sem')}
              </TabsContentInner>
              
              <TabsContentInner value="social">
                {renderBudgetTable('social')}
              </TabsContentInner>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </TabsContent>
  );
}