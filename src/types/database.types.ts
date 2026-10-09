
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "driver_documents": {
                  Row: {
                    "created_at": string,"driver_id": string,"file_name": string,"id": string,"mime_type": string,"size_bytes": number,"storage_path": string,"type": Database["public"]['Enums']["document_type"],"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"driver_id": string,"file_name": string,"id"?: string,"mime_type": string,"size_bytes": number,"storage_path": string,"type": Database["public"]['Enums']["document_type"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"driver_id"?: string,"file_name"?: string,"id"?: string,"mime_type"?: string,"size_bytes"?: number,"storage_path"?: string,"type"?: Database["public"]['Enums']["document_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "driver_documents_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    }
                  ]
                },"drivers": {
                  Row: {
                    "availability": (Database["public"]['Enums']["availability_type"])[],"bio": string | null,"card_completed": boolean,"cdl_class": Database["public"]['Enums']["cdl_class"],"certifications": (string)[],"city": string | null,"clearinghouse_registered": boolean | null,"created_at": string,"driving_styles": (Database["public"]['Enums']["driving_style"])[],"employment_type": Database["public"]['Enums']["employment_type"] | null,"endorsements": (Database["public"]['Enums']["endorsement"])[],"equipment_types": (Database["public"]['Enums']["equipment_type"])[],"full_name": string,"id": string,"lat": number | null,"lng": number | null,"medical_card_active": boolean | null,"mvr_status": Database["public"]['Enums']["mvr_status"] | null,"onboarding_step": number,"operator_types": (Database["public"]['Enums']["operator_type"])[],"profile_id": string,"service_radius_miles": number,"sms_opt_in": boolean,"sms_opt_in_at": string | null,"sms_opt_in_text": string | null,"sms_opted_out": boolean,"sms_opted_out_at": string | null,"state": string | null,"transmission": Database["public"]['Enums']["transmission_type"] | null,"twic_active": boolean | null,"updated_at": string,"years_experience": number | null,"zip": string | null
                  }
                  Insert: {
                    "availability"?: (Database["public"]['Enums']["availability_type"])[],"bio"?: string | null,"card_completed"?: boolean,"cdl_class"?: Database["public"]['Enums']["cdl_class"],"certifications"?: (string)[],"city"?: string | null,"clearinghouse_registered"?: boolean | null,"created_at"?: string,"driving_styles"?: (Database["public"]['Enums']["driving_style"])[],"employment_type"?: Database["public"]['Enums']["employment_type"] | null,"endorsements"?: (Database["public"]['Enums']["endorsement"])[],"equipment_types"?: (Database["public"]['Enums']["equipment_type"])[],"full_name": string,"id"?: string,"lat"?: number | null,"lng"?: number | null,"medical_card_active"?: boolean | null,"mvr_status"?: Database["public"]['Enums']["mvr_status"] | null,"onboarding_step"?: number,"operator_types"?: (Database["public"]['Enums']["operator_type"])[],"profile_id": string,"service_radius_miles"?: number,"sms_opt_in"?: boolean,"sms_opt_in_at"?: string | null,"sms_opt_in_text"?: string | null,"sms_opted_out"?: boolean,"sms_opted_out_at"?: string | null,"state"?: string | null,"transmission"?: Database["public"]['Enums']["transmission_type"] | null,"twic_active"?: boolean | null,"updated_at"?: string,"years_experience"?: number | null,"zip"?: string | null
                  }
                  Update: {
                    "availability"?: (Database["public"]['Enums']["availability_type"])[],"bio"?: string | null,"card_completed"?: boolean,"cdl_class"?: Database["public"]['Enums']["cdl_class"],"certifications"?: (string)[],"city"?: string | null,"clearinghouse_registered"?: boolean | null,"created_at"?: string,"driving_styles"?: (Database["public"]['Enums']["driving_style"])[],"employment_type"?: Database["public"]['Enums']["employment_type"] | null,"endorsements"?: (Database["public"]['Enums']["endorsement"])[],"equipment_types"?: (Database["public"]['Enums']["equipment_type"])[],"full_name"?: string,"id"?: string,"lat"?: number | null,"lng"?: number | null,"medical_card_active"?: boolean | null,"mvr_status"?: Database["public"]['Enums']["mvr_status"] | null,"onboarding_step"?: number,"operator_types"?: (Database["public"]['Enums']["operator_type"])[],"profile_id"?: string,"service_radius_miles"?: number,"sms_opt_in"?: boolean,"sms_opt_in_at"?: string | null,"sms_opt_in_text"?: string | null,"sms_opted_out"?: boolean,"sms_opted_out_at"?: string | null,"state"?: string | null,"transmission"?: Database["public"]['Enums']["transmission_type"] | null,"twic_active"?: boolean | null,"updated_at"?: string,"years_experience"?: number | null,"zip"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "drivers_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"id": string,"phone": string,"role": Database["public"]['Enums']["user_role"],"status": Database["public"]['Enums']["account_status"],"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"id": string,"phone": string,"role": Database["public"]['Enums']["user_role"],"status"?: Database["public"]['Enums']["account_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"phone"?: string,"role"?: Database["public"]['Enums']["user_role"],"status"?: Database["public"]['Enums']["account_status"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"service_areas": {
                  Row: {
                    "center_lat": number,"center_lng": number,"center_zip": string,"created_at": string,"id": string,"is_active": boolean,"name": string,"radius_miles": number,"updated_at": string
                  }
                  Insert: {
                    "center_lat": number,"center_lng": number,"center_zip": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"radius_miles": number,"updated_at"?: string
                  }
                  Update: {
                    "center_lat"?: number,"center_lng"?: number,"center_zip"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"radius_miles"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"sms_consent_log": {
                  Row: {
                    "consent_text": string,"consent_version": string,"created_at": string,"event": Database["public"]['Enums']["sms_consent_event"],"id": string,"phone": string,"source": Database["public"]['Enums']["sms_consent_source"]
                  }
                  Insert: {
                    "consent_text": string,"consent_version": string,"created_at"?: string,"event": Database["public"]['Enums']["sms_consent_event"],"id"?: string,"phone": string,"source": Database["public"]['Enums']["sms_consent_source"]
                  }
                  Update: {
                    "consent_text"?: string,"consent_version"?: string,"created_at"?: string,"event"?: Database["public"]['Enums']["sms_consent_event"],"id"?: string,"phone"?: string,"source"?: Database["public"]['Enums']["sms_consent_source"]
                  }
                  Relationships: [
                    
                  ]
                },"tos_acceptances": {
                  Row: {
                    "accepted_at": string,"created_at": string,"id": string,"ip": string | null,"profile_id": string,"updated_at": string,"user_agent": string | null,"version": string
                  }
                  Insert: {
                    "accepted_at"?: string,"created_at"?: string,"id"?: string,"ip"?: string | null,"profile_id": string,"updated_at"?: string,"user_agent"?: string | null,"version": string
                  }
                  Update: {
                    "accepted_at"?: string,"created_at"?: string,"id"?: string,"ip"?: string | null,"profile_id"?: string,"updated_at"?: string,"user_agent"?: string | null,"version"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tos_acceptances_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "auth_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["user_role"]
                           },
"current_driver_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_in_service_area":
{ Args: { "lat": number,"lng": number }; Returns: boolean
                           },
"is_privileged":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"miles_between":
{ Args: { "lat1": number,"lat2": number,"lng1": number,"lng2": number }; Returns: number
                           }
          }
          Enums: {
            "account_status": "pending"|"approved"|"blocked","availability_type": "full_time"|"part_time"|"on_call"|"weekends","cdl_class": "A"|"B"|"C"|"none","document_type": "cdl_front"|"cdl_back"|"medical_card"|"certification"|"other","driving_style": "local_day_cab"|"yard_spotter"|"regional"|"otr","employment_type": "w2"|"owner_operator_1099"|"either","endorsement": "H"|"N"|"P"|"S"|"T"|"X","equipment_type": "container_drayage"|"dry_van"|"flatbed"|"reefer"|"yard_mule","mvr_status": "clean"|"minor_1_2"|"major_3_plus","operator_type": "cdl_driver"|"yard_spotter"|"mechanic","sms_consent_event": "opt_in"|"opt_out"|"opt_in_again","sms_consent_source": "onboarding"|"sms_stop"|"sms_start"|"profile","transmission_type": "automatic_only"|"manual_ok","user_role": "driver"|"carrier"|"admin"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "account_status": ["pending", "approved", "blocked"],"availability_type": ["full_time", "part_time", "on_call", "weekends"],"cdl_class": ["A", "B", "C", "none"],"document_type": ["cdl_front", "cdl_back", "medical_card", "certification", "other"],"driving_style": ["local_day_cab", "yard_spotter", "regional", "otr"],"employment_type": ["w2", "owner_operator_1099", "either"],"endorsement": ["H", "N", "P", "S", "T", "X"],"equipment_type": ["container_drayage", "dry_van", "flatbed", "reefer", "yard_mule"],"mvr_status": ["clean", "minor_1_2", "major_3_plus"],"operator_type": ["cdl_driver", "yard_spotter", "mechanic"],"sms_consent_event": ["opt_in", "opt_out", "opt_in_again"],"sms_consent_source": ["onboarding", "sms_stop", "sms_start", "profile"],"transmission_type": ["automatic_only", "manual_ok"],"user_role": ["driver", "carrier", "admin"]
          }
        }
} as const

