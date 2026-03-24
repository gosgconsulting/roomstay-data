export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      accounts: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_summary_budgets: {
        Row: {
          account_id: string | null
          budget: number | null
          created_at: string
          dimension_item: string | null
          dimension_name: string | null
          id: string
          month: string | null
          report_id: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          budget?: number | null
          created_at?: string
          dimension_item?: string | null
          dimension_name?: string | null
          id?: string
          month?: string | null
          report_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          budget?: number | null
          created_at?: string
          dimension_item?: string | null
          dimension_name?: string | null
          id?: string
          month?: string | null
          report_id?: string | null
          updated_at?: string
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
          card_type: string | null
          content: string | null
          created_at: string
          id: string
          report_id: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          card_type?: string | null
          content?: string | null
          created_at?: string
          id?: string
          report_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          card_type?: string | null
          content?: string | null
          created_at?: string
          id?: string
          report_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_summary_cards_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_summary_cards_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_summary_forecasts: {
        Row: {
          account_id: string | null
          created_at: string
          forecast_data: Json | null
          id: string
          report_id: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          forecast_data?: Json | null
          id?: string
          report_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          forecast_data?: Json | null
          id?: string
          report_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_summary_forecasts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_summary_forecasts_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          account_id: string | null
          created_at: string
          encrypted_key: string
          id: string
          key_name: string
          service: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          encrypted_key: string
          id?: string
          key_name: string
          service: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          encrypted_key?: string
          id?: string
          key_name?: string
          service?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_statuses: {
        Row: {
          account_id: string | null
          booking_id: string
          created_at: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          booking_id: string
          created_at?: string
          id?: string
          status: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          booking_id?: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_statuses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          account_id: string | null
          budget: number | null
          created_at: string
          dimension_item: string | null
          dimension_name: string | null
          id: string
          month: string | null
          report_id: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          budget?: number | null
          created_at?: string
          dimension_item?: string | null
          dimension_name?: string | null
          id?: string
          month?: string | null
          report_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          budget?: number | null
          created_at?: string
          dimension_item?: string | null
          dimension_name?: string | null
          id?: string
          month?: string | null
          report_id?: string | null
          updated_at?: string
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
          cluster_name: string
          created_at: string
          dimension_ids: string[] | null
          id: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          cluster_name: string
          created_at?: string
          dimension_ids?: string[] | null
          id?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          cluster_name?: string
          created_at?: string
          dimension_ids?: string[] | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cluster_dimensions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      cluster_mappings: {
        Row: {
          cluster_id: string | null
          created_at: string
          dimension_item: string
          id: string
          updated_at: string
        }
        Insert: {
          cluster_id?: string | null
          created_at?: string
          dimension_item: string
          id?: string
          updated_at?: string
        }
        Update: {
          cluster_id?: string | null
          created_at?: string
          dimension_item?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cluster_mappings_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "cluster_dimensions"
            referencedColumns: ["id"]
          },
        ]
      }
      data_sources: {
        Row: {
          account_id: string | null
          column_mappings: Json | null
          created_at: string
          id: string
          name: string
          report_id: string | null
          source_config: Json | null
          source_type: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          column_mappings?: Json | null
          created_at?: string
          id?: string
          name: string
          report_id?: string | null
          source_config?: Json | null
          source_type: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          column_mappings?: Json | null
          created_at?: string
          id?: string
          name?: string
          report_id?: string | null
          source_config?: Json | null
          source_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_sources_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
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
          account_id: string | null
          created_at: string
          data_source_id: string | null
          date: string | null
          dimension_values: Json | null
          id: string
          report_id: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          data_source_id?: string | null
          date?: string | null
          dimension_values?: Json | null
          id?: string
          report_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          data_source_id?: string | null
          date?: string | null
          dimension_values?: Json | null
          id?: string
          report_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dimension_data_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
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
          created_at: string
          id: string
          name: string
          report_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          id?: string
          name: string
          report_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          id?: string
          name?: string
          report_id?: string | null
          type?: string
          updated_at?: string
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
          account_id: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_services_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      forecasts: {
        Row: {
          account_id: string | null
          created_at: string
          forecast_data: Json | null
          id: string
          report_id: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          forecast_data?: Json | null
          id?: string
          report_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          forecast_data?: Json | null
          id?: string
          report_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecasts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
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
          created_at: string
          date: string
          id: string
          rate: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          rate: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      master_filter_settings: {
        Row: {
          account_id: string | null
          created_at: string
          filter_settings: Json | null
          id: string
          report_id: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          filter_settings?: Json | null
          id?: string
          report_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          filter_settings?: Json | null
          id?: string
          report_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_filter_settings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_filter_settings_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      master_report_configs: {
        Row: {
          account_id: string | null
          config_data: Json | null
          created_at: string
          id: string
          report_id: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          config_data?: Json | null
          created_at?: string
          id?: string
          report_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          config_data?: Json | null
          created_at?: string
          id?: string
          report_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_report_configs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_report_configs_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      master_report_global_configs: {
        Row: {
          account_id: string | null
          config_data: Json | null
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          config_data?: Json | null
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          config_data?: Json | null
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_report_global_configs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      report_daily_metrics: {
        Row: {
          account_id: string | null
          bookings: number | null
          clicks: number | null
          cost: number | null
          created_at: string
          date: string
          id: string
          impressions: number | null
          report_id: string | null
          revenue: number | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          bookings?: number | null
          clicks?: number | null
          cost?: number | null
          created_at?: string
          date: string
          id?: string
          impressions?: number | null
          report_id?: string | null
          revenue?: number | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          bookings?: number | null
          clicks?: number | null
          cost?: number | null
          created_at?: string
          date?: string
          id?: string
          impressions?: number | null
          report_id?: string | null
          revenue?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_daily_metrics_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_daily_metrics_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_shares: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          report_id: string | null
          share_token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          report_id?: string | null
          share_token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          report_id?: string | null
          share_token?: string
          updated_at?: string
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
        }
        Insert: {
          account_id?: string | null
          channel?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          channel?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
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
          created_by: string | null
          dimension_filters: Json | null
          id: string
          locked_dimension_ids: string[] | null
          password_hash: string | null
          report_ids: string[] | null
          slide_report_id: string | null
          slug: string
          updated_at: string
          view_id: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          created_by?: string | null
          dimension_filters?: Json | null
          id?: string
          locked_dimension_ids?: string[] | null
          password_hash?: string | null
          report_ids?: string[] | null
          slide_report_id?: string | null
          slug: string
          updated_at?: string
          view_id?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string
          created_by?: string | null
          dimension_filters?: Json | null
          id?: string
          locked_dimension_ids?: string[] | null
          password_hash?: string | null
          report_ids?: string[] | null
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
          configuration: Json | null
          created_at: string
          id: string
          name: string
          report_ids: Json | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          configuration?: Json | null
          created_at?: string
          id?: string
          name: string
          report_ids?: Json | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          configuration?: Json | null
          created_at?: string
          id?: string
          name?: string
          report_ids?: Json | null
          updated_at?: string
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
      slides: {
        Row: {
          account_id: string | null
          content: Json | null
          created_at: string
          id: string
          report_id: string | null
          slide_order: number | null
          slide_type: string
          title: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          content?: Json | null
          created_at?: string
          id?: string
          report_id?: string | null
          slide_order?: number | null
          slide_type: string
          title: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          content?: Json | null
          created_at?: string
          id?: string
          report_id?: string | null
          slide_order?: number | null
          slide_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "slides_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slides_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      views: {
        Row: {
          account_id: string | null
          chart_time_range: string | null
          comparison_type: string | null
          created_at: string
          date_range_end: string | null
          date_range_preset: string | null
          date_range_start: string | null
          filter_values: Json | null
          id: string
          main_dimension_id: string | null
          main_dimension_name: string | null
          name: string
          price_check_chart_time_range: string | null
          report_id: string | null
          selected_month: string | null
          selected_year: string | null
          slide_report_id: string | null
          tab: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          chart_time_range?: string | null
          comparison_type?: string | null
          created_at?: string
          date_range_end?: string | null
          date_range_preset?: string | null
          date_range_start?: string | null
          filter_values?: Json | null
          id?: string
          main_dimension_id?: string | null
          main_dimension_name?: string | null
          name: string
          price_check_chart_time_range?: string | null
          report_id?: string | null
          selected_month?: string | null
          selected_year?: string | null
          slide_report_id?: string | null
          tab?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          chart_time_range?: string | null
          comparison_type?: string | null
          created_at?: string
          date_range_end?: string | null
          date_range_preset?: string | null
          date_range_start?: string | null
          filter_values?: Json | null
          id?: string
          main_dimension_id?: string | null
          main_dimension_name?: string | null
          name?: string
          price_check_chart_time_range?: string | null
          report_id?: string | null
          selected_month?: string | null
          selected_year?: string | null
          slide_report_id?: string | null
          tab?: string | null
          updated_at?: string
          user_id?: string
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

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (Database["public"]["Tables"] & Database["public"]["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"] &
        Database["public"]["Views"])
    ? (Database["public"]["Tables"] &
        Database["public"]["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof Database["public"]["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof Database["public"]["Enums"]
    ? Database["public"]["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof Database["public"]["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof Database["public"]["CompositeTypes"]
    ? Database["public"]["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
