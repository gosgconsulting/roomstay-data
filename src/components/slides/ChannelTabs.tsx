/**
 * Channel Tabs Component
 * 
 * Displays tab navigation for switching between different views:
 * - Overview: Aggregated metrics across all channels
 * - Metasearch: Metasearch channel-specific metrics
 * - SEM: SEM channel-specific metrics
 * - Social: Social channel-specific metrics
 * - Budget: Budget analysis (optional)
 * 
 * @module ChannelTabs
 */

import React from 'react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Available tab values
 */
export type TabValue = 'overview' | 'metasearch' | 'sem' | 'social' | 'budget';

/**
 * Props for ChannelTabs component
 */
interface ChannelTabsProps {
  /** Currently selected tab */
  selectedTab: TabValue;
  /** Callback when tab changes */
  onTabChange: (tab: TabValue) => void;
  /** Whether to show the Budget tab (default: true) */
  showBudget?: boolean;
  /** Optional CSS class name */
  className?: string;
}

/**
 * Channel Tabs Component
 * 
 * Renders a tab list for navigating between different channel views.
 * The component is memoized for performance optimization.
 * 
 * @param props - Component props
 * @returns ChannelTabs component
 */
export const ChannelTabs = React.memo<ChannelTabsProps>(
  ({ selectedTab, onTabChange, showBudget = true, className }) => {
    return (
      <TabsList className={className}>
        <TabsTrigger
          value="overview"
          className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
        >
          Overview
        </TabsTrigger>
        <TabsTrigger value="metasearch">Metasearch</TabsTrigger>
        <TabsTrigger value="sem">SEM</TabsTrigger>
        <TabsTrigger value="social">Social</TabsTrigger>
        {showBudget && <TabsTrigger value="budget">Budget</TabsTrigger>}
      </TabsList>
    );
  }
);

ChannelTabs.displayName = 'ChannelTabs';
