export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          created_at: string;
          id: string;
          title: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          title?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      ai_messages: {
        Row: {
          content: NonNullable<Json>;
          conversation_id: string;
          created_at: string;
          id: string;
          role: string;
          tokens_in: number | null;
          tokens_out: number | null;
          tool_calls: Json | null;
        };
        Insert: {
          content: NonNullable<Json>;
          conversation_id: string;
          created_at?: string;
          id?: string;
          role: string;
          tokens_in?: number | null;
          tokens_out?: number | null;
          tool_calls?: Json | null;
        };
        Update: {
          content?: NonNullable<Json>;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          role?: string;
          tokens_in?: number | null;
          tokens_out?: number | null;
          tool_calls?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "ai_conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_events: {
        Row: {
          actor_id: string | null;
          actor_label: string | null;
          actor_type: string;
          created_at: string;
          document_id: string | null;
          event_type: string;
          id: number;
          ip: unknown;
          metadata: NonNullable<Json>;
          request_id: string | null;
          user_agent: string | null;
        };
        Insert: {
          actor_id?: string | null;
          actor_label?: string | null;
          actor_type: string;
          created_at?: string;
          document_id?: string | null;
          event_type: string;
          id?: never;
          ip?: unknown;
          metadata?: NonNullable<Json>;
          request_id?: string | null;
          user_agent?: string | null;
        };
        Update: {
          actor_id?: string | null;
          actor_label?: string | null;
          actor_type?: string;
          created_at?: string;
          document_id?: string | null;
          event_type?: string;
          id?: never;
          ip?: unknown;
          metadata?: NonNullable<Json>;
          request_id?: string | null;
          user_agent?: string | null;
        };
        Relationships: [];
      };
      billing_notices: {
        Row: {
          created_at: string;
          kind: string;
          reference: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          kind: string;
          reference: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          kind?: string;
          reference?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      contact_messages: {
        Row: {
          created_at: string;
          email: string;
          handled_at: string | null;
          id: string;
          message: string;
          name: string;
          organization: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          email: string;
          handled_at?: string | null;
          id?: string;
          message: string;
          name: string;
          organization?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string;
          handled_at?: string | null;
          id?: string;
          message?: string;
          name?: string;
          organization?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      document_tags: {
        Row: {
          document_id: string;
          tag_id: string;
        };
        Insert: {
          document_id: string;
          tag_id: string;
        };
        Update: {
          document_id?: string;
          tag_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_tags_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      document_versions: {
        Row: {
          created_at: string;
          created_by: string | null;
          document_id: string;
          file_path: string;
          id: string;
          note: string | null;
          sha256: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          document_id: string;
          file_path: string;
          id?: string;
          note?: string | null;
          sha256: string;
          version: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          document_id?: string;
          file_path?: string;
          id?: string;
          note?: string | null;
          sha256?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          created_at: string;
          current_version: number;
          folder_id: string | null;
          id: string;
          original_name: string;
          original_path: string;
          original_type: string;
          owner_id: string;
          page_count: number | null;
          pdf_path: string | null;
          sha256: string | null;
          signed_at: string | null;
          size_bytes: number;
          status: string;
          team_id: string | null;
          thumbnail_path: string | null;
          title: string;
          trashed_at: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          current_version?: number;
          folder_id?: string | null;
          id?: string;
          original_name: string;
          original_path: string;
          original_type: string;
          owner_id: string;
          page_count?: number | null;
          pdf_path?: string | null;
          sha256?: string | null;
          signed_at?: string | null;
          size_bytes?: number;
          status?: string;
          team_id?: string | null;
          thumbnail_path?: string | null;
          title: string;
          trashed_at?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          current_version?: number;
          folder_id?: string | null;
          id?: string;
          original_name?: string;
          original_path?: string;
          original_type?: string;
          owner_id?: string;
          page_count?: number | null;
          pdf_path?: string | null;
          sha256?: string | null;
          signed_at?: string | null;
          size_bytes?: number;
          status?: string;
          team_id?: string | null;
          thumbnail_path?: string | null;
          title?: string;
          trashed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "documents_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      folders: {
        Row: {
          color: string;
          created_at: string;
          id: string;
          name: string;
          owner_id: string;
          parent_id: string | null;
        };
        Insert: {
          color?: string;
          created_at?: string;
          id?: string;
          name: string;
          owner_id: string;
          parent_id?: string | null;
        };
        Update: {
          color?: string;
          created_at?: string;
          id?: string;
          name?: string;
          owner_id?: string;
          parent_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "folders_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_events: {
        Row: {
          created_at: string;
          error: string | null;
          event_key: string;
          event_type: string | null;
          id: string;
          payload: NonNullable<Json>;
          processed_at: string | null;
          provider: string;
        };
        Insert: {
          created_at?: string;
          error?: string | null;
          event_key: string;
          event_type?: string | null;
          id?: string;
          payload: NonNullable<Json>;
          processed_at?: string | null;
          provider: string;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          event_key?: string;
          event_type?: string | null;
          id?: string;
          payload?: NonNullable<Json>;
          processed_at?: string | null;
          provider?: string;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          amount: number;
          billing_cycle: string;
          created_at: string;
          currency: string;
          failure_reason: string | null;
          id: string;
          kind: string;
          paid_at: string | null;
          payment_method: string | null;
          period_end: string | null;
          period_start: string | null;
          plan: string;
          provider: string;
          provider_ref: string;
          provider_tx_id: string | null;
          receipt_number: string | null;
          receipt_path: string | null;
          status: string;
          subscription_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          billing_cycle: string;
          created_at?: string;
          currency: string;
          failure_reason?: string | null;
          id?: string;
          kind?: string;
          paid_at?: string | null;
          payment_method?: string | null;
          period_end?: string | null;
          period_start?: string | null;
          plan: string;
          provider: string;
          provider_ref: string;
          provider_tx_id?: string | null;
          receipt_number?: string | null;
          receipt_path?: string | null;
          status: string;
          subscription_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          billing_cycle?: string;
          created_at?: string;
          currency?: string;
          failure_reason?: string | null;
          id?: string;
          kind?: string;
          paid_at?: string | null;
          payment_method?: string | null;
          period_end?: string | null;
          period_start?: string | null;
          plan?: string;
          provider?: string;
          provider_ref?: string;
          provider_tx_id?: string | null;
          receipt_number?: string | null;
          receipt_path?: string | null;
          status?: string;
          subscription_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      placed_fields: {
        Row: {
          asset_id: string | null;
          created_at: string;
          document_id: string;
          h_pct: number;
          id: string;
          opacity: number;
          page: number;
          request_signer_id: string | null;
          required: boolean;
          rotation: number;
          type: string;
          value: string | null;
          w_pct: number;
          x_pct: number;
          y_pct: number;
        };
        Insert: {
          asset_id?: string | null;
          created_at?: string;
          document_id: string;
          h_pct: number;
          id?: string;
          opacity?: number;
          page: number;
          request_signer_id?: string | null;
          required?: boolean;
          rotation?: number;
          type: string;
          value?: string | null;
          w_pct: number;
          x_pct: number;
          y_pct: number;
        };
        Update: {
          asset_id?: string | null;
          created_at?: string;
          document_id?: string;
          h_pct?: number;
          id?: string;
          opacity?: number;
          page?: number;
          request_signer_id?: string | null;
          required?: boolean;
          rotation?: number;
          type?: string;
          value?: string | null;
          w_pct?: number;
          x_pct?: number;
          y_pct?: number;
        };
        Relationships: [
          {
            foreignKeyName: "placed_fields_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "signature_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "placed_fields_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "placed_fields_request_signer_id_fkey";
            columns: ["request_signer_id"];
            isOneToOne: false;
            referencedRelation: "request_signers";
            referencedColumns: ["id"];
          },
        ];
      };
      plans_config: {
        Row: {
          currency: string;
          limits: NonNullable<Json>;
          monthly_price: number;
          plan: string;
          updated_at: string;
          yearly_price: number;
        };
        Insert: {
          currency: string;
          limits?: NonNullable<Json>;
          monthly_price: number;
          plan: string;
          updated_at?: string;
          yearly_price: number;
        };
        Update: {
          currency?: string;
          limits?: NonNullable<Json>;
          monthly_price?: number;
          plan?: string;
          updated_at?: string;
          yearly_price?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          account_type: string | null;
          avatar_url: string | null;
          city: string | null;
          created_at: string;
          email: string;
          email_notifications: boolean;
          full_name: string;
          id: string;
          locale: string;
          onboarding_completed_at: string | null;
          org_address: string | null;
          org_footer: string | null;
          org_name: string | null;
          org_sector: string | null;
          phone: string | null;
          phone_verified_at: string | null;
          theme: string;
          timezone: string;
          trial_ends_at: string;
          trial_started_at: string;
          updated_at: string;
          welcome_email_sent_at: string | null;
        };
        Insert: {
          account_type?: string | null;
          avatar_url?: string | null;
          city?: string | null;
          created_at?: string;
          email?: string;
          email_notifications?: boolean;
          full_name?: string;
          id: string;
          locale?: string;
          onboarding_completed_at?: string | null;
          org_address?: string | null;
          org_footer?: string | null;
          org_name?: string | null;
          org_sector?: string | null;
          phone?: string | null;
          phone_verified_at?: string | null;
          theme?: string;
          timezone?: string;
          trial_ends_at?: string;
          trial_started_at?: string;
          updated_at?: string;
          welcome_email_sent_at?: string | null;
        };
        Update: {
          account_type?: string | null;
          avatar_url?: string | null;
          city?: string | null;
          created_at?: string;
          email?: string;
          email_notifications?: boolean;
          full_name?: string;
          id?: string;
          locale?: string;
          onboarding_completed_at?: string | null;
          org_address?: string | null;
          org_footer?: string | null;
          org_name?: string | null;
          org_sector?: string | null;
          phone?: string | null;
          phone_verified_at?: string | null;
          theme?: string;
          timezone?: string;
          trial_ends_at?: string;
          trial_started_at?: string;
          updated_at?: string;
          welcome_email_sent_at?: string | null;
        };
        Relationships: [];
      };
      rate_limit_hits: {
        Row: {
          bucket: string;
          created_at: string;
          id: number;
        };
        Insert: {
          bucket: string;
          created_at?: string;
          id?: never;
        };
        Update: {
          bucket?: string;
          created_at?: string;
          id?: never;
        };
        Relationships: [];
      };
      request_signers: {
        Row: {
          consented_at: string | null;
          created_at: string;
          declined_reason: string | null;
          email: string | null;
          id: string;
          invited_at: string | null;
          ip: unknown;
          last_reminded_at: string | null;
          name: string;
          opened_at: string | null;
          order_index: number;
          phone: string | null;
          reminder_count: number;
          request_id: string;
          sha256_after: string | null;
          sha256_before: string | null;
          signature_path: string | null;
          signed_at: string | null;
          signed_version: number | null;
          status: string;
          token_expires_at: string | null;
          token_hash: string;
          token_version: number;
          user_agent: string | null;
        };
        Insert: {
          consented_at?: string | null;
          created_at?: string;
          declined_reason?: string | null;
          email?: string | null;
          id?: string;
          invited_at?: string | null;
          ip?: unknown;
          last_reminded_at?: string | null;
          name: string;
          opened_at?: string | null;
          order_index?: number;
          phone?: string | null;
          reminder_count?: number;
          request_id: string;
          sha256_after?: string | null;
          sha256_before?: string | null;
          signature_path?: string | null;
          signed_at?: string | null;
          signed_version?: number | null;
          status?: string;
          token_expires_at?: string | null;
          token_hash: string;
          token_version?: number;
          user_agent?: string | null;
        };
        Update: {
          consented_at?: string | null;
          created_at?: string;
          declined_reason?: string | null;
          email?: string | null;
          id?: string;
          invited_at?: string | null;
          ip?: unknown;
          last_reminded_at?: string | null;
          name?: string;
          opened_at?: string | null;
          order_index?: number;
          phone?: string | null;
          reminder_count?: number;
          request_id?: string;
          sha256_after?: string | null;
          sha256_before?: string | null;
          signature_path?: string | null;
          signed_at?: string | null;
          signed_version?: number | null;
          status?: string;
          token_expires_at?: string | null;
          token_hash?: string;
          token_version?: number;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "request_signers_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "signature_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      signature_assets: {
        Row: {
          created_at: string;
          height: number | null;
          id: string;
          image_path: string;
          is_default: boolean;
          method: string;
          name: string;
          owner_id: string;
          svg_path: string | null;
          team_id: string | null;
          type: string;
          width: number | null;
        };
        Insert: {
          created_at?: string;
          height?: number | null;
          id?: string;
          image_path: string;
          is_default?: boolean;
          method: string;
          name: string;
          owner_id: string;
          svg_path?: string | null;
          team_id?: string | null;
          type: string;
          width?: number | null;
        };
        Update: {
          created_at?: string;
          height?: number | null;
          id?: string;
          image_path?: string;
          is_default?: boolean;
          method?: string;
          name?: string;
          owner_id?: string;
          svg_path?: string | null;
          team_id?: string | null;
          type?: string;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "signature_assets_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      signature_requests: {
        Row: {
          canceled_at: string | null;
          certificate_path: string | null;
          completed_at: string | null;
          created_at: string;
          document_id: string;
          expires_at: string | null;
          final_sha256: string | null;
          final_version: number | null;
          id: string;
          message: string | null;
          mode: string;
          original_sha256: string | null;
          owner_id: string;
          sender_name: string | null;
          status: string;
          title: string | null;
        };
        Insert: {
          canceled_at?: string | null;
          certificate_path?: string | null;
          completed_at?: string | null;
          created_at?: string;
          document_id: string;
          expires_at?: string | null;
          final_sha256?: string | null;
          final_version?: number | null;
          id?: string;
          message?: string | null;
          mode: string;
          original_sha256?: string | null;
          owner_id: string;
          sender_name?: string | null;
          status?: string;
          title?: string | null;
        };
        Update: {
          canceled_at?: string | null;
          certificate_path?: string | null;
          completed_at?: string | null;
          created_at?: string;
          document_id?: string;
          expires_at?: string | null;
          final_sha256?: string | null;
          final_version?: number | null;
          id?: string;
          message?: string | null;
          mode?: string;
          original_sha256?: string | null;
          owner_id?: string;
          sender_name?: string | null;
          status?: string;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "signature_requests_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          billing_cycle: string | null;
          cancel_at_period_end: boolean;
          created_at: string;
          currency: string | null;
          current_period_end: string;
          current_period_start: string;
          id: string;
          plan: string;
          provider: string | null;
          provider_customer_id: string | null;
          provider_sub_id: string | null;
          scheduled_plan: string | null;
          scheduled_plan_at: string | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          billing_cycle?: string | null;
          cancel_at_period_end?: boolean;
          created_at?: string;
          currency?: string | null;
          current_period_end: string;
          current_period_start?: string;
          id?: string;
          plan: string;
          provider?: string | null;
          provider_customer_id?: string | null;
          provider_sub_id?: string | null;
          scheduled_plan?: string | null;
          scheduled_plan_at?: string | null;
          status: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          billing_cycle?: string | null;
          cancel_at_period_end?: boolean;
          created_at?: string;
          currency?: string | null;
          current_period_end?: string;
          current_period_start?: string;
          id?: string;
          plan?: string;
          provider?: string | null;
          provider_customer_id?: string | null;
          provider_sub_id?: string | null;
          scheduled_plan?: string | null;
          scheduled_plan_at?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      tags: {
        Row: {
          color: string;
          created_at: string;
          id: string;
          name: string;
          owner_id: string;
        };
        Insert: {
          color?: string;
          created_at?: string;
          id?: string;
          name: string;
          owner_id: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          id?: string;
          name?: string;
          owner_id?: string;
        };
        Relationships: [];
      };
      team_invitations: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          role: string;
          team_id: string;
          token_hash: string;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          email: string;
          expires_at: string;
          id?: string;
          invited_by?: string | null;
          role: string;
          team_id: string;
          token_hash: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          role?: string;
          team_id?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_invitations_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      team_members: {
        Row: {
          created_at: string;
          role: string;
          team_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          role: string;
          team_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          role?: string;
          team_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      teams: {
        Row: {
          created_at: string;
          id: string;
          logo_url: string | null;
          name: string;
          owner_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          logo_url?: string | null;
          name: string;
          owner_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          logo_url?: string | null;
          name?: string;
          owner_id?: string;
        };
        Relationships: [];
      };
      templates: {
        Row: {
          created_at: string;
          description: string | null;
          fields: NonNullable<Json>;
          id: string;
          mode: string;
          name: string;
          owner_id: string;
          page_count: number | null;
          pdf_path: string | null;
          roles: NonNullable<Json>;
          source_document_id: string | null;
          team_id: string | null;
          updated_at: string;
          use_count: number;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          fields?: NonNullable<Json>;
          id?: string;
          mode?: string;
          name: string;
          owner_id: string;
          page_count?: number | null;
          pdf_path?: string | null;
          roles?: NonNullable<Json>;
          source_document_id?: string | null;
          team_id?: string | null;
          updated_at?: string;
          use_count?: number;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          fields?: NonNullable<Json>;
          id?: string;
          mode?: string;
          name?: string;
          owner_id?: string;
          page_count?: number | null;
          pdf_path?: string | null;
          roles?: NonNullable<Json>;
          source_document_id?: string | null;
          team_id?: string | null;
          updated_at?: string;
          use_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "templates_source_document_id_fkey";
            columns: ["source_document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "templates_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      usage_counters: {
        Row: {
          ai_messages: number;
          day: string;
          documents_signed: number;
          user_id: string;
        };
        Insert: {
          ai_messages?: number;
          day: string;
          documents_signed?: number;
          user_id: string;
        };
        Update: {
          ai_messages?: number;
          day?: string;
          documents_signed?: number;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      can_read_document: { Args: { p_document_id: string }; Returns: boolean };
      can_write: { Args: { p_user_id: string }; Returns: boolean };
      check_rate_limit: {
        Args: { p_bucket: string; p_max: number; p_window: string };
        Returns: boolean;
      };
      complete_payment: {
        Args: { p_method: string; p_payment_id: string; p_provider_tx_id: string };
        Returns: {
          applied: boolean;
          period_end: string;
          period_start: string;
          receipt_number: string;
        }[];
      };
      get_usage_snapshot: { Args: { p_user_id: string }; Returns: Json };
      increment_usage: {
        Args: { p_amount?: number; p_kind: string; p_user_id: string };
        Returns: undefined;
      };
      is_team_admin: { Args: { p_team_id: string }; Returns: boolean };
      is_team_member: { Args: { p_team_id: string }; Returns: boolean };
      my_team_sponsor: {
        Args: Record<PropertyKey, never>;
        Returns: {
          cancel_at_period_end: boolean;
          current_period_end: string;
          owner_id: string;
          plan: string;
          scheduled_plan: string;
          scheduled_plan_at: string;
          status: string;
          team_id: string;
          team_name: string;
        }[];
      };
      my_usage_snapshot: { Args: Record<PropertyKey, never>; Returns: Json };
      owns_document: { Args: { p_document_id: string }; Returns: boolean };
      purge_rate_limit_hits: { Args: Record<PropertyKey, never>; Returns: undefined };
      purge_trashed_documents: {
        Args: { p_older_than?: string };
        Returns: {
          bucket_path: string;
        }[];
      };
      subscription_allows_write: {
        Args: { p_cancel: boolean; p_end: string; p_plan: string; p_status: string };
        Returns: boolean;
      };
      team_activity: {
        Args: { p_limit?: number; p_team_id: string };
        Returns: {
          actor_id: string;
          actor_name: string;
          created_at: string;
          document_id: string;
          document_title: string;
          event_type: string;
          id: number;
        }[];
      };
      team_sponsor: {
        Args: { p_user_id: string };
        Returns: {
          cancel_at_period_end: boolean;
          current_period_end: string;
          owner_id: string;
          plan: string;
          scheduled_plan: string;
          scheduled_plan_at: string;
          status: string;
          team_id: string;
          team_name: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
