/**
 * Rule-based Bid Management Algorithm
 * Analyzes KPIs and provides bid management recommendations for paid ads channels
 * Focus: Achieve max 12% cost of sale through CPC adjustments
 */

import type { MinimalAIData } from './extractMinimalAIData';
import type { ComparisonOption } from '@/components/GenerateAISummaryModal';

export interface BidManagementRecommendations {
  summary: string; // Narrative summary
  costOfSaleAnalysis: {
    current: number;
    target: number;
    status: 'critical' | 'high' | 'moderate' | 'optimal' | 'underperforming';
    recommendedCPCAdjustment: number; // Percentage change
    recommendedCPC: number; // New CPC value (if applicable)
    currentCPC: number;
  };
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    category: string;
    action: string;
    impact: string;
    details: string;
  }>;
  channelInsights: {
    [channel: string]: {
      strengths: string[];
      weaknesses: string[];
      opportunities: string[];
    };
  };
  structuredActions: Array<{
    channel: string;
    action: string;
    adjustment: string; // e.g., "Reduce CPC by 15%"
    expectedImpact: string;
  }>;
}

interface ChannelMetrics {
  impressions: number;
  clicks: number;
  cost: number;
  revenue: number;
  bookings: number;
  ctr: number;
  conversionRate: number;
  cpc: number;
  roas: number;
  costOfSale: number;
  cpm?: number;
}

interface ComparisonMetrics {
  impressions?: number;
  clicks?: number;
  cost?: number;
  revenue?: number;
  bookings?: number;
  ctr?: number;
  conversionRate?: number;
  cpc?: number;
  roas?: number;
  costOfSale?: number;
}

/**
 * Calculate all KPIs from base metrics
 */
function calculateKPIs(metrics: {
  impressions: number;
  clicks: number;
  cost: number;
  revenue: number;
  bookings: number;
}): ChannelMetrics {
  const impressions = metrics.impressions || 0;
  const clicks = metrics.clicks || 0;
  const cost = metrics.cost || 0;
  const revenue = metrics.revenue || 0;
  const bookings = metrics.bookings || 0;

  return {
    impressions,
    clicks,
    cost,
    revenue,
    bookings,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    conversionRate: clicks > 0 ? (bookings / clicks) * 100 : 0,
    cpc: clicks > 0 ? cost / clicks : 0,
    roas: cost > 0 ? revenue / cost : 0,
    costOfSale: revenue > 0 ? (cost / revenue) * 100 : 0,
    cpm: impressions > 0 ? (cost / impressions) * 1000 : 0,
  } as ChannelMetrics & { cpm: number };
}

/**
 * Analyze cost of sale and calculate CPC adjustment
 */
function analyzeCostOfSale(
  currentCOS: number,
  currentCPC: number,
  targetCOS: number = 12
): {
  status: 'critical' | 'high' | 'moderate' | 'optimal' | 'underperforming';
  recommendedCPCAdjustment: number;
  recommendedCPC: number;
} {
  if (currentCOS <= 0 || currentCPC <= 0) {
    return {
      status: 'optimal',
      recommendedCPCAdjustment: 0,
      recommendedCPC: currentCPC,
    };
  }

  // Cost of Sale is too high - need to reduce CPC
  if (currentCOS > targetCOS) {
    const requiredCPC = currentCPC * (targetCOS / currentCOS);
    const adjustment = ((requiredCPC - currentCPC) / currentCPC) * 100;

    let status: 'critical' | 'high' | 'moderate';
    if (currentCOS > 15) {
      status = 'critical';
    } else if (currentCOS > 12) {
      status = 'high';
    } else {
      status = 'moderate';
    }

    return {
      status,
      recommendedCPCAdjustment: adjustment,
      recommendedCPC: requiredCPC,
    };
  }

  // Cost of Sale is optimal
  if (currentCOS >= targetCOS * 0.9 && currentCOS <= targetCOS) {
    return {
      status: 'optimal',
      recommendedCPCAdjustment: 0,
      recommendedCPC: currentCPC,
    };
  }

  // Cost of Sale is too low - opportunity to scale
  const maxCPC = currentCPC * (targetCOS / currentCOS);
  const adjustment = ((maxCPC - currentCPC) / currentCPC) * 100;

  return {
    status: 'underperforming',
    recommendedCPCAdjustment: adjustment,
    recommendedCPC: maxCPC,
  };
}

/**
 * Get channel-specific target cost of sale
 */
function getChannelTargetCOS(channel: 'sem' | 'social' | 'metasearch' | 'overview'): number {
  switch (channel) {
    case 'sem':
      return 10; // More competitive, tighter target
    case 'social':
      return 15; // Acceptable range for social
    case 'metasearch':
      return 10; // Price-sensitive
    default:
      return 12; // Default target
  }
}

/**
 * Analyze channel-specific performance
 */
function analyzeChannelPerformance(
  channel: 'sem' | 'social' | 'metasearch' | 'overview',
  metrics: ChannelMetrics,
  comparison?: ComparisonMetrics
): {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
} {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const opportunities: string[] = [];

  // CTR Analysis
  if (metrics.ctr >= 5) {
    strengths.push(`Excellent CTR of ${metrics.ctr.toFixed(2)}% indicates strong ad relevance`);
  } else if (metrics.ctr < 1) {
    weaknesses.push(`Low CTR of ${metrics.ctr.toFixed(2)}% - review ad relevance and targeting`);
    opportunities.push('Improve ad copy and targeting to increase click-through rate');
  } else if (metrics.ctr < 2) {
    weaknesses.push(`Below-average CTR of ${metrics.ctr.toFixed(2)}% - optimize targeting`);
  }

  // ROAS Analysis
  if (metrics.roas >= 6) {
    strengths.push(`Excellent ROAS of ${metrics.roas.toFixed(2)}x - strong profitability`);
    opportunities.push('Consider scaling budget to capture more volume');
  } else if (metrics.roas < 2) {
    weaknesses.push(`Low ROAS of ${metrics.roas.toFixed(2)}x - profitability concerns`);
    opportunities.push('Reduce spend or improve conversion rates to increase ROAS');
  } else if (metrics.roas >= 4) {
    strengths.push(`Good ROAS of ${metrics.roas.toFixed(2)}x`);
  }

  // Conversion Rate Analysis
  if (metrics.conversionRate >= 5) {
    strengths.push(`Excellent conversion rate of ${metrics.conversionRate.toFixed(2)}%`);
  } else if (metrics.conversionRate < 1) {
    weaknesses.push(`Critical conversion rate of ${metrics.conversionRate.toFixed(2)}% - review landing pages`);
    opportunities.push('Optimize landing pages and user experience to improve conversions');
  } else if (metrics.conversionRate < 2) {
    weaknesses.push(`Low conversion rate of ${metrics.conversionRate.toFixed(2)}% - optimize UX`);
  }

  // Channel-specific analysis
  if (channel === 'sem') {
    if (metrics.cpc > 5) {
      weaknesses.push(`High CPC of $${metrics.cpc.toFixed(2)} - review keyword quality scores`);
      opportunities.push('Focus on improving Quality Score to reduce CPC');
    }
    if (metrics.conversionRate >= 3) {
      strengths.push('Strong conversion performance for SEM');
    }
  } else if (channel === 'social') {
    const cpm = metrics.impressions > 0 ? (metrics.cost / metrics.impressions) * 1000 : 0;
    if (cpm > 20) {
      weaknesses.push(`High CPM of $${cpm.toFixed(2)} - consider audience refinement`);
    }
    if (metrics.ctr >= 2) {
      strengths.push('Good engagement for social ads');
    }
  } else if (channel === 'metasearch') {
    const costPerBooking = metrics.bookings > 0 ? metrics.cost / metrics.bookings : 0;
    if (costPerBooking > 50) {
      weaknesses.push(`High cost per booking of $${costPerBooking.toFixed(2)} - optimize price positioning`);
    }
    if (metrics.roas >= 8) {
      strengths.push('Strong performance for metasearch channel');
    }
  }

  // Comparison analysis
  if (comparison) {
    if (comparison.costOfSale && metrics.costOfSale < comparison.costOfSale) {
      strengths.push(`Cost of sale improved from ${comparison.costOfSale.toFixed(2)}% to ${metrics.costOfSale.toFixed(2)}%`);
    } else if (comparison.costOfSale && metrics.costOfSale > comparison.costOfSale) {
      weaknesses.push(`Cost of sale increased from ${comparison.costOfSale.toFixed(2)}% to ${metrics.costOfSale.toFixed(2)}%`);
    }

    if (comparison.roas && metrics.roas > comparison.roas) {
      strengths.push(`ROAS improved from ${comparison.roas.toFixed(2)}x to ${metrics.roas.toFixed(2)}x`);
    } else if (comparison.roas && metrics.roas < comparison.roas) {
      weaknesses.push(`ROAS declined from ${comparison.roas.toFixed(2)}x to ${metrics.roas.toFixed(2)}x`);
    }
  }

  return { strengths, weaknesses, opportunities };
}

/**
 * Generate channel-specific recommendations
 */
function generateChannelRecommendations(
  channel: 'sem' | 'social' | 'metasearch' | 'overview',
  metrics: ChannelMetrics,
  cosAnalysis: ReturnType<typeof analyzeCostOfSale>,
  comparison?: ComparisonMetrics
): Array<{
  priority: 'high' | 'medium' | 'low';
  category: string;
  action: string;
  impact: string;
  details: string;
}> {
  const recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    category: string;
    action: string;
    impact: string;
    details: string;
  }> = [];

  // Cost of Sale recommendations (highest priority)
  if (cosAnalysis.status === 'critical' || cosAnalysis.status === 'high') {
    recommendations.push({
      priority: 'high',
      category: 'Bid Management',
      action: `Reduce CPC by ${Math.abs(cosAnalysis.recommendedCPCAdjustment).toFixed(1)}%`,
      impact: `Will bring Cost of Sale from ${metrics.costOfSale.toFixed(2)}% to target 12%`,
      details: `Current CPC: $${metrics.cpc.toFixed(2)} → Recommended: $${cosAnalysis.recommendedCPC.toFixed(2)}`,
    });
  } else if (cosAnalysis.status === 'underperforming') {
    recommendations.push({
      priority: 'medium',
      category: 'Bid Management',
      action: `Consider increasing CPC by ${cosAnalysis.recommendedCPCAdjustment.toFixed(1)}%`,
      impact: `Can scale volume while maintaining <12% Cost of Sale`,
      details: `Current CPC: $${metrics.cpc.toFixed(2)} → Max: $${cosAnalysis.recommendedCPC.toFixed(2)}`,
    });
  }

  // Channel-specific recommendations
  if (channel === 'sem') {
    if (metrics.ctr < 2) {
      recommendations.push({
        priority: 'high',
        category: 'Ad Relevance',
        action: 'Improve keyword targeting and ad copy relevance',
        impact: 'Will increase CTR and reduce CPC through Quality Score improvement',
        details: `Current CTR: ${metrics.ctr.toFixed(2)}% - Target: >2%`,
      });
    }
    if (metrics.conversionRate < 2) {
      recommendations.push({
        priority: 'high',
        category: 'Conversion Optimization',
        action: 'Review and optimize landing pages',
        impact: 'Will improve conversion rate and ROAS',
        details: `Current conversion rate: ${metrics.conversionRate.toFixed(2)}%`,
      });
    }
    if (metrics.roas < 3 && cosAnalysis.status !== 'critical') {
      recommendations.push({
        priority: 'medium',
        category: 'Keyword Management',
        action: 'Reduce bids on low-ROAS keywords, increase on high-ROAS',
        impact: 'Will improve overall ROAS and efficiency',
        details: `Current ROAS: ${metrics.roas.toFixed(2)}x`,
      });
    }
  } else if (channel === 'social') {
    const cpm = metrics.impressions > 0 ? (metrics.cost / metrics.impressions) * 1000 : 0;
    if (cpm > 20) {
      recommendations.push({
        priority: 'medium',
        category: 'Audience Optimization',
        action: 'Refine audience targeting to reduce CPM',
        impact: 'Will lower cost per impression and improve efficiency',
        details: `Current CPM: $${cpm.toFixed(2)}`,
      });
    }
    if (metrics.roas < 3) {
      recommendations.push({
        priority: 'high',
        category: 'Ad Set Management',
        action: 'Pause underperforming ad sets, increase budget for high-ROAS audiences',
        impact: 'Will improve overall campaign performance',
        details: `Current ROAS: ${metrics.roas.toFixed(2)}x`,
      });
    }
    if (metrics.ctr < 1.5) {
      recommendations.push({
        priority: 'medium',
        category: 'Creative Optimization',
        action: 'Test new ad creatives to improve engagement',
        impact: 'Will increase CTR and reduce CPC',
        details: `Current CTR: ${metrics.ctr.toFixed(2)}%`,
      });
    }
  } else if (channel === 'metasearch') {
    const costPerBooking = metrics.bookings > 0 ? metrics.cost / metrics.bookings : 0;
    if (costPerBooking > 50) {
      recommendations.push({
        priority: 'high',
        category: 'Price Positioning',
        action: 'Optimize price positioning and bid multipliers',
        impact: 'Will reduce cost per booking and improve efficiency',
        details: `Current cost per booking: $${costPerBooking.toFixed(2)}`,
      });
    }
    if (metrics.conversionRate < 3) {
      recommendations.push({
        priority: 'medium',
        category: 'Hotel Performance',
        action: 'Adjust bid multipliers for high-performing hotels',
        impact: 'Will improve booking conversion rates',
        details: `Current conversion rate: ${metrics.conversionRate.toFixed(2)}%`,
      });
    }
    if (metrics.roas >= 8) {
      recommendations.push({
        priority: 'low',
        category: 'Scaling',
        action: 'Consider increasing budget for high-performing properties',
        impact: 'Can capture more bookings while maintaining efficiency',
        details: `Strong ROAS of ${metrics.roas.toFixed(2)}x indicates scaling opportunity`,
      });
    }
  }

  // Secondary KPI recommendations
  if (metrics.ctr < 1 && channel !== 'metasearch') {
    recommendations.push({
      priority: 'high',
      category: 'Targeting',
      action: 'Review and refine audience/targeting parameters',
      impact: 'Will improve ad relevance and CTR',
      details: `Critical CTR: ${metrics.ctr.toFixed(2)}%`,
    });
  }

  if (metrics.roas < 2) {
    recommendations.push({
      priority: 'high',
      category: 'Performance',
      action: 'Reduce spend or improve conversion to increase ROAS',
      impact: 'Will improve profitability',
      details: `Low ROAS: ${metrics.roas.toFixed(2)}x`,
    });
  }

  return recommendations;
}

/**
 * Generate structured actions for each channel
 */
function generateStructuredActions(
  channel: 'sem' | 'social' | 'metasearch' | 'overview',
  metrics: ChannelMetrics,
  cosAnalysis: ReturnType<typeof analyzeCostOfSale>
): Array<{
  channel: string;
  action: string;
  adjustment: string;
  expectedImpact: string;
}> {
  const actions: Array<{
    channel: string;
    action: string;
    adjustment: string;
    expectedImpact: string;
  }> = [];

  const channelName = channel === 'overview' ? 'All Channels' : channel.toUpperCase();

  // Primary action: CPC adjustment
  if (cosAnalysis.status === 'critical' || cosAnalysis.status === 'high') {
    actions.push({
      channel: channelName,
      action: 'Reduce CPC',
      adjustment: `Reduce by ${Math.abs(cosAnalysis.recommendedCPCAdjustment).toFixed(1)}% ($${metrics.cpc.toFixed(2)} → $${cosAnalysis.recommendedCPC.toFixed(2)})`,
      expectedImpact: `Cost of Sale: ${metrics.costOfSale.toFixed(2)}% → 12% target`,
    });
  } else if (cosAnalysis.status === 'underperforming') {
    actions.push({
      channel: channelName,
      action: 'Increase CPC',
      adjustment: `Increase by ${cosAnalysis.recommendedCPCAdjustment.toFixed(1)}% ($${metrics.cpc.toFixed(2)} → $${cosAnalysis.recommendedCPC.toFixed(2)})`,
      expectedImpact: `Scale volume while maintaining <12% Cost of Sale`,
    });
  }

  // Channel-specific actions
  if (channel === 'sem') {
    if (metrics.ctr < 2) {
      actions.push({
        channel: 'SEM',
        action: 'Improve Keyword Quality',
        adjustment: 'Focus on high-intent keywords, improve ad relevance',
        expectedImpact: `CTR: ${metrics.ctr.toFixed(2)}% → >2% target`,
      });
    }
  } else if (channel === 'social') {
    if (metrics.roas < 3) {
      actions.push({
        channel: 'Social',
        action: 'Optimize Ad Sets',
        adjustment: 'Pause low-ROAS ad sets, scale high performers',
        expectedImpact: `ROAS: ${metrics.roas.toFixed(2)}x → >3x target`,
      });
    }
  } else if (channel === 'metasearch') {
    const costPerBooking = metrics.bookings > 0 ? metrics.cost / metrics.bookings : 0;
    if (costPerBooking > 50) {
      actions.push({
        channel: 'Metasearch',
        action: 'Optimize Price Positioning',
        adjustment: 'Adjust bid multipliers, improve price competitiveness',
        expectedImpact: `Cost per booking: $${costPerBooking.toFixed(2)} → <$50`,
      });
    }
  }

  return actions;
}

/**
 * Generate narrative summary
 */
function generateNarrativeSummary(
  channel: 'sem' | 'social' | 'metasearch' | 'overview',
  metrics: ChannelMetrics,
  cosAnalysis: ReturnType<typeof analyzeCostOfSale>,
  channelInsights: ReturnType<typeof analyzeChannelPerformance>,
  recommendations: ReturnType<typeof generateChannelRecommendations>,
  period: { month: string; year: number },
  comparison?: ComparisonMetrics
): string {
  const channelName = channel === 'overview' ? 'Overview (All Channels)' : channel.toUpperCase();
  let summary = `# Bid Management Analysis - ${channelName}\n\n`;
  summary += `**Period:** ${period.month} ${period.year}\n\n`;

  // Executive Summary
  summary += `## Executive Summary\n\n`;
  if (cosAnalysis.status === 'critical' || cosAnalysis.status === 'high') {
    summary += `Cost of Sale is currently at **${metrics.costOfSale.toFixed(2)}%**, exceeding the 12% target. `;
    summary += `Immediate action is required to reduce CPC by **${Math.abs(cosAnalysis.recommendedCPCAdjustment).toFixed(1)}%** `;
    summary += `to bring Cost of Sale to the target level.\n\n`;
  } else if (cosAnalysis.status === 'optimal') {
    summary += `Cost of Sale is at **${metrics.costOfSale.toFixed(2)}%**, within the optimal range. `;
    summary += `Performance is on target, but there may be opportunities for optimization.\n\n`;
  } else if (cosAnalysis.status === 'underperforming') {
    summary += `Cost of Sale is at **${metrics.costOfSale.toFixed(2)}%**, below target. `;
    summary += `This indicates an opportunity to scale by increasing CPC by up to **${cosAnalysis.recommendedCPCAdjustment.toFixed(1)}%** `;
    summary += `while maintaining the 12% target.\n\n`;
  }

  // Key Metrics
  summary += `## Key Performance Metrics\n\n`;
  summary += `- **Impressions:** ${metrics.impressions.toLocaleString()}\n`;
  summary += `- **Clicks:** ${metrics.clicks.toLocaleString()}\n`;
  summary += `- **Cost:** $${metrics.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
  summary += `- **Revenue:** $${metrics.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
  summary += `- **Bookings:** ${metrics.bookings}\n`;
  summary += `- **CTR:** ${metrics.ctr.toFixed(2)}%\n`;
  summary += `- **CPC:** $${metrics.cpc.toFixed(2)}\n`;
  summary += `- **ROAS:** ${metrics.roas.toFixed(2)}x\n`;
  summary += `- **Conversion Rate:** ${metrics.conversionRate.toFixed(2)}%\n`;
  summary += `- **Cost of Sale:** ${metrics.costOfSale.toFixed(2)}%\n\n`;

  // Cost of Sale Analysis
  summary += `## Cost of Sale Analysis\n\n`;
  summary += `**Current Cost of Sale:** ${metrics.costOfSale.toFixed(2)}%\n`;
  summary += `**Target Cost of Sale:** 12%\n`;
  summary += `**Status:** ${cosAnalysis.status.charAt(0).toUpperCase() + cosAnalysis.status.slice(1)}\n\n`;

  if (cosAnalysis.status === 'critical' || cosAnalysis.status === 'high') {
    summary += `**Required Action:** Reduce CPC by **${Math.abs(cosAnalysis.recommendedCPCAdjustment).toFixed(1)}%**\n`;
    summary += `- Current CPC: $${metrics.cpc.toFixed(2)}\n`;
    summary += `- Recommended CPC: $${cosAnalysis.recommendedCPC.toFixed(2)}\n`;
    summary += `- Expected Impact: Cost of Sale will decrease from ${metrics.costOfSale.toFixed(2)}% to 12%\n\n`;
  } else if (cosAnalysis.status === 'underperforming') {
    summary += `**Opportunity:** Can increase CPC by up to **${cosAnalysis.recommendedCPCAdjustment.toFixed(1)}%**\n`;
    summary += `- Current CPC: $${metrics.cpc.toFixed(2)}\n`;
    summary += `- Maximum CPC: $${cosAnalysis.recommendedCPC.toFixed(2)}\n`;
    summary += `- Expected Impact: Scale volume while maintaining <12% Cost of Sale\n\n`;
  } else {
    summary += `Cost of Sale is within optimal range. No immediate CPC adjustment needed.\n\n`;
  }

  // Channel Insights
  if (channelInsights.strengths.length > 0 || channelInsights.weaknesses.length > 0) {
    summary += `## Channel Performance Insights\n\n`;
    
    if (channelInsights.strengths.length > 0) {
      summary += `**Strengths:**\n`;
      channelInsights.strengths.forEach(strength => {
        summary += `- ${strength}\n`;
      });
      summary += `\n`;
    }

    if (channelInsights.weaknesses.length > 0) {
      summary += `**Areas for Improvement:**\n`;
      channelInsights.weaknesses.forEach(weakness => {
        summary += `- ${weakness}\n`;
      });
      summary += `\n`;
    }

    if (channelInsights.opportunities.length > 0) {
      summary += `**Opportunities:**\n`;
      channelInsights.opportunities.forEach(opportunity => {
        summary += `- ${opportunity}\n`;
      });
      summary += `\n`;
    }
  }

  // Recommendations
  if (recommendations.length > 0) {
    summary += `## Key Recommendations\n\n`;
    const highPriority = recommendations.filter(r => r.priority === 'high');
    const mediumPriority = recommendations.filter(r => r.priority === 'medium');
    const lowPriority = recommendations.filter(r => r.priority === 'low');

    if (highPriority.length > 0) {
      summary += `### High Priority Actions\n\n`;
      highPriority.forEach((rec, idx) => {
        summary += `${idx + 1}. **${rec.action}** (${rec.category})\n`;
        summary += `   - Impact: ${rec.impact}\n`;
        summary += `   - Details: ${rec.details}\n\n`;
      });
    }

    if (mediumPriority.length > 0) {
      summary += `### Medium Priority Actions\n\n`;
      mediumPriority.forEach((rec, idx) => {
        summary += `${idx + 1}. **${rec.action}** (${rec.category})\n`;
        summary += `   - Impact: ${rec.impact}\n`;
        summary += `   - Details: ${rec.details}\n\n`;
      });
    }

    if (lowPriority.length > 0) {
      summary += `### Low Priority Actions\n\n`;
      lowPriority.forEach((rec, idx) => {
        summary += `${idx + 1}. **${rec.action}** (${rec.category})\n`;
        summary += `   - Impact: ${rec.impact}\n`;
        summary += `   - Details: ${rec.details}\n\n`;
      });
    }
  }

  // Comparison Analysis
  if (comparison) {
    summary += `## Comparison Analysis\n\n`;
    if (comparison.costOfSale) {
      const cosChange = metrics.costOfSale - comparison.costOfSale;
      const cosChangePercent = comparison.costOfSale > 0 
        ? ((cosChange / comparison.costOfSale) * 100).toFixed(1)
        : 'N/A';
      summary += `- **Cost of Sale:** ${comparison.costOfSale.toFixed(2)}% → ${metrics.costOfSale.toFixed(2)}% (${cosChange >= 0 ? '+' : ''}${cosChangePercent}%)\n`;
    }
    if (comparison.roas) {
      const roasChange = metrics.roas - comparison.roas;
      summary += `- **ROAS:** ${comparison.roas.toFixed(2)}x → ${metrics.roas.toFixed(2)}x (${roasChange >= 0 ? '+' : ''}${roasChange.toFixed(2)}x)\n`;
    }
    if (comparison.ctr) {
      const ctrChange = metrics.ctr - comparison.ctr;
      summary += `- **CTR:** ${comparison.ctr.toFixed(2)}% → ${metrics.ctr.toFixed(2)}% (${ctrChange >= 0 ? '+' : ''}${ctrChange.toFixed(2)}%)\n`;
    }
    summary += `\n`;
  }

  return summary;
}

/**
 * Generate bid management summary from minimal data
 */
export function generateBidManagementSummary(
  minimalData: MinimalAIData,
  selectedTab: 'overview' | 'metasearch' | 'sem' | 'social',
  comparisonType: ComparisonOption = 'previous_year'
): BidManagementRecommendations {
  const targetCOS = getChannelTargetCOS(selectedTab);
  const channelMetrics: Record<string, ChannelMetrics> = {};

  // Calculate KPIs for each channel in the data
  Object.entries(minimalData.metrics).forEach(([channel, metrics]) => {
    channelMetrics[channel] = calculateKPIs({
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      cost: metrics.cost,
      revenue: metrics.revenue,
      bookings: metrics.bookings,
    });
  });

  // For overview, analyze all channels; for single channel, analyze that channel
  const channelsToAnalyze = selectedTab === 'overview' 
    ? Object.keys(channelMetrics).filter(k => k !== 'overview')
    : [selectedTab];

  // Get primary channel metrics (for single channel tabs, use that channel; for overview, aggregate)
  let primaryMetrics: ChannelMetrics;
  if (selectedTab === 'overview' && channelMetrics.overview) {
    primaryMetrics = channelMetrics.overview;
  } else if (channelMetrics[selectedTab]) {
    primaryMetrics = channelMetrics[selectedTab];
  } else {
    // Fallback: use first available channel
    primaryMetrics = Object.values(channelMetrics)[0] || calculateKPIs({
      impressions: 0,
      clicks: 0,
      cost: 0,
      revenue: 0,
      bookings: 0,
    });
  }

  // Analyze cost of sale
  const cosAnalysis = analyzeCostOfSale(primaryMetrics.costOfSale, primaryMetrics.cpc, targetCOS);

  // Get comparison data and convert to ComparisonMetrics format
  let comparison: ComparisonMetrics | undefined = undefined;
  if (minimalData.comparison) {
    const comparisonData = comparisonType === 'previous_period' || comparisonType === 'both'
      ? minimalData.comparison.previous_period
      : minimalData.comparison.previous_year;
    
    if (comparisonData) {
      comparison = {
        impressions: comparisonData.impressions,
        clicks: comparisonData.clicks,
        cost: comparisonData.cost,
        revenue: comparisonData.revenue,
        bookings: comparisonData.bookings,
        ctr: comparisonData.ctr,
        conversionRate: comparisonData.conversionRate,
        cpc: comparisonData.cpc,
        roas: comparisonData.roas,
        costOfSale: comparisonData.costOfSale,
      };
    }
  }

  // Analyze channel performance
  const channelInsights = analyzeChannelPerformance(selectedTab, primaryMetrics, comparison);

  // Generate recommendations
  const recommendations = generateChannelRecommendations(
    selectedTab,
    primaryMetrics,
    cosAnalysis,
    comparison
  );

  // Generate structured actions
  const structuredActions = generateStructuredActions(selectedTab, primaryMetrics, cosAnalysis);

  // Generate narrative summary
  const summary = generateNarrativeSummary(
    selectedTab,
    primaryMetrics,
    cosAnalysis,
    channelInsights,
    recommendations,
    minimalData.period,
    comparison
  );

  // Build channel insights for all channels
  const allChannelInsights: Record<string, {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
  }> = {};

  channelsToAnalyze.forEach(channel => {
    const metrics = channelMetrics[channel];
    if (metrics) {
      allChannelInsights[channel] = analyzeChannelPerformance(
        channel as 'sem' | 'social' | 'metasearch',
        metrics,
        comparison
      );
    }
  });

  return {
    summary,
    costOfSaleAnalysis: {
      current: primaryMetrics.costOfSale,
      target: targetCOS,
      status: cosAnalysis.status,
      recommendedCPCAdjustment: cosAnalysis.recommendedCPCAdjustment,
      recommendedCPC: cosAnalysis.recommendedCPC,
      currentCPC: primaryMetrics.cpc,
    },
    recommendations,
    channelInsights: allChannelInsights,
    structuredActions,
  };
}
