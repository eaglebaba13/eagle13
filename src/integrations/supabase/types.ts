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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event: string
          id: string
          metadata: Json | null
          new_value: Json | null
          previous_value: Json | null
          target_user_id: string | null
          user_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event: string
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          previous_value?: Json | null
          target_user_id?: string | null
          user_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event?: string
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          previous_value?: Json | null
          target_user_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      billing_events: {
        Row: {
          attempts: number
          created_at: string
          event_type: string
          failure_reason: string | null
          id: string
          idempotency_key: string | null
          payload: Json
          payload_hash: string | null
          processed_at: string | null
          provider: string
          provider_event_id: string
          signature_verified: boolean
          status: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_type: string
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          payload?: Json
          payload_hash?: string | null
          processed_at?: string | null
          provider: string
          provider_event_id: string
          signature_verified?: boolean
          status?: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          event_type?: string
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          payload?: Json
          payload_hash?: string | null
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
          signature_verified?: boolean
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      dashboard_layouts: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          layout: Json
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          layout?: Json
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          layout?: Json
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gann_gap_outcomes: {
        Row: {
          actual_outcome: string
          capability: Json | null
          evaluated_at: string
          gap_percent: number | null
          gap_points: number | null
          id: string
          next_open: number | null
          outcome_rule_version: string
          outcome_trading_date: string
          prediction_id: string
          prediction_trading_date: string
          previous_close: number | null
          provider_alias: string | null
          source: string | null
        }
        Insert: {
          actual_outcome: string
          capability?: Json | null
          evaluated_at?: string
          gap_percent?: number | null
          gap_points?: number | null
          id?: string
          next_open?: number | null
          outcome_rule_version: string
          outcome_trading_date: string
          prediction_id: string
          prediction_trading_date: string
          previous_close?: number | null
          provider_alias?: string | null
          source?: string | null
        }
        Update: {
          actual_outcome?: string
          capability?: Json | null
          evaluated_at?: string
          gap_percent?: number | null
          gap_points?: number | null
          id?: string
          next_open?: number | null
          outcome_rule_version?: string
          outcome_trading_date?: string
          prediction_id?: string
          prediction_trading_date?: string
          previous_close?: number | null
          provider_alias?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gann_gap_outcomes_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "gann_gap_predictions"
            referencedColumns: ["prediction_id"]
          },
        ]
      }
      gann_gap_predictions: {
        Row: {
          base_outlook: string
          calendar_provenance: Json | null
          capability: Json | null
          closing_zone: Json | null
          confidence_band: string | null
          config_version: string
          confirmations: Json
          created_at: string
          distance_pct: number | null
          distance_points: number | null
          evaluated_at: string | null
          formula_version: string
          frozen_at: string | null
          id: string
          lifecycle: string
          lower_level: number | null
          next_trading_date: string | null
          prediction_id: string
          previous_close: number | null
          provider_alias: string | null
          reference_price: number | null
          relevant_level: number | null
          source: string | null
          trading_date: string
          updated_at: string
          upper_level: number | null
        }
        Insert: {
          base_outlook: string
          calendar_provenance?: Json | null
          capability?: Json | null
          closing_zone?: Json | null
          confidence_band?: string | null
          config_version: string
          confirmations?: Json
          created_at?: string
          distance_pct?: number | null
          distance_points?: number | null
          evaluated_at?: string | null
          formula_version: string
          frozen_at?: string | null
          id?: string
          lifecycle: string
          lower_level?: number | null
          next_trading_date?: string | null
          prediction_id: string
          previous_close?: number | null
          provider_alias?: string | null
          reference_price?: number | null
          relevant_level?: number | null
          source?: string | null
          trading_date: string
          updated_at?: string
          upper_level?: number | null
        }
        Update: {
          base_outlook?: string
          calendar_provenance?: Json | null
          capability?: Json | null
          closing_zone?: Json | null
          confidence_band?: string | null
          config_version?: string
          confirmations?: Json
          created_at?: string
          distance_pct?: number | null
          distance_points?: number | null
          evaluated_at?: string | null
          formula_version?: string
          frozen_at?: string | null
          id?: string
          lifecycle?: string
          lower_level?: number | null
          next_trading_date?: string | null
          prediction_id?: string
          previous_close?: number | null
          provider_alias?: string | null
          reference_price?: number | null
          relevant_level?: number | null
          source?: string | null
          trading_date?: string
          updated_at?: string
          upper_level?: number | null
        }
        Relationships: []
      }
      gann_gap_scheduler_state: {
        Row: {
          enabled: boolean
          id: number
          last_error: string | null
          last_run_at: string | null
          last_run_kind: string | null
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          id?: number
          last_error?: string | null
          last_run_at?: string | null
          last_run_kind?: string | null
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          id?: number
          last_error?: string | null
          last_run_at?: string | null
          last_run_kind?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          created_at: string
          data: Json
          entry_date: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          entry_date?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          entry_date?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      local_migrations: {
        Row: {
          applied_at: string
          id: string
          migration_key: string
          user_id: string
        }
        Insert: {
          applied_at?: string
          id?: string
          migration_key: string
          user_id: string
        }
        Update: {
          applied_at?: string
          id?: string
          migration_key?: string
          user_id?: string
        }
        Relationships: []
      }
      manual_payment_requests: {
        Row: {
          admin_note: string | null
          amount_paid: number | null
          billing_cycle: string
          created_at: string
          currency: string
          expected_amount: number
          expires_at: string
          id: string
          payee_name: string | null
          payment_app: string | null
          payment_date: string | null
          payment_reference: string
          rejection_reason: string | null
          requested_plan: string
          screenshot_url: string | null
          status: Database["public"]["Enums"]["manual_payment_status"]
          submitted_at: string | null
          updated_at: string
          upi_id: string
          user_id: string
          user_note: string | null
          utr_number: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          admin_note?: string | null
          amount_paid?: number | null
          billing_cycle: string
          created_at?: string
          currency?: string
          expected_amount: number
          expires_at?: string
          id?: string
          payee_name?: string | null
          payment_app?: string | null
          payment_date?: string | null
          payment_reference: string
          rejection_reason?: string | null
          requested_plan: string
          screenshot_url?: string | null
          status?: Database["public"]["Enums"]["manual_payment_status"]
          submitted_at?: string | null
          updated_at?: string
          upi_id: string
          user_id: string
          user_note?: string | null
          utr_number?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          admin_note?: string | null
          amount_paid?: number | null
          billing_cycle?: string
          created_at?: string
          currency?: string
          expected_amount?: number
          expires_at?: string
          id?: string
          payee_name?: string | null
          payment_app?: string | null
          payment_date?: string | null
          payment_reference?: string
          rejection_reason?: string | null
          requested_plan?: string
          screenshot_url?: string | null
          status?: Database["public"]["Enums"]["manual_payment_status"]
          submitted_at?: string | null
          updated_at?: string
          upi_id?: string
          user_id?: string
          user_note?: string | null
          utr_number?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          broker_status: boolean
          browser: boolean
          decision_alerts: boolean
          email: boolean
          portfolio_events: boolean
          push: boolean
          risk_alerts: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          broker_status?: boolean
          browser?: boolean
          decision_alerts?: boolean
          email?: boolean
          portfolio_events?: boolean
          push?: boolean
          risk_alerts?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          broker_status?: boolean
          browser?: boolean
          decision_alerts?: boolean
          email?: boolean
          portfolio_events?: boolean
          push?: boolean
          risk_alerts?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      paper_trades: {
        Row: {
          created_at: string
          id: string
          trade: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          trade: Json
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          trade?: Json
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          country: string | null
          created_at: string
          currency: string | null
          display_name: string | null
          email: string | null
          id: string
          language: string | null
          preferred_broker: string | null
          preferred_instrument: string | null
          theme: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          display_name?: string | null
          email?: string | null
          id: string
          language?: string | null
          preferred_broker?: string | null
          preferred_instrument?: string | null
          theme?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          language?: string | null
          preferred_broker?: string | null
          preferred_instrument?: string | null
          theme?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      replay_presets: {
        Row: {
          created_at: string
          id: string
          name: string
          preset: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          preset?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          preset?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      smart_alert_delivery_attempts: {
        Row: {
          attempted_at: string
          created_at: string
          duration_ms: number | null
          error_code: string | null
          event_id: string | null
          fingerprint: string
          id: string
          provider: string
          retryable: boolean
          status: string
          user_id: string
        }
        Insert: {
          attempted_at?: string
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          event_id?: string | null
          fingerprint: string
          id?: string
          provider: string
          retryable?: boolean
          status: string
          user_id: string
        }
        Update: {
          attempted_at?: string
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          event_id?: string | null
          fingerprint?: string
          id?: string
          provider?: string
          retryable?: boolean
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "smart_alert_delivery_attempts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "smart_alert_events"
            referencedColumns: ["id"]
          },
        ]
      }
      smart_alert_engine_checkpoints: {
        Row: {
          created_at: string
          fingerprints: Json
          last_error: string | null
          last_evaluated_at: string | null
          last_success_at: string | null
          previous: Json
          rules_version: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fingerprints?: Json
          last_error?: string | null
          last_evaluated_at?: string | null
          last_success_at?: string | null
          previous?: Json
          rules_version?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fingerprints?: Json
          last_error?: string | null
          last_evaluated_at?: string | null
          last_success_at?: string | null
          previous?: Json
          rules_version?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      smart_alert_events: {
        Row: {
          created_at: string
          dismissed_at: string | null
          fingerprint: string
          generated_at: string
          id: string
          instrument: string | null
          payload: Json
          priority: string
          read_at: string | null
          rules_version: string
          source_modules: Json
          summary: string
          title: string
          trading_date: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dismissed_at?: string | null
          fingerprint: string
          generated_at: string
          id?: string
          instrument?: string | null
          payload?: Json
          priority: string
          read_at?: string | null
          rules_version: string
          source_modules?: Json
          summary: string
          title: string
          trading_date: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dismissed_at?: string | null
          fingerprint?: string
          generated_at?: string
          id?: string
          instrument?: string | null
          payload?: Json
          priority?: string
          read_at?: string | null
          rules_version?: string
          source_modules?: Json
          summary?: string
          title?: string
          trading_date?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      smart_alert_subscriptions: {
        Row: {
          cooldown_override_sec: number | null
          created_at: string
          email_enabled: boolean
          in_app_enabled: boolean
          instruments: Json
          minimum_priority: string
          quiet_hours: Json | null
          telegram_enabled: boolean
          timezone: string
          types: Json
          updated_at: string
          user_id: string
          webhook_enabled: boolean
        }
        Insert: {
          cooldown_override_sec?: number | null
          created_at?: string
          email_enabled?: boolean
          in_app_enabled?: boolean
          instruments?: Json
          minimum_priority?: string
          quiet_hours?: Json | null
          telegram_enabled?: boolean
          timezone?: string
          types?: Json
          updated_at?: string
          user_id: string
          webhook_enabled?: boolean
        }
        Update: {
          cooldown_override_sec?: number | null
          created_at?: string
          email_enabled?: boolean
          in_app_enabled?: boolean
          instruments?: Json
          minimum_priority?: string
          quiet_hours?: Json | null
          telegram_enabled?: boolean
          timezone?: string
          types?: Json
          updated_at?: string
          user_id?: string
          webhook_enabled?: boolean
        }
        Relationships: []
      }
      subscription_preferences: {
        Row: {
          billing_cycle_preference: string
          created_at: string
          invoice_email: string | null
          marketing_consent: boolean
          preferred_currency: string
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_cycle_preference?: string
          created_at?: string
          invoice_email?: string | null
          marketing_consent?: boolean
          preferred_currency?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_cycle_preference?: string
          created_at?: string
          invoice_email?: string | null
          marketing_consent?: boolean
          preferred_currency?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          activated_at: string
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          engine_version: string
          expires_at: string | null
          id: string
          license_key: string | null
          plan: string
          provider: string | null
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          trial_end: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activated_at?: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          engine_version?: string
          expires_at?: string | null
          id?: string
          license_key?: string | null
          plan?: string
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          trial_end?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activated_at?: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          engine_version?: string
          expires_at?: string | null
          id?: string
          license_key?: string | null
          plan?: string
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          trial_end?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      usage_counters: {
        Row: {
          count: number
          id: string
          period: string
          resource: string
          updated_at: string
          user_id: string
        }
        Insert: {
          count?: number
          id?: string
          period: string
          resource: string
          updated_at?: string
          user_id: string
        }
        Update: {
          count?: number
          id?: string
          period?: string
          resource?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_entitlement_grants: {
        Row: {
          capability: string
          created_at: string
          expires_at: string | null
          granted_by: string | null
          id: string
          reason: string | null
          revoked_at: string | null
          starts_at: string
          user_id: string
        }
        Insert: {
          capability: string
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          reason?: string | null
          revoked_at?: string | null
          starts_at?: string
          user_id: string
        }
        Update: {
          capability?: string
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          reason?: string | null
          revoked_at?: string | null
          starts_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          settings: Json
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          settings?: Json
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          settings?: Json
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      watchlists: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          pinned: boolean
          sort_order: number
          symbols: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          pinned?: boolean
          sort_order?: number
          symbols?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          pinned?: boolean
          sort_order?: number
          symbols?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_approve_manual_payment: {
        Args: { _admin_note: string; _id: string }
        Returns: {
          admin_note: string | null
          amount_paid: number | null
          billing_cycle: string
          created_at: string
          currency: string
          expected_amount: number
          expires_at: string
          id: string
          payee_name: string | null
          payment_app: string | null
          payment_date: string | null
          payment_reference: string
          rejection_reason: string | null
          requested_plan: string
          screenshot_url: string | null
          status: Database["public"]["Enums"]["manual_payment_status"]
          submitted_at: string | null
          updated_at: string
          upi_id: string
          user_id: string
          user_note: string | null
          utr_number: string | null
          verified_at: string | null
          verified_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "manual_payment_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_change_plan: {
        Args: { _plan: string; _reason: string; _target: string }
        Returns: {
          activated_at: string
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          engine_version: string
          expires_at: string | null
          id: string
          license_key: string | null
          plan: string
          provider: string | null
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          trial_end: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_extend_trial: {
        Args: { _days: number; _reason: string; _target: string }
        Returns: {
          activated_at: string
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          engine_version: string
          expires_at: string | null
          id: string
          license_key: string | null
          plan: string
          provider: string | null
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          trial_end: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_grant_entitlement: {
        Args: {
          _capability: string
          _expires_at: string
          _reason: string
          _target: string
        }
        Returns: {
          capability: string
          created_at: string
          expires_at: string | null
          granted_by: string | null
          id: string
          reason: string | null
          revoked_at: string | null
          starts_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_entitlement_grants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_mark_manual_payment_under_review: {
        Args: { _id: string }
        Returns: {
          admin_note: string | null
          amount_paid: number | null
          billing_cycle: string
          created_at: string
          currency: string
          expected_amount: number
          expires_at: string
          id: string
          payee_name: string | null
          payment_app: string | null
          payment_date: string | null
          payment_reference: string
          rejection_reason: string | null
          requested_plan: string
          screenshot_url: string | null
          status: Database["public"]["Enums"]["manual_payment_status"]
          submitted_at: string | null
          updated_at: string
          upi_id: string
          user_id: string
          user_note: string | null
          utr_number: string | null
          verified_at: string | null
          verified_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "manual_payment_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_reject_manual_payment: {
        Args: { _id: string; _reason: string }
        Returns: {
          admin_note: string | null
          amount_paid: number | null
          billing_cycle: string
          created_at: string
          currency: string
          expected_amount: number
          expires_at: string
          id: string
          payee_name: string | null
          payment_app: string | null
          payment_date: string | null
          payment_reference: string
          rejection_reason: string | null
          requested_plan: string
          screenshot_url: string | null
          status: Database["public"]["Enums"]["manual_payment_status"]
          submitted_at: string | null
          updated_at: string
          upi_id: string
          user_id: string
          user_note: string | null
          utr_number: string | null
          verified_at: string | null
          verified_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "manual_payment_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_reset_usage: {
        Args: {
          _period: string
          _reason: string
          _resource: string
          _target: string
        }
        Returns: number
      }
      admin_revoke_entitlement: {
        Args: { _grant_id: string; _reason: string }
        Returns: {
          capability: string
          created_at: string
          expires_at: string | null
          granted_by: string | null
          id: string
          reason: string | null
          revoked_at: string | null
          starts_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_entitlement_grants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_status: {
        Args: { _reason: string; _status: string; _target: string }
        Returns: {
          activated_at: string
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          engine_version: string
          expires_at: string | null
          id: string
          license_key: string | null
          plan: string
          provider: string | null
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          trial_end: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_manual_payment_request: {
        Args: { _id: string }
        Returns: {
          admin_note: string | null
          amount_paid: number | null
          billing_cycle: string
          created_at: string
          currency: string
          expected_amount: number
          expires_at: string
          id: string
          payee_name: string | null
          payment_app: string | null
          payment_date: string | null
          payment_reference: string
          rejection_reason: string | null
          requested_plan: string
          screenshot_url: string | null
          status: Database["public"]["Enums"]["manual_payment_status"]
          submitted_at: string | null
          updated_at: string
          upi_id: string
          user_id: string
          user_note: string | null
          utr_number: string | null
          verified_at: string | null
          verified_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "manual_payment_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      consume_usage: {
        Args: { _max: number; _period: string; _resource: string }
        Returns: number
      }
      create_manual_payment_request: {
        Args: {
          _amount: number
          _currency: string
          _cycle: string
          _payee_name: string
          _plan: string
          _reference: string
          _upi_id: string
        }
        Returns: {
          admin_note: string | null
          amount_paid: number | null
          billing_cycle: string
          created_at: string
          currency: string
          expected_amount: number
          expires_at: string
          id: string
          payee_name: string | null
          payment_app: string | null
          payment_date: string | null
          payment_reference: string
          rejection_reason: string | null
          requested_plan: string
          screenshot_url: string | null
          status: Database["public"]["Enums"]["manual_payment_status"]
          submitted_at: string | null
          updated_at: string
          upi_id: string
          user_id: string
          user_note: string | null
          utr_number: string | null
          verified_at: string | null
          verified_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "manual_payment_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gann_gap_upsert_outcome: {
        Args: { _row: Json }
        Returns: {
          actual_outcome: string
          capability: Json | null
          evaluated_at: string
          gap_percent: number | null
          gap_points: number | null
          id: string
          next_open: number | null
          outcome_rule_version: string
          outcome_trading_date: string
          prediction_id: string
          prediction_trading_date: string
          previous_close: number | null
          provider_alias: string | null
          source: string | null
        }
        SetofOptions: {
          from: "*"
          to: "gann_gap_outcomes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gann_gap_upsert_prediction: {
        Args: { _row: Json }
        Returns: {
          base_outlook: string
          calendar_provenance: Json | null
          capability: Json | null
          closing_zone: Json | null
          confidence_band: string | null
          config_version: string
          confirmations: Json
          created_at: string
          distance_pct: number | null
          distance_points: number | null
          evaluated_at: string | null
          formula_version: string
          frozen_at: string | null
          id: string
          lifecycle: string
          lower_level: number | null
          next_trading_date: string | null
          prediction_id: string
          previous_close: number | null
          provider_alias: string | null
          reference_price: number | null
          relevant_level: number | null
          source: string | null
          trading_date: string
          updated_at: string
          upper_level: number | null
        }
        SetofOptions: {
          from: "*"
          to: "gann_gap_predictions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_entitlement_snapshot: { Args: { _target?: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      self_set_cancel_at_period_end: {
        Args: { _flag: boolean }
        Returns: {
          activated_at: string
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          engine_version: string
          expires_at: string | null
          id: string
          license_key: string | null
          plan: string
          provider: string | null
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          trial_end: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      self_start_trial: {
        Args: { _plan: string }
        Returns: {
          activated_at: string
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          engine_version: string
          expires_at: string | null
          id: string
          license_key: string | null
          plan: string
          provider: string | null
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          trial_end: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_manual_payment_utr: {
        Args: {
          _amount_paid: number
          _id: string
          _payment_app: string
          _payment_date: string
          _screenshot_url: string
          _user_note: string
          _utr: string
        }
        Returns: {
          admin_note: string | null
          amount_paid: number | null
          billing_cycle: string
          created_at: string
          currency: string
          expected_amount: number
          expires_at: string
          id: string
          payee_name: string | null
          payment_app: string | null
          payment_date: string | null
          payment_reference: string
          rejection_reason: string | null
          requested_plan: string
          screenshot_url: string | null
          status: Database["public"]["Enums"]["manual_payment_status"]
          submitted_at: string | null
          updated_at: string
          upi_id: string
          user_id: string
          user_note: string | null
          utr_number: string | null
          verified_at: string | null
          verified_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "manual_payment_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      validate_subscription_transition: {
        Args: { _from: string; _to: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "enterprise"
        | "professional"
        | "pro"
        | "free"
        | "guest"
      manual_payment_status:
        | "CREATED"
        | "SUBMITTED"
        | "UNDER_REVIEW"
        | "APPROVED"
        | "REJECTED"
        | "EXPIRED"
        | "CANCELED"
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
      app_role: ["admin", "enterprise", "professional", "pro", "free", "guest"],
      manual_payment_status: [
        "CREATED",
        "SUBMITTED",
        "UNDER_REVIEW",
        "APPROVED",
        "REJECTED",
        "EXPIRED",
        "CANCELED",
      ],
    },
  },
} as const
