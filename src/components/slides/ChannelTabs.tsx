/**
 * Channel Tabs Component
 * Displays tab navigation for Overview, Metasearch, SEM, Social, and Budget
 */

import React from 'react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';

export type TabValue = 'overview' | 'metasearch' | 'sem' | 'social' | 'budget';

interface ChannelTabsProps {
  selectedTab: TabValue;
  onTabChange: (tab: TabValue) => void;
  showBudget?: boolean;
  className?: string;
}

/**
 * Channel Tabs Component
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
