export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      [_ in never]: never
    } & {
      accounts: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          account_id: string | null
          created_at: string
          dimension_item: string
          dimension_name: string
          id: string
          report_id: string | null
          updated_at: string
          user_id: string
          budget_data: Json
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          dimension_item: string
          dimension_name: string
          id?: string
          report_id?: string | null
          updated_at?: string
          user_id: string
          budget_data: Json
        }
        Update: {
          account_id?: string | null
          created_at?: string
          dimension_item?: string
          dimension_name?: string
          id?: string
          report_id?: string | null
          updated_at?: string
          user_id?: string
          budget_data?: Json
        }
        Relationships: []
      }
      cluster_dimensions: {
        Row: {
          account_id: string | null
          created_at: string
          created_dimension_id: string | null
          id: string
          report_id: string | null
          source_dimension_id: string
          user_id: string
          cluster_dimension_name: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          created_dimension_id?: string | null
          id?: string
          report_id?: string | null
          source_dimension_id: string
          user_id: string
          cluster_dimension_name: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          created_dimension_id?: string | null
          id?: string
          report_id?: string | null
          source_dimension_id?: string
          user_id?: string
          cluster_dimension_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      cluster_mappings: {
        Row: {
          cluster_dimension_id: string
          cluster_name: string
          created_at: string
          id: string
          source_values: string[]
          updated_at: string
        }
        Insert: {
          cluster_dimension_id: string
          cluster_name: string
          created_at?: string
          id?: string
          source_values: string[]
          updated_at?: string
        }
        Update: {
          cluster_dimension_id?: string
          cluster_name?: string
          created_at?: string
          id?: string
          source_values?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      data_sources: {
        Row: {
          account_id: string | null
          column_mappings: Json | null
          created_at: string
          csv_url: string | null
          google_sheets_url: string | null
          header_row: number
          id: string
          last_synced_at: string | null
          name: string
          report_id: string
          sheet_name: string | null
          source_type: "google_sheets" | "csv_url"
          spreadsheet_id: string | null
          sync_frequency: "manual" | "daily" | "weekly" | "monthly"
          sync_time: string
          sync_timezone: string
          tab_name: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          column_mappings?: Json | null
          created_at?: string
          csv_url?: string | null
          google_sheets_url?: string | null
          header_row?: number
          id?: string
          last_synced_at?: string | null
          name: string
          report_id: string
          sheet_name?: string | null
          source_type?: "google_sheets" | "csv_url"
          spreadsheet_id?: string | null
          sync_frequency?: "manual" | "daily" | "weekly" | "monthly"
          sync_time?: string
          sync_timezone?: string
          tab_name?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          column_mappings?: Json | null
          created_at?: string
          csv_url?: string | null
          google_sheets_url?: string | null
          header_row?: number
          id?: string
          last_synced_at?: string | null
          name?: string
          report_id?: string
          sheet_name?: string | null
          source_type?: "google_sheets" | "csv_url"
          spreadsheet_id?: string | null
          sync_frequency?: "manual" | "daily" | "weekly" | "monthly"
          sync_time?: string
          sync_timezone?: string
          tab_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      dimension_data: {
        Row: {
          created_at: string
          data_source_id: string
          dimension_values: Json
          id: string
          report_id: string
          row_number: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_source_id: string
          dimension_values: Json
          id?: string
          report_id: string
          row_number: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_source_id?: string
          dimension_values?: Json
          id?: string
          report_id?: string
          row_number?: number
          updated_at?: string
        }
        Relationships: []
      }
      dimension_mappings: {
        Row: {
          account_id: string | null
          created_at: string
          id: string
          report_id: string | null
          source_dimension_id: string
          source_value: string
          target_dimension_id: string
          target_dimension_name: string
          target_value: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          id?: string
          report_id?: string | null
          source_dimension_id: string
          source_value: string
          target_dimension_id: string
          target_dimension_name: string
          target_value: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          id?: string
          report_id?: string | null
          source_dimension_id?: string
          source_value?: string
          target_dimension_id?: string
          target_dimension_name?: string
          target_value?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dimensions: {
        Row: {
          account_id: string | null
          created_at: string
          data_source_id: string | null
          formula: string | null
          id: string
          name: string
          report_id: string | null
          scope: "global" | "custom" | "account"
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          data_source_id?: string | null
          formula?: string | null
          id?: string
          name: string
          report_id?: string | null
          scope?: "global" | "custom" | "account"
          type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string
          data_source_id?: string | null
          formula?: string | null
          id?: string
          name?: string
          report_id?: string | null
          scope?: "global" | "custom" | "account"
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      forecasts: {
        Row: {
          account_id: string | null
          conversion_rate: number | null
          cost_of_sell: number | null
          created_at: string
          id: string
          name: string
          paid_revenue_share: number | null
          report_id: string | null
          revenue_per_month: number | null
          target_average_order_value: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          conversion_rate?: number | null
          cost_of_sell?: number | null
          created_at?: string
          id?: string
          name?: string
          paid_revenue_share?: number | null
          report_id?: string | null
          revenue_per_month?: number | null
          target_average_order_value?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          conversion_rate?: number | null
          cost_of_sell?: number | null
          created_at?: string
          id?: string
          name?: string
          report_id?: string | null
          revenue_per_month?: number | null
          target_average_order_value?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      master_filter_settings: {
        Row: {
          account_id: string | null
          compare_date_from: string | null
          compare_date_to: string | null
          compare_enabled: boolean
          compare_type: string
          created_at: string
          date_preset: string
          date_range_from: string | null
          date_range_to: string | null
          id: string
          selected_dimension_id: string | null
          selected_dimension_values: string[]
          selected_report_ids: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          compare_date_from?: string | null
          compare_date_to?: string | null
          compare_enabled?: boolean
          compare_type?: string
          created_at?: string
          date_preset?: string
          date_range_from?: string | null
          date_range_to?: string | null
          id?: string
          selected_dimension_id?: string | null
          selected_dimension_values?: string[]
          selected_report_ids?: string[]
          updated_at?: string
          user_id?: string
        }
        Update: {
          account_id?: string | null
          compare_date_from?: string | null
          compare_date_to?: string | null
          compare_enabled?: boolean
          compare_type?: string
          created_at?: string
          date_preset?: string
          date_range_from?: string | null
          date_range_to?: string | null
          id?: string
          selected_dimension_id?: string | null
          selected_dimension_values?: string[]
          selected_report_ids?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      monthly_dimension_data: {
        Row: {
          account_id: string | null
          aggregated_metrics: Json
          created_at: string
          data_source_id: string
          date_range_end: string | null
          date_range_start: string | null
          dimension_values: Json
          id: string
          month: number
          report_id: string
          row_count: number
          updated_at: string
          user_id: string | null
          year: number
        }
        Insert: {
          account_id?: string | null
          aggregated_metrics?: Json
          created_at?: string
          data_source_id: string
          date_range_end?: string | null
          date_range_start?: string | null
          dimension_values?: Json
          id?: string
          month: number
          report_id: string
          row_count?: number
          updated_at?: string
          user_id?: string | null
          year: number
        }
        Update: {
          account_id?: string | null
          aggregated_metrics?: Json
          created_at?: string
          data_source_id?: string
          date_range_end?: string | null
          date_range_start?: string | null
          dimension_values?: Json
          id?: string
          month?: number
          report_id: string
          row_count?: number
          updated_at?: string
          user_id?: string | null
          year?: number
        }
        Relationships: []
      }
      reports: {
        Row: {
          account_id: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      report_shares: {
        Row: {
          created_at: string
          created_by: string
          id: string
          report_id: string
          shared_with_email: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          report_id: string
          shared_with_email: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          report_id?: string
          shared_with_email?: string
        }
        Relationships: []
      }
      report_views: {
        Row: {
          account_id: string | null
          active_date_tab: string | null
          breakdown_by_dimensions: string[]
          column_order: string[]
          created_at: string
          date_granularity: string | null
          date_order: string | null
          date_preset: string | null
          date_range_end: string | null
          date_range_start: string | null
          filter_dimensions: string[]
          filter_values: Json
          group_by_dimensions: string[]
          id: string
          is_default: boolean
          kpi_order: string[]
          name: string
          report_id: string
          then_by_dimensions: string[]
          updated_at: string
          user_id: string
          visible_columns: string[]
          visible_dimensions: string[]
          visible_kpis: string[]
        }
        Insert: {
          account_id?: string | null
          active_date_tab?: string | null
          breakdown_by_dimensions?: string[]
          column_order?: string[]
          created_at?: string
          date_granularity?: string | null
          date_order?: string | null
          date_preset?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          filter_dimensions?: string[]
          filter_values?: Json
          group_by_dimensions?: string[]
          id?: string
          is_default?: boolean
          kpi_order?: string[]
          name: string
          report_id: string
          then_by_dimensions?: string[]
          updated_at?: string
          user_id: string
          visible_columns?: string[]
          visible_dimensions?: string[]
          visible_kpis?: string[]
        }
        Update: {
          account_id?: string | null
          active_date_tab?: string | null
          breakdown_by_dimensions?: string[]
          column_order?: string[]
          created_at?: string
          date_granularity?: string | null
          date_order?: string | null
          date_preset?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          filter_dimensions?: string[]
          filter_values?: Json
          group_by_dimensions?: string[]
          id?: string
          is_default?: boolean
          kpi_order?: string[]
          name?: string
          report_id: string
          then_by_dimensions?: string[]
          updated_at?: string
          user_id?: string
          visible_columns?: string[]
          visible_dimensions?: string[]
          visible_kpis?: string[]
        }
        Relationships: []
      }
      sheet_data: {
        Row: {
          created_at: string
          data_source_id: string
          id: string
          row_data: Json
          row_number: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_source_id: string
          id?: string
          row_data: Json
          row_number: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_source_id?: string
          id?: string
          row_data?: Json
          row_number?: number
          updated_at?: string
        }
        Relationships: []
      }
      share_links: {
        Row: {
          account_id: string | null
          created_at: string
          created_by: string
          id: string
          password_hash: string
          report_ids: string[]
          slug: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          password_hash: string
          report_ids?: string[]
          slug: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          password_hash?: string
          report_ids?: string[]
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}