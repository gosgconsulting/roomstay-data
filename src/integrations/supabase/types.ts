export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_summary_budgets: {
        Row: {
          account_id: string | null
          ai_summary_card_id: string
          budget_amount: number
          created_at: string
          id: string
          month_key: string
          report_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          ai_summary_card_id: string
          budget_amount?: number
          created_at?: string
          id?: string
          month_key: string
          report_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          ai_summary_card_id?: string
          budget_amount?: number
          created_at?: string
          id?: string
          month_key?: string
          report_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_summary_budgets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_summary_budgets_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_summary_cards: {
        Row: {
          account_id: string | null
          ai_prompt: string
          cached_budget_data: Json | null
          cached_pivot_data: Json | null
          created_at: string
          generated_summary: string | null
          id: string
          last_generated_at: string | null
          name: string
          pivot_data_refreshed_at: string | null
          report_configs: Json
          report_ids: string[]
          selected_metrics: string[]
          since_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          ai_prompt: string
          cached_budget_data?: Json | null
          cached_pivot_data?: Json | null
          created_at?: string
          generated_summary?: string | null
          id?: string
          last_generated_at?: string | null
          name?: string
          pivot_data_refreshed_at?: string | null
          report_configs?: Json
          report_ids?: string[]
          selected_metrics?: string[]
          since_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          ai_prompt?: string
          cached_budget_data?: Json | null
          cached_pivot_data?: Json | null
          created_at?: string
          generated_summary?: string | null
          id?: string
          last_generated_at?: string | null
          name?: string
          pivot_data_refreshed_at?: string | null
          report_configs?: Json
          report_ids?: string[]
          selected_metrics?: string[]
          since_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_summary_cards_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_summary_forecasts: {
        Row: {
          ai_summary_card_id: string
          created_at: string
          daily_rate: number
          id: string
          name: string
          occupancy_rate: number
          rooms: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_summary_card_id: string
          created_at?: string
          daily_rate?: number
          id?: string
          name: string
          occupancy_rate?: number
          rooms?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_summary_card_id?: string
          created_at?: string
          daily_rate?: number
          id?: string
          name?: string
          occupancy_rate?: number
          rooms?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_summary_forecasts_ai_summary_card_id_fkey"
            columns: ["ai_summary_card_id"]
            isOneToOne: false
            referencedRelation: "ai_summary_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          account_id: string | null
          budget_data: Json
          created_at: string | null
          dimension_item: string
          dimension_name: string
          id: string
          report_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          budget_data?: Json
          created_at?: string | null
          dimension_item: string
          dimension_name: string
          id?: string
          report_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_id?: string | null
          budget_data?: Json
          created_at?: string | null
          dimension_item?: string
          dimension_name?: string
          id?: string
          report_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      cluster_dimensions: {
        Row: {
          account_id: string | null
          cluster_dimension_name: string
          created_at: string
          created_dimension_id: string | null
          id: string
          report_id: string | null
          source_dimension_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          cluster_dimension_name: string
          created_at?: string
          created_dimension_id?: string | null
          id?: string
          report_id?: string | null
          source_dimension_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          cluster_dimension_name?: string
          created_at?: string
          created_dimension_id?: string | null
          id?: string
          report_id?: string | null
          source_dimension_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cluster_dimensions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cluster_dimensions_created_dimension_id_fkey"
            columns: ["created_dimension_id"]
            isOneToOne: false
            referencedRelation: "dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cluster_dimensions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cluster_dimensions_source_dimension_id_fkey"
            columns: ["source_dimension_id"]
            isOneToOne: false
            referencedRelation: "dimensions"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "cluster_mappings_cluster_dimension_id_fkey"
            columns: ["cluster_dimension_id"]
            isOneToOne: false
            referencedRelation: "cluster_dimensions"
            referencedColumns: ["id"]
          },
        ]
      }
      data_sources: {
        Row: {
          column_mappings: Json | null
          created_at: string
          csv_url: string | null
          google_sheets_url: string | null
          header_row: number
          id: string
          last_synced_at: string | null
          name: string
          report_id: string
          source_type: Database["public"]["Enums"]["data_source_type"]
          spreadsheet_id: string | null
          sync_frequency: string | null
          sync_time: string | null
          sync_timezone: string | null
          tab_name: string | null
          updated_at: string
        }
        Insert: {
          column_mappings?: Json | null
          created_at?: string
          csv_url?: string | null
          google_sheets_url?: string | null
          header_row?: number
          id?: string
          last_synced_at?: string | null
          name: string
          report_id: string
          source_type?: Database["public"]["Enums"]["data_source_type"]
          spreadsheet_id?: string | null
          sync_frequency?: string | null
          sync_time?: string | null
          sync_timezone?: string | null
          tab_name?: string | null
          updated_at?: string
        }
        Update: {
          column_mappings?: Json | null
          created_at?: string
          csv_url?: string | null
          google_sheets_url?: string | null
          header_row?: number
          id?: string
          last_synced_at?: string | null
          name?: string
          report_id?: string
          source_type?: Database["public"]["Enums"]["data_source_type"]
          spreadsheet_id?: string | null
          sync_frequency?: string | null
          sync_time?: string | null
          sync_timezone?: string | null
          tab_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_sources_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
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
          dimension_values?: Json
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
        Relationships: [
          {
            foreignKeyName: "dimension_data_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dimension_data_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      dimensions: {
        Row: {
          account_id: string | null
          conditions: Json | null
          created_at: string
          data_source_id: string | null
          formula: string | null
          formula_condition_pairs: Json | null
          id: string
          name: string
          report_id: string | null
          scope: string | null
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          conditions?: Json | null
          created_at?: string
          data_source_id?: string | null
          formula?: string | null
          formula_condition_pairs?: Json | null
          id?: string
          name: string
          report_id?: string | null
          scope?: string | null
          type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          conditions?: Json | null
          created_at?: string
          data_source_id?: string | null
          formula?: string | null
          formula_condition_pairs?: Json | null
          id?: string
          name?: string
          report_id?: string | null
          scope?: string | null
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dimensions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dimensions_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dimensions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_services: {
        Row: {
          budget_payer: string
          commission_rate: number
          cost_of_sell: number
          created_at: string | null
          forecast_id: string
          id: string
          name: string
          one_off_fee: number
          percent_cost: number
          percent_revenue: number
          recurrent_fee: number
          updated_at: string | null
          user_id: string
          weight: number
        }
        Insert: {
          budget_payer?: string
          commission_rate?: number
          cost_of_sell?: number
          created_at?: string | null
          forecast_id: string
          id?: string
          name: string
          one_off_fee?: number
          percent_cost?: number
          percent_revenue?: number
          recurrent_fee?: number
          updated_at?: string | null
          user_id: string
          weight?: number
        }
        Update: {
          budget_payer?: string
          commission_rate?: number
          cost_of_sell?: number
          created_at?: string | null
          forecast_id?: string
          id?: string
          name?: string
          one_off_fee?: number
          percent_cost?: number
          percent_revenue?: number
          recurrent_fee?: number
          updated_at?: string | null
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "forecast_services_forecast_id_fkey"
            columns: ["forecast_id"]
            isOneToOne: false
            referencedRelation: "forecasts"
            referencedColumns: ["id"]
          },
        ]
      }
      forecasts: {
        Row: {
          average_daily_rate: number | null
          conversion_rate: number | null
          cost_of_sell: number | null
          created_at: string | null
          direct_bookings_percentage: number | null
          direct_bookings_target: number | null
          email: string | null
          id: string
          name: string
          occupancy_rate: number | null
          report_id: string | null
          rooms: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          average_daily_rate?: number | null
          conversion_rate?: number | null
          cost_of_sell?: number | null
          created_at?: string | null
          direct_bookings_percentage?: number | null
          direct_bookings_target?: number | null
          email?: string | null
          id?: string
          name?: string
          occupancy_rate?: number | null
          report_id?: string | null
          rooms?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          average_daily_rate?: number | null
          conversion_rate?: number | null
          cost_of_sell?: number | null
          created_at?: string | null
          direct_bookings_percentage?: number | null
          direct_bookings_target?: number | null
          email?: string | null
          id?: string
          name?: string
          occupancy_rate?: number | null
          report_id?: string | null
          rooms?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "forecasts_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      master_filter_settings: {
        Row: {
          account_id: string | null
          compare_date_from: string | null
          compare_date_to: string | null
          compare_enabled: boolean | null
          compare_type: string | null
          created_at: string | null
          date_preset: string | null
          date_range_from: string | null
          date_range_to: string | null
          id: string
          selected_dimension_id: string | null
          selected_dimension_values: string[] | null
          selected_report_ids: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          compare_date_from?: string | null
          compare_date_to?: string | null
          compare_enabled?: boolean | null
          compare_type?: string | null
          created_at?: string | null
          date_preset?: string | null
          date_range_from?: string | null
          date_range_to?: string | null
          id?: string
          selected_dimension_id?: string | null
          selected_dimension_values?: string[] | null
          selected_report_ids?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_id?: string | null
          compare_date_from?: string | null
          compare_date_to?: string | null
          compare_enabled?: boolean | null
          compare_type?: string | null
          created_at?: string | null
          date_preset?: string | null
          date_range_from?: string | null
          date_range_to?: string | null
          id?: string
          selected_dimension_id?: string | null
          selected_dimension_values?: string[] | null
          selected_report_ids?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_filter_settings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_dimension_data: {
        Row: {
          aggregated_metrics: Json
          created_at: string | null
          data_source_id: string
          date_range_end: string | null
          date_range_start: string | null
          dimension_values: Json
          id: string
          month: number
          report_id: string
          row_count: number
          updated_at: string | null
          year: number
        }
        Insert: {
          aggregated_metrics?: Json
          created_at?: string | null
          data_source_id: string
          date_range_end?: string | null
          date_range_start?: string | null
          dimension_values?: Json
          id?: string
          month: number
          report_id: string
          row_count?: number
          updated_at?: string | null
          year: number
        }
        Update: {
          aggregated_metrics?: Json
          created_at?: string | null
          data_source_id?: string
          date_range_end?: string | null
          date_range_start?: string | null
          dimension_values?: Json
          id?: string
          month?: number
          report_id?: string
          row_count?: number
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_dimension_data_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_dimension_data_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          updated_at?: string
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
        Relationships: [
          {
            foreignKeyName: "report_shares_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_views: {
        Row: {
          breakdown_by_dimensions: string[] | null
          column_order: string[] | null
          created_at: string
          date_granularity: string | null
          date_order: string | null
          date_range_end: string | null
          date_range_preset: string | null
          date_range_start: string | null
          filter_dimensions: string[] | null
          filter_values: Json | null
          group_by_dimensions: string[] | null
          id: string
          is_default: boolean | null
          kpi_order: string[] | null
          loading_preference: string | null
          name: string
          report_id: string
          then_by_dimensions: string[] | null
          updated_at: string
          user_id: string
          visible_columns: string[] | null
          visible_dimensions: string[] | null
          visible_kpis: string[] | null
        }
        Insert: {
          breakdown_by_dimensions?: string[] | null
          column_order?: string[] | null
          created_at?: string
          date_granularity?: string | null
          date_order?: string | null
          date_range_end?: string | null
          date_range_preset?: string | null
          date_range_start?: string | null
          filter_dimensions?: string[] | null
          filter_values?: Json | null
          group_by_dimensions?: string[] | null
          id?: string
          is_default?: boolean | null
          kpi_order?: string[] | null
          loading_preference?: string | null
          name?: string
          report_id: string
          then_by_dimensions?: string[] | null
          updated_at?: string
          user_id: string
          visible_columns?: string[] | null
          visible_dimensions?: string[] | null
          visible_kpis?: string[] | null
        }
        Update: {
          breakdown_by_dimensions?: string[] | null
          column_order?: string[] | null
          created_at?: string
          date_granularity?: string | null
          date_order?: string | null
          date_range_end?: string | null
          date_range_preset?: string | null
          date_range_start?: string | null
          filter_dimensions?: string[] | null
          filter_values?: Json | null
          group_by_dimensions?: string[] | null
          id?: string
          is_default?: boolean | null
          kpi_order?: string[] | null
          loading_preference?: string | null
          name?: string
          report_id?: string
          then_by_dimensions?: string[] | null
          updated_at?: string
          user_id?: string
          visible_columns?: string[] | null
          visible_dimensions?: string[] | null
          visible_kpis?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "report_views_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "reports_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "share_links_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "sheet_data_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      convert_time_to_utc_cron: {
        Args: { sync_time: string; sync_timezone: string }
        Returns: string
      }
      get_aggregated_performance_data: {
        Args: {
          p_breakdown_dims?: string[]
          p_date_from?: string
          p_date_to?: string
          p_dimension_filters?: Json
          p_group_by_dims?: string[]
          p_limit?: number
          p_offset?: number
          p_report_id: string
          p_then_by_dims?: string[]
          p_visible_dimension_ids?: string[]
        }
        Returns: {
          dimension_values: Json
          group_key: string
          row_count: number
        }[]
      }
      get_monthly_data_stats: {
        Args: { p_report_id: string }
        Returns: {
          first_date: string
          last_date: string
          month: number
          row_count: number
          year: number
        }[]
      }
      get_supabase_config: {
        Args: never
        Returns: {
          anon_key: string
          url: string
        }[]
      }
      has_report_access: {
        Args: { _report_id: string; _user_id: string }
        Returns: boolean
      }
      initialize_existing_auto_sync_jobs: { Args: never; Returns: undefined }
      is_master_account: { Args: { _user_id: string }; Returns: boolean }
      owns_report: {
        Args: { _report_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      data_source_type: "google_sheets" | "csv_url"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      data_source_type: ["google_sheets", "csv_url"],
    },
  },
} as const
