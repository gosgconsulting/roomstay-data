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
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          report_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          report_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          report_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
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
          view_id: string | null
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
          view_id?: string | null
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
          view_id?: string | null
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
          {
            foreignKeyName: "budgets_view_id_fkey"
            columns: ["view_id"]
            isOneToOne: false
            referencedRelation: "views"
            referencedColumns: ["id"]
          },
        ]
      }
      data_sources: {
        Row: {
          column_mappings: Json | null
          created_at: string
          csv_url: string | null
          currency: string
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
          currency?: string
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
          currency?: string
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
      fx_rates: {
        Row: {
          aud_per_usd: number
          created_at: string
          rate_date: string
        }
        Insert: {
          aud_per_usd: number
          created_at?: string
          rate_date: string
        }
        Update: {
          aud_per_usd?: number
          created_at?: string
          rate_date?: string
        }
        Relationships: []
      }
      price_widgets: {
        Row: {
          account_id: string
          check_in_date: string
          check_out_date: string
          created_at: string
          currency_code: string
          id: string
          max_crawled_hotels: number | null
          number_of_adults: number
          number_of_children: number
          search_query: string
          updated_at: string
        }
        Insert: {
          account_id: string
          check_in_date: string
          check_out_date: string
          created_at?: string
          currency_code?: string
          id?: string
          max_crawled_hotels?: number | null
          number_of_adults?: number
          number_of_children?: number
          search_query?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          check_in_date?: string
          check_out_date?: string
          created_at?: string
          currency_code?: string
          id?: string
          max_crawled_hotels?: number | null
          number_of_adults?: number
          number_of_children?: number
          search_query?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_widgets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
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
      reports: {
        Row: {
          account_id: string | null
          channel: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          channel?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          channel?: string | null
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
          custom_date_range: Json | null
          date_preset: string | null
          dimension_filters: Json | null
          id: string
          locked_dimension_ids: string[] | null
          password_hash: string
          report_ids: string[]
          selected_month: string | null
          selected_year: string | null
          slide_report_id: string | null
          slug: string
          updated_at: string
          view_id: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          created_by: string
          custom_date_range?: Json | null
          date_preset?: string | null
          dimension_filters?: Json | null
          id?: string
          locked_dimension_ids?: string[] | null
          password_hash: string
          report_ids?: string[]
          selected_month?: string | null
          selected_year?: string | null
          slide_report_id?: string | null
          slug: string
          updated_at?: string
          view_id?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string
          created_by?: string
          custom_date_range?: Json | null
          date_preset?: string | null
          dimension_filters?: Json | null
          id?: string
          locked_dimension_ids?: string[] | null
          password_hash?: string
          report_ids?: string[]
          selected_month?: string | null
          selected_year?: string | null
          slide_report_id?: string | null
          slug?: string
          updated_at?: string
          view_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "share_links_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_links_slide_report_id_fkey"
            columns: ["slide_report_id"]
            isOneToOne: false
            referencedRelation: "slide_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_links_view_id_fkey"
            columns: ["view_id"]
            isOneToOne: false
            referencedRelation: "views"
            referencedColumns: ["id"]
          },
        ]
      }
      slide_reports: {
        Row: {
          account_id: string | null
          configuration: Json
          created_at: string
          date_range: Json | null
          description: string | null
          id: string
          is_active: boolean
          last_refreshed_at: string | null
          name: string
          report_ids: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          configuration?: Json
          created_at?: string
          date_range?: Json | null
          description?: string | null
          id?: string
          is_active?: boolean
          last_refreshed_at?: string | null
          name?: string
          report_ids?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          configuration?: Json
          created_at?: string
          date_range?: Json | null
          description?: string | null
          id?: string
          is_active?: boolean
          last_refreshed_at?: string | null
          name?: string
          report_ids?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "slide_reports_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      views: {
        Row: {
          account_id: string | null
          breakdown_by_dimensions: string[] | null
          chart_time_range: string | null
          column_order: string[] | null
          comparison_type: string | null
          created_at: string
          custom_date_range: Json | null
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
          main_dimension_id: string | null
          main_dimension_name: string | null
          mode: string
          name: string
          price_check_chart_time_range: string | null
          report_id: string | null
          selected_month: string | null
          selected_year: string | null
          slide_report_id: string | null
          tab: string | null
          then_by_dimensions: string[] | null
          updated_at: string
          user_id: string
          visible_columns: string[] | null
          visible_kpis: string[] | null
        }
        Insert: {
          account_id?: string | null
          breakdown_by_dimensions?: string[] | null
          chart_time_range?: string | null
          column_order?: string[] | null
          comparison_type?: string | null
          created_at?: string
          custom_date_range?: Json | null
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
          main_dimension_id?: string | null
          main_dimension_name?: string | null
          mode: string
          name: string
          price_check_chart_time_range?: string | null
          report_id?: string | null
          selected_month?: string | null
          selected_year?: string | null
          slide_report_id?: string | null
          tab?: string | null
          then_by_dimensions?: string[] | null
          updated_at?: string
          user_id: string
          visible_columns?: string[] | null
          visible_kpis?: string[] | null
        }
        Update: {
          account_id?: string | null
          breakdown_by_dimensions?: string[] | null
          chart_time_range?: string | null
          column_order?: string[] | null
          comparison_type?: string | null
          created_at?: string
          custom_date_range?: Json | null
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
          main_dimension_id?: string | null
          main_dimension_name?: string | null
          mode?: string
          name?: string
          price_check_chart_time_range?: string | null
          report_id?: string | null
          selected_month?: string | null
          selected_year?: string | null
          slide_report_id?: string | null
          tab?: string | null
          then_by_dimensions?: string[] | null
          updated_at?: string
          user_id?: string
          visible_columns?: string[] | null
          visible_kpis?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "views_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "views_main_dimension_id_fkey"
            columns: ["main_dimension_id"]
            isOneToOne: false
            referencedRelation: "dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "views_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "views_slide_report_id_fkey"
            columns: ["slide_report_id"]
            isOneToOne: false
            referencedRelation: "slide_reports"
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
      get_dimension_data_by_report_and_date: {
        Args: {
          p_date_dim_id: string
          p_max_rows?: number
          p_month?: number
          p_report_id: string
          p_year: number
        }
        Returns: Json[]
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
