/**
 * Types for the Slides feature
 */

export interface SlideComponent {
  id: string;
  type: 'chart' | 'table' | 'metric' | 'text';
  config: {
    chartType?: 'bar' | 'line' | 'pie' | 'area';
    metrics: string[];
    dimensions: string[];
    filters: Record<string, string[]>;
    title?: string;
    description?: string;
  };
  position: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export interface Slide {
  id: string;
  name: string;
  account_id: string | null;
  data_source_id: string | null;
  report_id: string | null;
  components: SlideComponent[];
  cached_data: Record<string, any>;
  user_id: string;
  created_at: string;
  updated_at: string;
  last_refreshed_at: string | null;
}

export interface SlideWithDetails extends Slide {
  data_source_name?: string;
  report_name?: string;
}
