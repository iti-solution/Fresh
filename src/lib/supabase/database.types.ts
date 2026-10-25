export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      attachments: {
        Row: {
          created_at: string;
          event_id: string | null;
          id: string;
          kind: string;
          stop_id: string | null;
          storage_path: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          event_id?: string | null;
          id?: string;
          kind: string;
          stop_id?: string | null;
          storage_path: string;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          event_id?: string | null;
          id?: string;
          kind?: string;
          stop_id?: string | null;
          storage_path?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attachments_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "delivery_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attachments_stop_id_fkey";
            columns: ["stop_id"];
            isOneToOne: false;
            referencedRelation: "route_stops";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attachments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          created_at: string;
          diff: Json | null;
          entity: string;
          entity_id: string | null;
          id: number;
          tenant_id: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          created_at?: string;
          diff?: Json | null;
          entity: string;
          entity_id?: string | null;
          id?: number;
          tenant_id: string;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string;
          diff?: Json | null;
          entity?: string;
          entity_id?: string | null;
          id?: number;
          tenant_id?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      carriers: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          nip: string | null;
          phone: string | null;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          nip?: string | null;
          phone?: string | null;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          nip?: string | null;
          phone?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "carriers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      cash_movements: {
        Row: {
          amount: number;
          created_at: string;
          created_by: string | null;
          id: string;
          movement_group: string;
          note: string | null;
          order_id: string | null;
          party_id: string | null;
          party_type: Database["public"]["Enums"]["cash_party"];
          reason: string;
          route_id: string | null;
          source_event_id: string | null;
          stop_id: string | null;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          movement_group: string;
          note?: string | null;
          order_id?: string | null;
          party_id?: string | null;
          party_type: Database["public"]["Enums"]["cash_party"];
          reason: string;
          route_id?: string | null;
          source_event_id?: string | null;
          stop_id?: string | null;
          tenant_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          movement_group?: string;
          note?: string | null;
          order_id?: string | null;
          party_id?: string | null;
          party_type?: Database["public"]["Enums"]["cash_party"];
          reason?: string;
          route_id?: string | null;
          source_event_id?: string | null;
          stop_id?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cash_movements_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cash_movements_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cash_movements_source_event_id_fkey";
            columns: ["source_event_id"];
            isOneToOne: false;
            referencedRelation: "delivery_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cash_movements_stop_id_fkey";
            columns: ["stop_id"];
            isOneToOne: false;
            referencedRelation: "route_stops";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cash_movements_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: {
          category: string | null;
          created_at: string;
          external_code: string | null;
          id: string;
          is_active: boolean;
          name: string;
          nip: string | null;
          notes: string | null;
          sales_rep_name: string | null;
          sales_rep_phone: string | null;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          category?: string | null;
          created_at?: string;
          external_code?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          nip?: string | null;
          notes?: string | null;
          sales_rep_name?: string | null;
          sales_rep_phone?: string | null;
          tenant_id: string;
        };
        Update: {
          category?: string | null;
          created_at?: string;
          external_code?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          nip?: string | null;
          notes?: string | null;
          sales_rep_name?: string | null;
          sales_rep_phone?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      delivery_events: {
        Row: {
          client_event_id: string;
          driver_id: string | null;
          id: string;
          location: unknown;
          occurred_at: string;
          payload: NonNullable<Json>;
          received_at: string;
          route_id: string;
          stop_id: string | null;
          tenant_id: string;
          type: string;
        };
        ComputedFields: never;
        Insert: {
          client_event_id: string;
          driver_id?: string | null;
          id?: string;
          location?: unknown;
          occurred_at: string;
          payload?: NonNullable<Json>;
          received_at?: string;
          route_id: string;
          stop_id?: string | null;
          tenant_id: string;
          type: string;
        };
        Update: {
          client_event_id?: string;
          driver_id?: string | null;
          id?: string;
          location?: unknown;
          occurred_at?: string;
          payload?: NonNullable<Json>;
          received_at?: string;
          route_id?: string;
          stop_id?: string | null;
          tenant_id?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "delivery_events_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "drivers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "delivery_events_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "delivery_events_stop_id_fkey";
            columns: ["stop_id"];
            isOneToOne: false;
            referencedRelation: "route_stops";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "delivery_events_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      delivery_point_exceptions: {
        Row: {
          closes_at: string | null;
          date: string;
          delivery_point_id: string | null;
          id: string;
          is_closed: boolean;
          opens_at: string | null;
          reason: string | null;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          closes_at?: string | null;
          date: string;
          delivery_point_id?: string | null;
          id?: string;
          is_closed?: boolean;
          opens_at?: string | null;
          reason?: string | null;
          tenant_id: string;
        };
        Update: {
          closes_at?: string | null;
          date?: string;
          delivery_point_id?: string | null;
          id?: string;
          is_closed?: boolean;
          opens_at?: string | null;
          reason?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "delivery_point_exceptions_delivery_point_id_fkey";
            columns: ["delivery_point_id"];
            isOneToOne: false;
            referencedRelation: "delivery_points";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "delivery_point_exceptions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      delivery_point_notes: {
        Row: {
          created_at: string;
          created_by: string | null;
          delivery_point_id: string;
          id: string;
          tenant_id: string;
          text: string;
          valid_from: string;
          valid_to: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          delivery_point_id: string;
          id?: string;
          tenant_id: string;
          text: string;
          valid_from?: string;
          valid_to?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          delivery_point_id?: string;
          id?: string;
          tenant_id?: string;
          text?: string;
          valid_from?: string;
          valid_to?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "delivery_point_notes_delivery_point_id_fkey";
            columns: ["delivery_point_id"];
            isOneToOne: false;
            referencedRelation: "delivery_points";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "delivery_point_notes_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      delivery_point_windows: {
        Row: {
          closes_at: string;
          delivery_point_id: string;
          id: string;
          opens_at: string;
          tenant_id: string;
          weekday: number;
        };
        ComputedFields: never;
        Insert: {
          closes_at: string;
          delivery_point_id: string;
          id?: string;
          opens_at: string;
          tenant_id: string;
          weekday: number;
        };
        Update: {
          closes_at?: string;
          delivery_point_id?: string;
          id?: string;
          opens_at?: string;
          tenant_id?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: "delivery_point_windows_delivery_point_id_fkey";
            columns: ["delivery_point_id"];
            isOneToOne: false;
            referencedRelation: "delivery_points";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "delivery_point_windows_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      delivery_points: {
        Row: {
          access_instructions: string | null;
          active_from: string | null;
          active_to: string | null;
          address_line: string;
          branch_type: Database["public"]["Enums"]["branch_type"];
          call_instructions: string | null;
          city: string | null;
          contact_phone: string | null;
          created_at: string;
          customer_id: string;
          delivery_weekdays: number[];
          driver_instructions: string | null;
          external_code: string | null;
          floor: string | null;
          geocode_status: Database["public"]["Enums"]["geocode_status"];
          id: string;
          is_active: boolean;
          location: unknown;
          location_locked: boolean;
          name: string;
          postal_code: string | null;
          service_minutes: number;
          tenant_id: string;
          unloading_zone: string | null;
        };
        ComputedFields: never;
        Insert: {
          access_instructions?: string | null;
          active_from?: string | null;
          active_to?: string | null;
          address_line: string;
          branch_type?: Database["public"]["Enums"]["branch_type"];
          call_instructions?: string | null;
          city?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          customer_id: string;
          delivery_weekdays?: number[];
          driver_instructions?: string | null;
          external_code?: string | null;
          floor?: string | null;
          geocode_status?: Database["public"]["Enums"]["geocode_status"];
          id?: string;
          is_active?: boolean;
          location?: unknown;
          location_locked?: boolean;
          name: string;
          postal_code?: string | null;
          service_minutes?: number;
          tenant_id: string;
          unloading_zone?: string | null;
        };
        Update: {
          access_instructions?: string | null;
          active_from?: string | null;
          active_to?: string | null;
          address_line?: string;
          branch_type?: Database["public"]["Enums"]["branch_type"];
          call_instructions?: string | null;
          city?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          customer_id?: string;
          delivery_weekdays?: number[];
          driver_instructions?: string | null;
          external_code?: string | null;
          floor?: string | null;
          geocode_status?: Database["public"]["Enums"]["geocode_status"];
          id?: string;
          is_active?: boolean;
          location?: unknown;
          location_locked?: boolean;
          name?: string;
          postal_code?: string | null;
          service_minutes?: number;
          tenant_id?: string;
          unloading_zone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "delivery_points_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "delivery_points_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      depots: {
        Row: {
          address: string;
          created_at: string;
          id: string;
          location: unknown;
          name: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          address: string;
          created_at?: string;
          id?: string;
          location?: unknown;
          name: string;
          tenant_id: string;
        };
        Update: {
          address?: string;
          created_at?: string;
          id?: string;
          location?: unknown;
          name?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "depots_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      driver_pay_rules: {
        Row: {
          components: NonNullable<Json>;
          created_at: string;
          driver_id: string | null;
          id: string;
          tenant_id: string;
          valid_from: string;
          valid_to: string | null;
        };
        ComputedFields: never;
        Insert: {
          components: NonNullable<Json>;
          created_at?: string;
          driver_id?: string | null;
          id?: string;
          tenant_id: string;
          valid_from: string;
          valid_to?: string | null;
        };
        Update: {
          components?: NonNullable<Json>;
          created_at?: string;
          driver_id?: string | null;
          id?: string;
          tenant_id?: string;
          valid_from?: string;
          valid_to?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "driver_pay_rules_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "drivers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "driver_pay_rules_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      driver_positions: {
        Row: {
          accuracy_m: number | null;
          driver_id: string;
          id: number;
          location: unknown;
          received_at: string;
          recorded_at: string;
          route_id: string | null;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          accuracy_m?: number | null;
          driver_id: string;
          id?: number;
          location: unknown;
          received_at?: string;
          recorded_at: string;
          route_id?: string | null;
          tenant_id: string;
        };
        Update: {
          accuracy_m?: number | null;
          driver_id?: string;
          id?: number;
          location?: unknown;
          received_at?: string;
          recorded_at?: string;
          route_id?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "driver_positions_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "drivers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "driver_positions_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "driver_positions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      driver_settlement_lines: {
        Row: {
          amount: number;
          component: string;
          id: string;
          note: string | null;
          quantity: number;
          rate: number;
          route_id: string | null;
          rule_id: string | null;
          settlement_id: string;
          tenant_id: string;
          work_date: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          component: string;
          id?: string;
          note?: string | null;
          quantity: number;
          rate: number;
          route_id?: string | null;
          rule_id?: string | null;
          settlement_id: string;
          tenant_id: string;
          work_date: string;
        };
        Update: {
          amount?: number;
          component?: string;
          id?: string;
          note?: string | null;
          quantity?: number;
          rate?: number;
          route_id?: string | null;
          rule_id?: string | null;
          settlement_id?: string;
          tenant_id?: string;
          work_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "driver_settlement_lines_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "driver_settlement_lines_rule_id_fkey";
            columns: ["rule_id"];
            isOneToOne: false;
            referencedRelation: "driver_pay_rules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "driver_settlement_lines_settlement_id_fkey";
            columns: ["settlement_id"];
            isOneToOne: false;
            referencedRelation: "driver_settlements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "driver_settlement_lines_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      driver_settlements: {
        Row: {
          approved_by: string | null;
          created_at: string;
          driver_id: string;
          id: string;
          period_end: string;
          period_start: string;
          status: Database["public"]["Enums"]["settlement_status"];
          tenant_id: string;
          total_amount: number;
        };
        ComputedFields: never;
        Insert: {
          approved_by?: string | null;
          created_at?: string;
          driver_id: string;
          id?: string;
          period_end: string;
          period_start: string;
          status?: Database["public"]["Enums"]["settlement_status"];
          tenant_id: string;
          total_amount?: number;
        };
        Update: {
          approved_by?: string | null;
          created_at?: string;
          driver_id?: string;
          id?: string;
          period_end?: string;
          period_start?: string;
          status?: Database["public"]["Enums"]["settlement_status"];
          tenant_id?: string;
          total_amount?: number;
        };
        Relationships: [
          {
            foreignKeyName: "driver_settlements_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "drivers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "driver_settlements_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      drivers: {
        Row: {
          created_at: string;
          default_vehicle_id: string | null;
          employment_type: string | null;
          first_name: string;
          id: string;
          is_active: boolean;
          last_name: string;
          phone: string | null;
          pin_failed_count: number;
          pin_hash: string | null;
          pin_locked_until: string | null;
          tenant_id: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          default_vehicle_id?: string | null;
          employment_type?: string | null;
          first_name: string;
          id?: string;
          is_active?: boolean;
          last_name: string;
          phone?: string | null;
          pin_failed_count?: number;
          pin_hash?: string | null;
          pin_locked_until?: string | null;
          tenant_id: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          default_vehicle_id?: string | null;
          employment_type?: string | null;
          first_name?: string;
          id?: string;
          is_active?: boolean;
          last_name?: string;
          phone?: string | null;
          pin_failed_count?: number;
          pin_hash?: string | null;
          pin_locked_until?: string | null;
          tenant_id?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "drivers_default_vehicle_id_fkey";
            columns: ["default_vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "drivers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      memberships: {
        Row: {
          created_at: string;
          role: Database["public"]["Enums"]["member_role"];
          tenant_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          role: Database["public"]["Enums"]["member_role"];
          tenant_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          role?: Database["public"]["Enums"]["member_role"];
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      order_imports: {
        Row: {
          column_mapping: Json | null;
          created_at: string;
          created_by: string | null;
          file_path: string | null;
          id: string;
          rows_ok: number | null;
          rows_total: number | null;
          rows_unmatched: number | null;
          source: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          column_mapping?: Json | null;
          created_at?: string;
          created_by?: string | null;
          file_path?: string | null;
          id?: string;
          rows_ok?: number | null;
          rows_total?: number | null;
          rows_unmatched?: number | null;
          source?: string;
          tenant_id: string;
        };
        Update: {
          column_mapping?: Json | null;
          created_at?: string;
          created_by?: string | null;
          file_path?: string | null;
          id?: string;
          rows_ok?: number | null;
          rows_total?: number | null;
          rows_unmatched?: number | null;
          source?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_imports_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          cod_amount: number | null;
          crates: number;
          created_at: string;
          delivery_date: string;
          delivery_point_id: string | null;
          external_ref: string | null;
          id: string;
          import_id: string | null;
          notes: string | null;
          notes_logistics: string | null;
          notes_sales: string | null;
          order_value: number | null;
          pallets: number;
          parent_order_id: string | null;
          priority: number;
          raw_address: string | null;
          readiness: Database["public"]["Enums"]["order_readiness"];
          status: Database["public"]["Enums"]["order_status"];
          tenant_id: string;
          type: Database["public"]["Enums"]["order_type"];
          volume_m3: number;
          weight_kg: number;
          window_end: string | null;
          window_start: string | null;
        };
        ComputedFields: never;
        Insert: {
          cod_amount?: number | null;
          crates?: number;
          created_at?: string;
          delivery_date: string;
          delivery_point_id?: string | null;
          external_ref?: string | null;
          id?: string;
          import_id?: string | null;
          notes?: string | null;
          notes_logistics?: string | null;
          notes_sales?: string | null;
          order_value?: number | null;
          pallets?: number;
          parent_order_id?: string | null;
          priority?: number;
          raw_address?: string | null;
          readiness?: Database["public"]["Enums"]["order_readiness"];
          status?: Database["public"]["Enums"]["order_status"];
          tenant_id: string;
          type?: Database["public"]["Enums"]["order_type"];
          volume_m3?: number;
          weight_kg?: number;
          window_end?: string | null;
          window_start?: string | null;
        };
        Update: {
          cod_amount?: number | null;
          crates?: number;
          created_at?: string;
          delivery_date?: string;
          delivery_point_id?: string | null;
          external_ref?: string | null;
          id?: string;
          import_id?: string | null;
          notes?: string | null;
          notes_logistics?: string | null;
          notes_sales?: string | null;
          order_value?: number | null;
          pallets?: number;
          parent_order_id?: string | null;
          priority?: number;
          raw_address?: string | null;
          readiness?: Database["public"]["Enums"]["order_readiness"];
          status?: Database["public"]["Enums"]["order_status"];
          tenant_id?: string;
          type?: Database["public"]["Enums"]["order_type"];
          volume_m3?: number;
          weight_kg?: number;
          window_end?: string | null;
          window_start?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "orders_delivery_point_id_fkey";
            columns: ["delivery_point_id"];
            isOneToOne: false;
            referencedRelation: "delivery_points";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_import_id_fkey";
            columns: ["import_id"];
            isOneToOne: false;
            referencedRelation: "order_imports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_parent_order_id_fkey";
            columns: ["parent_order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      packaging_movements: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          movement_group: string;
          note: string | null;
          packaging_type_id: string;
          party_id: string;
          party_type: Database["public"]["Enums"]["party_type"];
          qty: number;
          reason: string;
          source_event_id: string | null;
          stop_id: string | null;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          movement_group: string;
          note?: string | null;
          packaging_type_id: string;
          party_id: string;
          party_type: Database["public"]["Enums"]["party_type"];
          qty: number;
          reason: string;
          source_event_id?: string | null;
          stop_id?: string | null;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          movement_group?: string;
          note?: string | null;
          packaging_type_id?: string;
          party_id?: string;
          party_type?: Database["public"]["Enums"]["party_type"];
          qty?: number;
          reason?: string;
          source_event_id?: string | null;
          stop_id?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "packaging_movements_packaging_type_id_fkey";
            columns: ["packaging_type_id"];
            isOneToOne: false;
            referencedRelation: "packaging_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "packaging_movements_source_event_id_fkey";
            columns: ["source_event_id"];
            isOneToOne: false;
            referencedRelation: "delivery_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "packaging_movements_stop_id_fkey";
            columns: ["stop_id"];
            isOneToOne: false;
            referencedRelation: "route_stops";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "packaging_movements_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      packaging_types: {
        Row: {
          code: string;
          deposit_value: number | null;
          id: string;
          is_active: boolean;
          name: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          deposit_value?: number | null;
          id?: string;
          is_active?: boolean;
          name: string;
          tenant_id: string;
        };
        Update: {
          code?: string;
          deposit_value?: number | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "packaging_types_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      route_audits: {
        Row: {
          baseline_km: number | null;
          baseline_minutes: number | null;
          company_name: string | null;
          contact_email: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          created_at: string;
          created_by: string | null;
          est_monthly_saving_pln: number | null;
          id: string;
          optimized_km: number | null;
          optimized_minutes: number | null;
          result: Json | null;
          source_file: string | null;
          status: string;
          stops_count: number | null;
          tenant_id: string | null;
          vehicles_count: number | null;
          window_conflicts: number | null;
        };
        ComputedFields: never;
        Insert: {
          baseline_km?: number | null;
          baseline_minutes?: number | null;
          company_name?: string | null;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          created_by?: string | null;
          est_monthly_saving_pln?: number | null;
          id?: string;
          optimized_km?: number | null;
          optimized_minutes?: number | null;
          result?: Json | null;
          source_file?: string | null;
          status?: string;
          stops_count?: number | null;
          tenant_id?: string | null;
          vehicles_count?: number | null;
          window_conflicts?: number | null;
        };
        Update: {
          baseline_km?: number | null;
          baseline_minutes?: number | null;
          company_name?: string | null;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          created_by?: string | null;
          est_monthly_saving_pln?: number | null;
          id?: string;
          optimized_km?: number | null;
          optimized_minutes?: number | null;
          result?: Json | null;
          source_file?: string | null;
          status?: string;
          stops_count?: number | null;
          tenant_id?: string | null;
          vehicles_count?: number | null;
          window_conflicts?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "route_audits_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      route_stop_orders: {
        Row: {
          order_id: string;
          stop_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          order_id: string;
          stop_id: string;
          tenant_id: string;
        };
        Update: {
          order_id?: string;
          stop_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "route_stop_orders_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "route_stop_orders_stop_id_fkey";
            columns: ["stop_id"];
            isOneToOne: false;
            referencedRelation: "route_stops";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "route_stop_orders_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      route_stops: {
        Row: {
          arrived_at: string | null;
          completed_at: string | null;
          delivery_point_id: string;
          id: string;
          planned_arrival: string | null;
          route_id: string;
          sequence: number;
          status: Database["public"]["Enums"]["stop_status"];
          tenant_id: string;
          window_end: string | null;
          window_start: string | null;
        };
        ComputedFields: never;
        Insert: {
          arrived_at?: string | null;
          completed_at?: string | null;
          delivery_point_id: string;
          id?: string;
          planned_arrival?: string | null;
          route_id: string;
          sequence: number;
          status?: Database["public"]["Enums"]["stop_status"];
          tenant_id: string;
          window_end?: string | null;
          window_start?: string | null;
        };
        Update: {
          arrived_at?: string | null;
          completed_at?: string | null;
          delivery_point_id?: string;
          id?: string;
          planned_arrival?: string | null;
          route_id?: string;
          sequence?: number;
          status?: Database["public"]["Enums"]["stop_status"];
          tenant_id?: string;
          window_end?: string | null;
          window_start?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "route_stops_delivery_point_id_fkey";
            columns: ["delivery_point_id"];
            isOneToOne: false;
            referencedRelation: "delivery_points";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "route_stops_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "route_stops_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      route_template_points: {
        Row: {
          delivery_point_id: string;
          sequence: number;
          template_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          delivery_point_id: string;
          sequence: number;
          template_id: string;
          tenant_id: string;
        };
        Update: {
          delivery_point_id?: string;
          sequence?: number;
          template_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "route_template_points_delivery_point_id_fkey";
            columns: ["delivery_point_id"];
            isOneToOne: false;
            referencedRelation: "delivery_points";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "route_template_points_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "route_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "route_template_points_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      route_templates: {
        Row: {
          default_driver_id: string | null;
          default_vehicle_id: string | null;
          depot_id: string | null;
          id: string;
          is_active: boolean;
          name: string;
          planned_start: string | null;
          tenant_id: string;
          weekdays: number[];
        };
        ComputedFields: never;
        Insert: {
          default_driver_id?: string | null;
          default_vehicle_id?: string | null;
          depot_id?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          planned_start?: string | null;
          tenant_id: string;
          weekdays?: number[];
        };
        Update: {
          default_driver_id?: string | null;
          default_vehicle_id?: string | null;
          depot_id?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          planned_start?: string | null;
          tenant_id?: string;
          weekdays?: number[];
        };
        Relationships: [
          {
            foreignKeyName: "route_templates_default_driver_id_fkey";
            columns: ["default_driver_id"];
            isOneToOne: false;
            referencedRelation: "drivers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "route_templates_default_vehicle_id_fkey";
            columns: ["default_vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "route_templates_depot_id_fkey";
            columns: ["depot_id"];
            isOneToOne: false;
            referencedRelation: "depots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "route_templates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      routes: {
        Row: {
          actual_km: number | null;
          carrier_id: string | null;
          closed_at: string | null;
          closed_by: string | null;
          course_no: number;
          created_at: string;
          depot_id: string | null;
          driver_id: string | null;
          extra_reason: string | null;
          geometry: unknown;
          id: string;
          kind: Database["public"]["Enums"]["route_kind"];
          name: string;
          odometer_end: number | null;
          odometer_start: number | null;
          planned_km: number | null;
          planned_minutes: number | null;
          planned_start: string | null;
          route_date: string;
          status: Database["public"]["Enums"]["route_status"];
          template_id: string | null;
          tenant_id: string;
          vehicle_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          actual_km?: number | null;
          carrier_id?: string | null;
          closed_at?: string | null;
          closed_by?: string | null;
          course_no?: number;
          created_at?: string;
          depot_id?: string | null;
          driver_id?: string | null;
          extra_reason?: string | null;
          geometry?: unknown;
          id?: string;
          kind?: Database["public"]["Enums"]["route_kind"];
          name: string;
          odometer_end?: number | null;
          odometer_start?: number | null;
          planned_km?: number | null;
          planned_minutes?: number | null;
          planned_start?: string | null;
          route_date: string;
          status?: Database["public"]["Enums"]["route_status"];
          template_id?: string | null;
          tenant_id: string;
          vehicle_id?: string | null;
        };
        Update: {
          actual_km?: number | null;
          carrier_id?: string | null;
          closed_at?: string | null;
          closed_by?: string | null;
          course_no?: number;
          created_at?: string;
          depot_id?: string | null;
          driver_id?: string | null;
          extra_reason?: string | null;
          geometry?: unknown;
          id?: string;
          kind?: Database["public"]["Enums"]["route_kind"];
          name?: string;
          odometer_end?: number | null;
          odometer_start?: number | null;
          planned_km?: number | null;
          planned_minutes?: number | null;
          planned_start?: string | null;
          route_date?: string;
          status?: Database["public"]["Enums"]["route_status"];
          template_id?: string | null;
          tenant_id?: string;
          vehicle_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "routes_carrier_id_fkey";
            columns: ["carrier_id"];
            isOneToOne: false;
            referencedRelation: "carriers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "routes_depot_id_fkey";
            columns: ["depot_id"];
            isOneToOne: false;
            referencedRelation: "depots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "routes_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "drivers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "routes_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "route_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "routes_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "routes_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      spatial_ref_sys: {
        Row: {
          auth_name: string | null;
          auth_srid: number | null;
          proj4text: string | null;
          srid: number;
          srtext: string | null;
        };
        ComputedFields: never;
        Insert: {
          auth_name?: string | null;
          auth_srid?: number | null;
          proj4text?: string | null;
          srid: number;
          srtext?: string | null;
        };
        Update: {
          auth_name?: string | null;
          auth_srid?: number | null;
          proj4text?: string | null;
          srid?: number;
          srtext?: string | null;
        };
        Relationships: [];
      };
      tenants: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          nip: string | null;
          settings: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          nip?: string | null;
          settings?: NonNullable<Json>;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          nip?: string | null;
          settings?: NonNullable<Json>;
        };
        Relationships: [];
      };
      vehicles: {
        Row: {
          body_type: string | null;
          capacity_crates: number;
          capacity_kg: number;
          capacity_m3: number;
          capacity_pallets: number;
          carrier_id: string | null;
          cost_per_km: number | null;
          created_at: string;
          default_driver_id: string | null;
          driver_cost_per_day: number | null;
          fixed_cost_per_day: number | null;
          id: string;
          is_own: boolean;
          name: string | null;
          registration: string;
          status: Database["public"]["Enums"]["vehicle_status"];
          tenant_id: string;
          vehicle_type: string | null;
        };
        ComputedFields: never;
        Insert: {
          body_type?: string | null;
          capacity_crates?: number;
          capacity_kg?: number;
          capacity_m3?: number;
          capacity_pallets?: number;
          carrier_id?: string | null;
          cost_per_km?: number | null;
          created_at?: string;
          default_driver_id?: string | null;
          driver_cost_per_day?: number | null;
          fixed_cost_per_day?: number | null;
          id?: string;
          is_own?: boolean;
          name?: string | null;
          registration: string;
          status?: Database["public"]["Enums"]["vehicle_status"];
          tenant_id: string;
          vehicle_type?: string | null;
        };
        Update: {
          body_type?: string | null;
          capacity_crates?: number;
          capacity_kg?: number;
          capacity_m3?: number;
          capacity_pallets?: number;
          carrier_id?: string | null;
          cost_per_km?: number | null;
          created_at?: string;
          default_driver_id?: string | null;
          driver_cost_per_day?: number | null;
          fixed_cost_per_day?: number | null;
          id?: string;
          is_own?: boolean;
          name?: string | null;
          registration?: string;
          status?: Database["public"]["Enums"]["vehicle_status"];
          tenant_id?: string;
          vehicle_type?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "vehicles_carrier_id_fkey";
            columns: ["carrier_id"];
            isOneToOne: false;
            referencedRelation: "carriers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicles_default_driver_fk";
            columns: ["default_driver_id"];
            isOneToOne: false;
            referencedRelation: "drivers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      cash_balances: {
        Row: {
          balance: number | null;
          party_id: string | null;
          party_type: Database["public"]["Enums"]["cash_party"];
          tenant_id: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "cash_movements_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      geography_columns: {
        Row: {
          coord_dimension: number | null;
          f_geography_column: unknown;
          f_table_catalog: unknown;
          f_table_name: unknown;
          f_table_schema: unknown;
          srid: number | null;
          type: string | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
      geometry_columns: {
        Row: {
          coord_dimension: number | null;
          f_geometry_column: unknown;
          f_table_catalog: string | null;
          f_table_name: unknown;
          f_table_schema: unknown;
          srid: number | null;
          type: string | null;
        };
        ComputedFields: never;
        Insert: {
          coord_dimension?: number | null;
          f_geometry_column?: unknown;
          f_table_catalog?: string | null;
          f_table_name?: unknown;
          f_table_schema?: unknown;
          srid?: number | null;
          type?: string | null;
        };
        Update: {
          coord_dimension?: number | null;
          f_geometry_column?: unknown;
          f_table_catalog?: string | null;
          f_table_name?: unknown;
          f_table_schema?: unknown;
          srid?: number | null;
          type?: string | null;
        };
        Relationships: [];
      };
      packaging_balances: {
        Row: {
          balance: number | null;
          packaging_type_id: string;
          party_id: string;
          party_type: Database["public"]["Enums"]["party_type"];
          tenant_id: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "packaging_movements_packaging_type_id_fkey";
            columns: ["packaging_type_id"];
            isOneToOne: false;
            referencedRelation: "packaging_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "packaging_movements_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string };
        Returns: undefined;
      };
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown };
        Returns: unknown;
      };
      _postgis_pgsql_version: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      _postgis_scripts_pgsql_version: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown };
        Returns: number;
      };
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown };
        Returns: string;
      };
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_dwithin: {
        Args: {
          geog1: unknown;
          geog2: unknown;
          tolerance: number;
          use_spheroid?: boolean;
        };
        Returns: boolean;
      };
      _st_equals: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown };
        Returns: number;
      };
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_sortablehash: { Args: { geom: unknown }; Returns: number };
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_voronoi: {
        Args: {
          clip?: unknown;
          g1: unknown;
          return_polygons?: boolean;
          tolerance?: number;
        };
        Returns: unknown;
      };
      _st_within: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      addauth: { Args: { "": string }; Returns: boolean };
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string;
              column_name: string;
              new_dim: number;
              new_srid_in: number;
              new_type: string;
              schema_name: string;
              table_name: string;
              use_typmod?: boolean;
            };
            Returns: string;
          }
        | {
            Args: {
              column_name: string;
              new_dim: number;
              new_srid: number;
              new_type: string;
              schema_name: string;
              table_name: string;
              use_typmod?: boolean;
            };
            Returns: string;
          }
        | {
            Args: {
              column_name: string;
              new_dim: number;
              new_srid: number;
              new_type: string;
              table_name: string;
              use_typmod?: boolean;
            };
            Returns: string;
          };
      assign_order_to_route: {
        Args: { p_order: string; p_route: string };
        Returns: undefined;
      };
      create_day_routes: {
        Args: { p_date: string; p_tenant: string };
        Returns: Json;
      };
      create_demo_tenant: { Args: Record<PropertyKey, never>; Returns: string };
      create_tenant: { Args: { p_name: string }; Returns: string };
      current_driver_ids: {
        Args: Record<PropertyKey, never>;
        Returns: string[];
      };
      dearmor: { Args: { "": string }; Returns: string };
      disablelongtransactions: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      driver_route_ids: { Args: Record<PropertyKey, never>; Returns: string[] };
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string;
              column_name: string;
              schema_name: string;
              table_name: string;
            };
            Returns: string;
          }
        | {
            Args: {
              column_name: string;
              schema_name: string;
              table_name: string;
            };
            Returns: string;
          }
        | {
            Args: { column_name: string; table_name: string };
            Returns: string;
          };
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string;
              schema_name: string;
              table_name: string;
            };
            Returns: string;
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string };
      enablelongtransactions: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      gen_random_uuid: { Args: Record<PropertyKey, never>; Returns: string };
      gen_salt: { Args: { "": string }; Returns: string };
      geometry: { Args: { "": string }; Returns: unknown };
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geomfromewkt: { Args: { "": string }; Returns: unknown };
      gettransactionid: { Args: Record<PropertyKey, never>; Returns: unknown };
      has_role: {
        Args: {
          roles: Database["public"]["Enums"]["member_role"][];
          t: string;
        };
        Returns: boolean;
      };
      is_member: { Args: { t: string }; Returns: boolean };
      longtransactionsenabled: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      move_stop: {
        Args: { p_dir: number; p_stop: string };
        Returns: undefined;
      };
      pgp_armor_headers: {
        Args: { "": string };
        Returns: Record<string, unknown>[];
      };
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string };
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string };
        Returns: number;
      };
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string };
        Returns: number;
      };
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string };
        Returns: string;
      };
      postgis_extensions_upgrade: {
        Args: { target_version?: string };
        Returns: string;
      };
      postgis_full_version: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      postgis_geos_compiled_version: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      postgis_geos_version: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      postgis_lib_build_date: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      postgis_lib_revision: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      postgis_lib_version: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      postgis_libjson_version: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      postgis_liblwgeom_version: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      postgis_libprotobuf_version: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      postgis_libxml_version: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      postgis_proj_version: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      postgis_scripts_build_date: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      postgis_scripts_installed: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      postgis_scripts_released: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      postgis_srs: {
        Args: { auth_name: string; auth_srid: string };
        Returns: {
          auth_name: string;
          auth_srid: string;
          point_ne: unknown;
          point_sw: unknown;
          proj4text: string;
          srname: string;
          srtext: string;
        }[];
      };
      postgis_srs_all: {
        Args: Record<PropertyKey, never>;
        Returns: {
          auth_name: string;
          auth_srid: string;
          point_ne: unknown;
          point_sw: unknown;
          proj4text: string;
          srname: string;
          srtext: string;
        }[];
      };
      postgis_srs_codes: { Args: { auth_name: string }; Returns: string[] };
      postgis_srs_search: {
        Args: { authname?: string; bounds: unknown };
        Returns: {
          auth_name: string;
          auth_srid: string;
          point_ne: unknown;
          point_sw: unknown;
          proj4text: string;
          srname: string;
          srtext: string;
        }[];
      };
      postgis_svn_version: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      postgis_transform_pipeline_geometry: {
        Args: {
          forward: boolean;
          geom: unknown;
          pipeline: string;
          to_srid: number;
        };
        Returns: unknown;
      };
      postgis_type_name: {
        Args: {
          coord_dimension: number;
          geomname: string;
          use_new_name?: boolean;
        };
        Returns: string;
      };
      postgis_version: { Args: Record<PropertyKey, never>; Returns: string };
      postgis_wagyu_version: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      resequence_route: { Args: { p_route: string }; Returns: undefined };
      reset_demo_tenant: { Args: Record<PropertyKey, never>; Returns: string };
      set_driver_pin: {
        Args: { p_driver: string; p_pin: string };
        Returns: undefined;
      };
      sort_route_by_window: { Args: { p_route: string }; Returns: undefined };
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown };
            Returns: number;
          };
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number };
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number };
        Returns: string;
      };
      st_asewkt: { Args: { "": string }; Returns: string };
      st_asgeojson:
        | {
            Args: {
              geog: unknown;
              maxdecimaldigits?: number;
              options?: number;
            };
            Returns: string;
          }
        | {
            Args: {
              geom: unknown;
              maxdecimaldigits?: number;
              options?: number;
            };
            Returns: string;
          }
        | {
            Args: {
              geom_column?: string;
              maxdecimaldigits?: number;
              pretty_bool?: boolean;
              r: Record<string, unknown>;
            };
            Returns: string;
          }
        | { Args: { "": string }; Returns: string };
      st_asgml:
        | {
            Args: {
              geog: unknown;
              id?: string;
              maxdecimaldigits?: number;
              nprefix?: string;
              options?: number;
            };
            Returns: string;
          }
        | {
            Args: {
              geom: unknown;
              maxdecimaldigits?: number;
              options?: number;
            };
            Returns: string;
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown;
              id?: string;
              maxdecimaldigits?: number;
              nprefix?: string;
              options?: number;
              version: number;
            };
            Returns: string;
          }
        | {
            Args: {
              geom: unknown;
              id?: string;
              maxdecimaldigits?: number;
              nprefix?: string;
              options?: number;
              version: number;
            };
            Returns: string;
          };
      st_askml:
        | {
            Args: {
              geog: unknown;
              maxdecimaldigits?: number;
              nprefix?: string;
            };
            Returns: string;
          }
        | {
            Args: {
              geom: unknown;
              maxdecimaldigits?: number;
              nprefix?: string;
            };
            Returns: string;
          }
        | { Args: { "": string }; Returns: string };
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string };
        Returns: string;
      };
      st_asmarc21: {
        Args: { format?: string; geom: unknown };
        Returns: string;
      };
      st_asmvtgeom: {
        Args: {
          bounds: unknown;
          buffer?: number;
          clip_geom?: boolean;
          extent?: number;
          geom: unknown;
        };
        Returns: unknown;
      };
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number };
            Returns: string;
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number };
            Returns: string;
          }
        | { Args: { "": string }; Returns: string };
      st_astext: { Args: { "": string }; Returns: string };
      st_astwkb:
        | {
            Args: {
              geom: unknown;
              prec?: number;
              prec_m?: number;
              prec_z?: number;
              with_boxes?: boolean;
              with_sizes?: boolean;
            };
            Returns: string;
          }
        | {
            Args: {
              geom: unknown[];
              ids: number[];
              prec?: number;
              prec_m?: number;
              prec_z?: number;
              with_boxes?: boolean;
              with_sizes?: boolean;
            };
            Returns: string;
          };
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number };
        Returns: string;
      };
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number };
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown };
        Returns: unknown;
      };
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number };
            Returns: unknown;
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number };
            Returns: unknown;
          };
      st_centroid: { Args: { "": string }; Returns: unknown };
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown };
        Returns: unknown;
      };
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_collect: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean;
          param_geom: unknown;
          param_pctconvex: number;
        };
        Returns: unknown;
      };
      st_contains: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      st_coorddim: { Args: { geometry: unknown }; Returns: number };
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_crosses: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number };
        Returns: unknown;
      };
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number };
        Returns: unknown;
      };
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number };
        Returns: unknown;
      };
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean };
            Returns: number;
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number };
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number };
            Returns: number;
          };
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      st_dwithin: {
        Args: {
          geog1: unknown;
          geog2: unknown;
          tolerance: number;
          use_spheroid?: boolean;
        };
        Returns: boolean;
      };
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number };
            Returns: unknown;
          }
        | {
            Args: {
              dm?: number;
              dx: number;
              dy: number;
              dz?: number;
              geom: unknown;
            };
            Returns: unknown;
          };
      st_force3d: {
        Args: { geom: unknown; zvalue?: number };
        Returns: unknown;
      };
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number };
        Returns: unknown;
      };
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number };
        Returns: unknown;
      };
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number };
        Returns: unknown;
      };
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number };
            Returns: unknown;
          };
      st_geogfromtext: { Args: { "": string }; Returns: unknown };
      st_geographyfromtext: { Args: { "": string }; Returns: unknown };
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string };
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown };
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean;
          g: unknown;
          max_iter?: number;
          tolerance?: number;
        };
        Returns: unknown;
      };
      st_geometryfromtext: { Args: { "": string }; Returns: unknown };
      st_geomfromewkt: { Args: { "": string }; Returns: unknown };
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown };
      st_geomfromgml: { Args: { "": string }; Returns: unknown };
      st_geomfromkml: { Args: { "": string }; Returns: unknown };
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown };
      st_geomfromtext: { Args: { "": string }; Returns: unknown };
      st_gmltosql: { Args: { "": string }; Returns: unknown };
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean };
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      st_hexagon: {
        Args: {
          cell_i: number;
          cell_j: number;
          origin?: unknown;
          size: number;
        };
        Returns: unknown;
      };
      st_hexagongrid: {
        Args: { bounds: unknown; size: number };
        Returns: Record<string, unknown>[];
      };
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown };
        Returns: number;
      };
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number };
        Returns: unknown;
      };
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_inversetransformpipeline: {
        Args: { geom: unknown; pipeline: string; to_srid?: number };
        Returns: unknown;
      };
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown };
        Returns: Database["public"]["CompositeTypes"]["valid_detail"];
        SetofOptions: {
          from: "*";
          to: "valid_detail";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      st_largestemptycircle: {
        Args: { boundary?: unknown; geom: unknown; tolerance?: number };
        Returns: Record<string, unknown>;
      };
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number };
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown };
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown };
        Returns: number;
      };
      st_lineextend: {
        Args: {
          distance_backward?: number;
          distance_forward: number;
          geom: unknown;
        };
        Returns: unknown;
      };
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string };
        Returns: unknown;
      };
      st_linefromtext: { Args: { "": string }; Returns: unknown };
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown };
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number };
        Returns: unknown;
      };
      st_locatebetween: {
        Args: {
          frommeasure: number;
          geometry: unknown;
          leftrightoffset?: number;
          tomeasure: number;
        };
        Returns: unknown;
      };
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number };
        Returns: unknown;
      };
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_makevalid: {
        Args: { geom: unknown; params: string };
        Returns: unknown;
      };
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number };
        Returns: unknown;
      };
      st_mlinefromtext: { Args: { "": string }; Returns: unknown };
      st_mpointfromtext: { Args: { "": string }; Returns: unknown };
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown };
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown };
      st_multipointfromtext: { Args: { "": string }; Returns: unknown };
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown };
      st_node: { Args: { g: unknown }; Returns: unknown };
      st_normalize: { Args: { geom: unknown }; Returns: unknown };
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string };
        Returns: unknown;
      };
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean };
        Returns: number;
      };
      st_pointfromtext: { Args: { "": string }; Returns: unknown };
      st_pointm: {
        Args: {
          mcoordinate: number;
          srid?: number;
          xcoordinate: number;
          ycoordinate: number;
        };
        Returns: unknown;
      };
      st_pointz: {
        Args: {
          srid?: number;
          xcoordinate: number;
          ycoordinate: number;
          zcoordinate: number;
        };
        Returns: unknown;
      };
      st_pointzm: {
        Args: {
          mcoordinate: number;
          srid?: number;
          xcoordinate: number;
          ycoordinate: number;
          zcoordinate: number;
        };
        Returns: unknown;
      };
      st_polyfromtext: { Args: { "": string }; Returns: unknown };
      st_polygonfromtext: { Args: { "": string }; Returns: unknown };
      st_project:
        | {
            Args: { azimuth: number; distance: number; geog: unknown };
            Returns: unknown;
          }
        | {
            Args: { distance: number; geog_from: unknown; geog_to: unknown };
            Returns: unknown;
          }
        | {
            Args: { azimuth: number; distance: number; geom1: unknown };
            Returns: unknown;
          }
        | {
            Args: { distance: number; geom1: unknown; geom2: unknown };
            Returns: unknown;
          };
      st_quantizecoordinates: {
        Args: {
          g: unknown;
          prec_m?: number;
          prec_x: number;
          prec_y?: number;
          prec_z?: number;
        };
        Returns: unknown;
      };
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number };
        Returns: unknown;
      };
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string };
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number };
        Returns: unknown;
      };
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number };
        Returns: unknown;
      };
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown };
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number };
        Returns: unknown;
      };
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown };
      st_square: {
        Args: {
          cell_i: number;
          cell_j: number;
          origin?: unknown;
          size: number;
        };
        Returns: unknown;
      };
      st_squaregrid: {
        Args: { bounds: unknown; size: number };
        Returns: Record<string, unknown>[];
      };
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number };
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number };
        Returns: unknown[];
      };
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown };
        Returns: unknown;
      };
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number };
        Returns: unknown;
      };
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_tileenvelope: {
        Args: {
          bounds?: unknown;
          margin?: number;
          x: number;
          y: number;
          zoom: number;
        };
        Returns: unknown;
      };
      st_touches: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string };
            Returns: unknown;
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number };
            Returns: unknown;
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown };
      st_transformpipeline: {
        Args: { geom: unknown; pipeline: string; to_srid?: number };
        Returns: unknown;
      };
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown };
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number };
            Returns: unknown;
          };
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number };
        Returns: unknown;
      };
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number };
        Returns: unknown;
      };
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown };
      st_wkttosql: { Args: { "": string }; Returns: unknown };
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number };
        Returns: unknown;
      };
      touch_route: { Args: { p_route: string }; Returns: undefined };
      unassign_order: { Args: { p_order: string }; Returns: undefined };
      unlockrows: { Args: { "": string }; Returns: number };
      updategeometrysrid: {
        Args: {
          catalogn_name: string;
          column_name: string;
          new_srid_in: number;
          schema_name: string;
          table_name: string;
        };
        Returns: string;
      };
      verify_driver_pin: {
        Args: { p_driver: string; p_pin: string };
        Returns: string;
      };
    };
    Enums: {
      branch_type:
        "restaurant" | "kitchen" | "bar" | "warehouse" | "hotel" | "other";
      cash_party: "customer" | "driver" | "office";
      geocode_status: "pending" | "ok" | "ambiguous" | "failed" | "manual";
      member_role:
        | "admin"
        | "dispatcher"
        | "driver"
        | "viewer"
        | "customer_service"
        | "management";
      order_readiness: "awaiting_warehouse" | "ready";
      order_status:
        | "new"
        | "unmatched"
        | "planned"
        | "in_progress"
        | "delivered"
        | "partial"
        | "failed"
        | "cancelled";
      order_type: "delivery" | "pickup";
      party_type: "customer" | "driver" | "carrier" | "depot";
      route_kind:
        | "regular"
        | "second"
        | "extra"
        | "emergency"
        | "weekend"
        | "express"
        | "dowozka";
      route_status:
        | "draft"
        | "planned"
        | "dispatched"
        | "in_progress"
        | "completed"
        | "closed"
        | "cancelled";
      settlement_status: "draft" | "approved" | "exported";
      stop_status:
        | "pending"
        | "arrived"
        | "delivered"
        | "partial"
        | "refused"
        | "absent"
        | "skipped"
        | "in_progress"
        | "complaint";
      vehicle_status: "active" | "service" | "inactive";
    };
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null;
        geom: unknown;
      };
      valid_detail: {
        valid: boolean | null;
        reason: string | null;
        location: unknown;
      };
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      branch_type: [
        "restaurant",
        "kitchen",
        "bar",
        "warehouse",
        "hotel",
        "other",
      ],
      cash_party: ["customer", "driver", "office"],
      geocode_status: ["pending", "ok", "ambiguous", "failed", "manual"],
      member_role: [
        "admin",
        "dispatcher",
        "driver",
        "viewer",
        "customer_service",
        "management",
      ],
      order_readiness: ["awaiting_warehouse", "ready"],
      order_status: [
        "new",
        "unmatched",
        "planned",
        "in_progress",
        "delivered",
        "partial",
        "failed",
        "cancelled",
      ],
      order_type: ["delivery", "pickup"],
      party_type: ["customer", "driver", "carrier", "depot"],
      route_kind: [
        "regular",
        "second",
        "extra",
        "emergency",
        "weekend",
        "express",
        "dowozka",
      ],
      route_status: [
        "draft",
        "planned",
        "dispatched",
        "in_progress",
        "completed",
        "closed",
        "cancelled",
      ],
      settlement_status: ["draft", "approved", "exported"],
      stop_status: [
        "pending",
        "arrived",
        "delivered",
        "partial",
        "refused",
        "absent",
        "skipped",
        "in_progress",
        "complaint",
      ],
      vehicle_status: ["active", "service", "inactive"],
    },
  },
} as const;
