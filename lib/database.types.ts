export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          last_used_at: string | null
          name: string
          prefix: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          last_used_at?: string | null
          name: string
          prefix: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          last_used_at?: string | null
          name?: string
          prefix?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          company_name: string | null
          contact_page: string | null
          country: string | null
          domain: string
          emails: string[]
          first_seen_at: string
          industry: string | null
          last_run_id: string | null
          last_seen_at: string
          phones: string[]
          socials: Json
          summary: string | null
          times_seen: number
          user_id: string
          whatsapp: string[]
        }
        Insert: {
          company_name?: string | null
          contact_page?: string | null
          country?: string | null
          domain: string
          emails?: string[]
          first_seen_at?: string
          industry?: string | null
          last_run_id?: string | null
          last_seen_at?: string
          phones?: string[]
          socials?: Json
          summary?: string | null
          times_seen?: number
          user_id: string
          whatsapp?: string[]
        }
        Update: {
          company_name?: string | null
          contact_page?: string | null
          country?: string | null
          domain?: string
          emails?: string[]
          first_seen_at?: string
          industry?: string | null
          last_run_id?: string | null
          last_seen_at?: string
          phones?: string[]
          socials?: Json
          summary?: string | null
          times_seen?: number
          user_id?: string
          whatsapp?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "contacts_last_run_id_fkey"
            columns: ["last_run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          created_at: string
          delta: number
          id: number
          note: string | null
          reason: string
          run_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: never
          note?: string | null
          reason: string
          run_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: never
          note?: string | null
          reason?: string
          run_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          credits: number
          credits_reset_at: string
          default_options: Json
          monthly_grant: number
          plan: string
          user_id: string
          webhook_url: string | null
        }
        Insert: {
          created_at?: string
          credits?: number
          credits_reset_at?: string
          default_options?: Json
          monthly_grant?: number
          plan?: string
          user_id: string
          webhook_url?: string | null
        }
        Update: {
          created_at?: string
          credits?: number
          credits_reset_at?: string
          default_options?: Json
          monthly_grant?: number
          plan?: string
          user_id?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      run_sites: {
        Row: {
          attempts: number
          charged: boolean
          claimed_at: string | null
          domain: string | null
          finished_at: string | null
          id: number
          input: string
          new_values: Json | null
          position: number
          result: Json | null
          run_id: string
          status: string
          status_note: string | null
          user_id: string
        }
        Insert: {
          attempts?: number
          charged?: boolean
          claimed_at?: string | null
          domain?: string | null
          finished_at?: string | null
          id?: never
          input: string
          new_values?: Json | null
          position: number
          result?: Json | null
          run_id: string
          status?: string
          status_note?: string | null
          user_id: string
        }
        Update: {
          attempts?: number
          charged?: boolean
          claimed_at?: string | null
          domain?: string | null
          finished_at?: string | null
          id?: never
          input?: string
          new_values?: Json | null
          position?: number
          result?: Json | null
          run_id?: string
          status?: string
          status_note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_sites_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          charged: number
          created_at: string
          empty: number
          failed: number
          finished_at: string | null
          found: number
          id: string
          max_charge: number | null
          name: string
          options: Json
          parent_run_id: string | null
          processed: number
          source: string
          started_at: string | null
          status: string
          total: number
          user_id: string
          webhook_sent_at: string | null
          webhook_url: string | null
        }
        Insert: {
          charged?: number
          created_at?: string
          empty?: number
          failed?: number
          finished_at?: string | null
          found?: number
          id?: string
          max_charge?: number | null
          name?: string
          options?: Json
          parent_run_id?: string | null
          processed?: number
          source?: string
          started_at?: string | null
          status?: string
          total?: number
          user_id: string
          webhook_sent_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          charged?: number
          created_at?: string
          empty?: number
          failed?: number
          finished_at?: string | null
          found?: number
          id?: string
          max_charge?: number | null
          name?: string
          options?: Json
          parent_run_id?: string | null
          processed?: number
          source?: string
          started_at?: string | null
          status?: string
          total?: number
          user_id?: string
          webhook_sent_at?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "runs_parent_run_id_fkey"
            columns: ["parent_run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_monthly_grant: {
        Args: { p_user: string }
        Returns: {
          created_at: string
          credits: number
          credits_reset_at: string
          default_options: Json
          monthly_grant: number
          plan: string
          user_id: string
          webhook_url: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      charge_site: { Args: { p_site: number }; Returns: boolean }
      claim_sites: {
        Args: { p_limit: number; p_run: string }
        Returns: {
          attempts: number
          charged: boolean
          claimed_at: string | null
          domain: string | null
          finished_at: string | null
          id: number
          input: string
          new_values: Json | null
          position: number
          result: Json | null
          run_id: string
          status: string
          status_note: string | null
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "run_sites"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      refresh_run: {
        Args: { p_run: string }
        Returns: {
          charged: number
          created_at: string
          empty: number
          failed: number
          finished_at: string | null
          found: number
          id: string
          max_charge: number | null
          name: string
          options: Json
          parent_run_id: string | null
          processed: number
          source: string
          started_at: string | null
          status: string
          total: number
          user_id: string
          webhook_sent_at: string | null
          webhook_url: string | null
        }
        SetofOptions: {
          from: "*"
          to: "runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

