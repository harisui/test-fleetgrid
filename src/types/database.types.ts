
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
            "admin_audit_log": {
                  Row: {
                    "action": string,"admin_id": string,"admin_phone": string,"created_at": string,"detail": NonNullable<Json>,"id": string,"target_id": string,"target_type": string
                  }
                  Insert: {
                    "action": string,"admin_id": string,"admin_phone": string,"created_at"?: string,"detail"?: NonNullable<Json>,"id"?: string,"target_id": string,"target_type": string
                  }
                  Update: {
                    "action"?: string,"admin_id"?: string,"admin_phone"?: string,"created_at"?: string,"detail"?: NonNullable<Json>,"id"?: string,"target_id"?: string,"target_type"?: string
                  }
                  Relationships: [
                    
                  ]
                },"broadcast_recipients": {
                  Row: {
                    "code": string,"created_at": string,"delivered_at": string | null,"driver_id": string,"error_code": string | null,"id": string,"message_sid": string | null,"position": number,"replied_at": string | null,"round": number,"sent_at": string | null,"shift_id": string,"status": Database["public"]['Enums']["recipient_status"],"updated_at": string
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"delivered_at"?: string | null,"driver_id": string,"error_code"?: string | null,"id"?: string,"message_sid"?: string | null,"position": number,"replied_at"?: string | null,"round": number,"sent_at"?: string | null,"shift_id": string,"status"?: Database["public"]['Enums']["recipient_status"],"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"delivered_at"?: string | null,"driver_id"?: string,"error_code"?: string | null,"id"?: string,"message_sid"?: string | null,"position"?: number,"replied_at"?: string | null,"round"?: number,"sent_at"?: string | null,"shift_id"?: string,"status"?: Database["public"]['Enums']["recipient_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "broadcast_recipients_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "broadcast_recipients_shift_id_fkey"
      columns: ["shift_id"]
isOneToOne: false
      referencedRelation: "shifts"
      referencedColumns: ["id"]
    }
                  ]
                },"carrier_waitlist": {
                  Row: {
                    "carrier_id": string,"created_at": string,"id": string,"lat": number,"lng": number,"updated_at": string,"zip": string
                  }
                  Insert: {
                    "carrier_id": string,"created_at"?: string,"id"?: string,"lat": number,"lng": number,"updated_at"?: string,"zip": string
                  }
                  Update: {
                    "carrier_id"?: string,"created_at"?: string,"id"?: string,"lat"?: number,"lng"?: number,"updated_at"?: string,"zip"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "carrier_waitlist_carrier_id_fkey"
      columns: ["carrier_id"]
isOneToOne: true
      referencedRelation: "carriers"
      referencedColumns: ["id"]
    }
                  ]
                },"carriers": {
                  Row: {
                    "billing_email": string,"city": string,"company_name": string,"contact_name": string,"created_at": string,"id": string,"lat": number,"lng": number,"mc": string | null,"profile_id": string,"state": string,"stripe_customer_id": string | null,"updated_at": string,"usdot": string | null,"zip": string
                  }
                  Insert: {
                    "billing_email": string,"city": string,"company_name": string,"contact_name": string,"created_at"?: string,"id"?: string,"lat": number,"lng": number,"mc"?: string | null,"profile_id": string,"state": string,"stripe_customer_id"?: string | null,"updated_at"?: string,"usdot"?: string | null,"zip": string
                  }
                  Update: {
                    "billing_email"?: string,"city"?: string,"company_name"?: string,"contact_name"?: string,"created_at"?: string,"id"?: string,"lat"?: number,"lng"?: number,"mc"?: string | null,"profile_id"?: string,"state"?: string,"stripe_customer_id"?: string | null,"updated_at"?: string,"usdot"?: string | null,"zip"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "carriers_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"driver_clearinghouse_self_reports": {
                  Row: {
                    "confirmed": boolean,"confirmed_at": string,"driver_id": string
                  }
                  Insert: {
                    "confirmed"?: boolean,"confirmed_at"?: string,"driver_id": string
                  }
                  Update: {
                    "confirmed"?: boolean,"confirmed_at"?: string,"driver_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "driver_clearinghouse_self_reports_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: true
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    }
                  ]
                },"driver_documents": {
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
                    "approval_text_due_at": string | null,"approval_text_sent_at": string | null,"availability": (Database["public"]['Enums']["availability_type"])[],"bio": string | null,"card_completed": boolean,"cdl_class": Database["public"]['Enums']["cdl_class"],"cdl_state": string | null,"certifications": (string)[],"city": string | null,"clearinghouse_registered": boolean | null,"created_at": string,"driving_styles": (Database["public"]['Enums']["driving_style"])[],"employment_type": Database["public"]['Enums']["employment_type"] | null,"endorsements": (Database["public"]['Enums']["endorsement"])[],"equipment_types": (Database["public"]['Enums']["equipment_type"])[],"full_name": string,"heard_from": Database["public"]['Enums']["heard_from"] | null,"heard_from_other": string | null,"id": string,"lat": number | null,"lng": number | null,"medical_card_active": boolean | null,"mvr_status": Database["public"]['Enums']["mvr_status"] | null,"no_show_count": number,"onboarding_step": number,"operator_types": (Database["public"]['Enums']["operator_type"])[],"profile_id": string,"reminder_sent_at": string | null,"service_radius_miles": number,"shifts_paused": boolean,"sms_opt_in": boolean,"sms_opt_in_at": string | null,"sms_opt_in_text": string | null,"sms_opted_out": boolean,"sms_opted_out_at": string | null,"state": string | null,"transmission": Database["public"]['Enums']["transmission_type"] | null,"twic_active": boolean | null,"updated_at": string,"years_experience": number | null,"zip": string | null
                  }
                  Insert: {
                    "approval_text_due_at"?: string | null,"approval_text_sent_at"?: string | null,"availability"?: (Database["public"]['Enums']["availability_type"])[],"bio"?: string | null,"card_completed"?: boolean,"cdl_class"?: Database["public"]['Enums']["cdl_class"],"cdl_state"?: string | null,"certifications"?: (string)[],"city"?: string | null,"clearinghouse_registered"?: boolean | null,"created_at"?: string,"driving_styles"?: (Database["public"]['Enums']["driving_style"])[],"employment_type"?: Database["public"]['Enums']["employment_type"] | null,"endorsements"?: (Database["public"]['Enums']["endorsement"])[],"equipment_types"?: (Database["public"]['Enums']["equipment_type"])[],"full_name": string,"heard_from"?: Database["public"]['Enums']["heard_from"] | null,"heard_from_other"?: string | null,"id"?: string,"lat"?: number | null,"lng"?: number | null,"medical_card_active"?: boolean | null,"mvr_status"?: Database["public"]['Enums']["mvr_status"] | null,"no_show_count"?: number,"onboarding_step"?: number,"operator_types"?: (Database["public"]['Enums']["operator_type"])[],"profile_id": string,"reminder_sent_at"?: string | null,"service_radius_miles"?: number,"shifts_paused"?: boolean,"sms_opt_in"?: boolean,"sms_opt_in_at"?: string | null,"sms_opt_in_text"?: string | null,"sms_opted_out"?: boolean,"sms_opted_out_at"?: string | null,"state"?: string | null,"transmission"?: Database["public"]['Enums']["transmission_type"] | null,"twic_active"?: boolean | null,"updated_at"?: string,"years_experience"?: number | null,"zip"?: string | null
                  }
                  Update: {
                    "approval_text_due_at"?: string | null,"approval_text_sent_at"?: string | null,"availability"?: (Database["public"]['Enums']["availability_type"])[],"bio"?: string | null,"card_completed"?: boolean,"cdl_class"?: Database["public"]['Enums']["cdl_class"],"cdl_state"?: string | null,"certifications"?: (string)[],"city"?: string | null,"clearinghouse_registered"?: boolean | null,"created_at"?: string,"driving_styles"?: (Database["public"]['Enums']["driving_style"])[],"employment_type"?: Database["public"]['Enums']["employment_type"] | null,"endorsements"?: (Database["public"]['Enums']["endorsement"])[],"equipment_types"?: (Database["public"]['Enums']["equipment_type"])[],"full_name"?: string,"heard_from"?: Database["public"]['Enums']["heard_from"] | null,"heard_from_other"?: string | null,"id"?: string,"lat"?: number | null,"lng"?: number | null,"medical_card_active"?: boolean | null,"mvr_status"?: Database["public"]['Enums']["mvr_status"] | null,"no_show_count"?: number,"onboarding_step"?: number,"operator_types"?: (Database["public"]['Enums']["operator_type"])[],"profile_id"?: string,"reminder_sent_at"?: string | null,"service_radius_miles"?: number,"shifts_paused"?: boolean,"sms_opt_in"?: boolean,"sms_opt_in_at"?: string | null,"sms_opt_in_text"?: string | null,"sms_opted_out"?: boolean,"sms_opted_out_at"?: string | null,"state"?: string | null,"transmission"?: Database["public"]['Enums']["transmission_type"] | null,"twic_active"?: boolean | null,"updated_at"?: string,"years_experience"?: number | null,"zip"?: string | null
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
                },"notice_batches": {
                  Row: {
                    "area_id": string | null,"body": string,"category": Database["public"]['Enums']["notice_category"],"created_at": string,"created_by": string,"excluded_blocked": number,"excluded_no_consent": number,"excluded_opted_out": number,"id": string,"recipient_count": number,"restores_batch_id": string | null,"send_after": string | null,"sent_at": string | null,"status": Database["public"]['Enums']["notice_status"],"updated_at": string,"variables": NonNullable<Json>
                  }
                  Insert: {
                    "area_id"?: string | null,"body": string,"category": Database["public"]['Enums']["notice_category"],"created_at"?: string,"created_by": string,"excluded_blocked"?: number,"excluded_no_consent"?: number,"excluded_opted_out"?: number,"id"?: string,"recipient_count"?: number,"restores_batch_id"?: string | null,"send_after"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["notice_status"],"updated_at"?: string,"variables"?: NonNullable<Json>
                  }
                  Update: {
                    "area_id"?: string | null,"body"?: string,"category"?: Database["public"]['Enums']["notice_category"],"created_at"?: string,"created_by"?: string,"excluded_blocked"?: number,"excluded_no_consent"?: number,"excluded_opted_out"?: number,"id"?: string,"recipient_count"?: number,"restores_batch_id"?: string | null,"send_after"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["notice_status"],"updated_at"?: string,"variables"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "notice_batches_area_id_fkey"
      columns: ["area_id"]
isOneToOne: false
      referencedRelation: "service_areas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notice_batches_restores_batch_id_fkey"
      columns: ["restores_batch_id"]
isOneToOne: false
      referencedRelation: "notice_batches"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"id": string,"phone": string,"qr_link_id": string | null,"role": Database["public"]['Enums']["user_role"],"signup_landing_path": string | null,"signup_referrer": string | null,"signup_utm_campaign": string | null,"signup_utm_content": string | null,"signup_utm_medium": string | null,"signup_utm_source": string | null,"status": Database["public"]['Enums']["account_status"],"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"id": string,"phone": string,"qr_link_id"?: string | null,"role": Database["public"]['Enums']["user_role"],"signup_landing_path"?: string | null,"signup_referrer"?: string | null,"signup_utm_campaign"?: string | null,"signup_utm_content"?: string | null,"signup_utm_medium"?: string | null,"signup_utm_source"?: string | null,"status"?: Database["public"]['Enums']["account_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"phone"?: string,"qr_link_id"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"signup_landing_path"?: string | null,"signup_referrer"?: string | null,"signup_utm_campaign"?: string | null,"signup_utm_content"?: string | null,"signup_utm_medium"?: string | null,"signup_utm_source"?: string | null,"status"?: Database["public"]['Enums']["account_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_qr_link_id_fkey"
      columns: ["qr_link_id"]
isOneToOne: false
      referencedRelation: "qr_links"
      referencedColumns: ["id"]
    }
                  ]
                },"qr_links": {
                  Row: {
                    "campaign": string,"created_at": string,"created_by": string,"id": string,"is_active": boolean,"location_name": string,"slug": string,"target_path": string,"updated_at": string,"utm_medium": string,"utm_source": string
                  }
                  Insert: {
                    "campaign": string,"created_at"?: string,"created_by": string,"id"?: string,"is_active"?: boolean,"location_name": string,"slug": string,"target_path"?: string,"updated_at"?: string,"utm_medium"?: string,"utm_source"?: string
                  }
                  Update: {
                    "campaign"?: string,"created_at"?: string,"created_by"?: string,"id"?: string,"is_active"?: boolean,"location_name"?: string,"slug"?: string,"target_path"?: string,"updated_at"?: string,"utm_medium"?: string,"utm_source"?: string
                  }
                  Relationships: [
                    
                  ]
                },"qr_scans": {
                  Row: {
                    "id": string,"ip_hash": string | null,"qr_link_id": string,"scanned_at": string,"user_agent": string | null
                  }
                  Insert: {
                    "id"?: string,"ip_hash"?: string | null,"qr_link_id": string,"scanned_at"?: string,"user_agent"?: string | null
                  }
                  Update: {
                    "id"?: string,"ip_hash"?: string | null,"qr_link_id"?: string,"scanned_at"?: string,"user_agent"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "qr_scans_qr_link_id_fkey"
      columns: ["qr_link_id"]
isOneToOne: false
      referencedRelation: "qr_links"
      referencedColumns: ["id"]
    }
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
                },"shifts": {
                  Row: {
                    "booked_at": string | null,"booked_driver_id": string | null,"broadcast_at": string | null,"broadcast_round": number,"cancel_reason": string | null,"cancelled_at": string | null,"carrier_id": string,"cdl_class": Database["public"]['Enums']["cdl_class"],"city": string,"created_at": string,"endorsements": (Database["public"]['Enums']["endorsement"])[],"ends_at": string,"equipment_types": (Database["public"]['Enums']["equipment_type"])[],"id": string,"lat": number,"lng": number,"manual_required": boolean,"medical_required": boolean,"min_years": number,"onsite_contact_name": string,"onsite_contact_phone": string,"pay_text": string | null,"released_at": string | null,"send_after": string | null,"short_code": string,"starts_at": string,"state": string,"status": Database["public"]['Enums']["shift_status"],"twic_required": boolean,"updated_at": string,"work_description": string,"zip": string
                  }
                  Insert: {
                    "booked_at"?: string | null,"booked_driver_id"?: string | null,"broadcast_at"?: string | null,"broadcast_round"?: number,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"carrier_id": string,"cdl_class"?: Database["public"]['Enums']["cdl_class"],"city": string,"created_at"?: string,"endorsements"?: (Database["public"]['Enums']["endorsement"])[],"ends_at": string,"equipment_types"?: (Database["public"]['Enums']["equipment_type"])[],"id"?: string,"lat": number,"lng": number,"manual_required"?: boolean,"medical_required"?: boolean,"min_years"?: number,"onsite_contact_name": string,"onsite_contact_phone": string,"pay_text"?: string | null,"released_at"?: string | null,"send_after"?: string | null,"short_code": string,"starts_at": string,"state": string,"status"?: Database["public"]['Enums']["shift_status"],"twic_required"?: boolean,"updated_at"?: string,"work_description": string,"zip": string
                  }
                  Update: {
                    "booked_at"?: string | null,"booked_driver_id"?: string | null,"broadcast_at"?: string | null,"broadcast_round"?: number,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"carrier_id"?: string,"cdl_class"?: Database["public"]['Enums']["cdl_class"],"city"?: string,"created_at"?: string,"endorsements"?: (Database["public"]['Enums']["endorsement"])[],"ends_at"?: string,"equipment_types"?: (Database["public"]['Enums']["equipment_type"])[],"id"?: string,"lat"?: number,"lng"?: number,"manual_required"?: boolean,"medical_required"?: boolean,"min_years"?: number,"onsite_contact_name"?: string,"onsite_contact_phone"?: string,"pay_text"?: string | null,"released_at"?: string | null,"send_after"?: string | null,"short_code"?: string,"starts_at"?: string,"state"?: string,"status"?: Database["public"]['Enums']["shift_status"],"twic_required"?: boolean,"updated_at"?: string,"work_description"?: string,"zip"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shifts_booked_driver_id_fkey"
      columns: ["booked_driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shifts_carrier_id_fkey"
      columns: ["carrier_id"]
isOneToOne: false
      referencedRelation: "carriers"
      referencedColumns: ["id"]
    }
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
                },"sms_messages": {
                  Row: {
                    "body": string,"created_at": string,"direction": Database["public"]['Enums']["sms_direction"],"driver_id": string | null,"error_code": string | null,"from_phone": string,"id": string,"inbound_outcome": string | null,"kind": string,"notice_batch_id": string | null,"provider_sid": string | null,"resend_of": string | null,"shift_id": string | null,"status": string | null,"to_phone": string,"updated_at": string
                  }
                  Insert: {
                    "body": string,"created_at"?: string,"direction": Database["public"]['Enums']["sms_direction"],"driver_id"?: string | null,"error_code"?: string | null,"from_phone": string,"id"?: string,"inbound_outcome"?: string | null,"kind": string,"notice_batch_id"?: string | null,"provider_sid"?: string | null,"resend_of"?: string | null,"shift_id"?: string | null,"status"?: string | null,"to_phone": string,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"direction"?: Database["public"]['Enums']["sms_direction"],"driver_id"?: string | null,"error_code"?: string | null,"from_phone"?: string,"id"?: string,"inbound_outcome"?: string | null,"kind"?: string,"notice_batch_id"?: string | null,"provider_sid"?: string | null,"resend_of"?: string | null,"shift_id"?: string | null,"status"?: string | null,"to_phone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sms_messages_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "drivers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sms_messages_notice_batch_id_fkey"
      columns: ["notice_batch_id"]
isOneToOne: false
      referencedRelation: "notice_batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sms_messages_resend_of_fkey"
      columns: ["resend_of"]
isOneToOne: true
      referencedRelation: "sms_messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sms_messages_shift_id_fkey"
      columns: ["shift_id"]
isOneToOne: false
      referencedRelation: "shifts"
      referencedColumns: ["id"]
    }
                  ]
                },"subscriptions": {
                  Row: {
                    "cancel_at_period_end": boolean,"canceled_at": string | null,"carrier_id": string,"created_at": string,"current_period_end": string | null,"id": string,"price_id": string | null,"status": Database["public"]['Enums']["subscription_status"],"stripe_customer_id": string,"stripe_subscription_id": string,"updated_at": string
                  }
                  Insert: {
                    "cancel_at_period_end"?: boolean,"canceled_at"?: string | null,"carrier_id": string,"created_at"?: string,"current_period_end"?: string | null,"id"?: string,"price_id"?: string | null,"status": Database["public"]['Enums']["subscription_status"],"stripe_customer_id": string,"stripe_subscription_id": string,"updated_at"?: string
                  }
                  Update: {
                    "cancel_at_period_end"?: boolean,"canceled_at"?: string | null,"carrier_id"?: string,"created_at"?: string,"current_period_end"?: string | null,"id"?: string,"price_id"?: string | null,"status"?: Database["public"]['Enums']["subscription_status"],"stripe_customer_id"?: string,"stripe_subscription_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_carrier_id_fkey"
      columns: ["carrier_id"]
isOneToOne: false
      referencedRelation: "carriers"
      referencedColumns: ["id"]
    }
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
                },"webhook_events": {
                  Row: {
                    "created_at": string,"event_id": string,"id": string,"provider": string,"type": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"event_id": string,"id"?: string,"provider"?: string,"type": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"id"?: string,"provider"?: string,"type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
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
"booked_driver_contact":
{ Args: { "p_shift_id": string }; Returns: {
              "driver_id": string,"full_name": string,"phone": string
            }[]
                           },
"carrier_has_active_subscription":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"claim_approval_texts":
{ Args: { "p_driver_id"?: string }; Returns: {
              "driver_id": string,"phone": string
            }[]
                           },
"claim_profile_reminders":
{ Args: { "p_limit"?: number }; Returns: {
              "driver_id": string,"phone": string
            }[]
                           },
"claim_shift":
{ Args: { "p_code": string,"p_driver_id": string }; Returns: {
              "outcome": string,"shift_id": string
            }[]
                           },
"current_carrier_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"current_driver_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"expire_shifts":
{ Args: Record<PropertyKey, never>; Returns: number
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
"is_shift_carrier":
{ Args: { "p_shift_id": string }; Returns: boolean
                           },
"matching_drivers":
{ Args: { "p_cdl_class": Database["public"]['Enums']["cdl_class"],"p_endorsements"?: (Database["public"]['Enums']["endorsement"])[],"p_equipment"?: (Database["public"]['Enums']["equipment_type"])[],"p_exclude"?: (string)[],"p_lat": number,"p_lng": number,"p_manual"?: boolean,"p_medical"?: boolean,"p_min_years"?: number,"p_twic"?: boolean }; Returns: {
              "driver_id": string,"phone": string
            }[]
                           },
"miles_between":
{ Args: { "lat1": number,"lat2": number,"lng1": number,"lng2": number }; Returns: number
                           },
"new_shift_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"notice_recipients":
{ Args: { "p_area_id"?: string }; Returns: {
              "driver_id": string,"exclusion": string,"phone": string
            }[]
                           },
"profile_status":
{ Args: { "p_profile_id": string }; Returns: Database["public"]['Enums']["account_status"]
                           },
"queue_approval_text":
{ Args: { "p_driver_id": string,"p_due_at": string }; Returns: boolean
                           },
"release_shift":
{ Args: { "p_shift_id": string }; Returns: string
                           },
"search_drivers":
{ Args: { "p_cdl_class"?: Database["public"]['Enums']["cdl_class"],"p_endorsements"?: (Database["public"]['Enums']["endorsement"])[],"p_equipment"?: (Database["public"]['Enums']["equipment_type"])[],"p_lat": number,"p_limit"?: number,"p_lng": number,"p_manual"?: boolean,"p_medical"?: boolean,"p_min_years"?: number,"p_mvr_max"?: Database["public"]['Enums']["mvr_status"],"p_offset"?: number,"p_radius_miles": number,"p_twic"?: boolean }; Returns: {
              "distance_miles": number,"driver_id": string,"total_count": number
            }[]
                           }
          }
          Enums: {
            "account_status": "pending"|"approved"|"blocked","availability_type": "full_time"|"part_time"|"on_call"|"weekends","cdl_class": "A"|"B"|"none","document_type": "cdl_front"|"cdl_back"|"medical_card"|"certification"|"other","driving_style": "local_day_cab"|"regional","employment_type": "w2"|"contractor_1099"|"either","endorsement": "H"|"N"|"T"|"X","equipment_type": "container_drayage"|"dry_van"|"flatbed"|"reefer","heard_from": "flyer"|"facebook_instagram"|"google_search"|"friend_coworker"|"other","mvr_status": "clean"|"minor_1_2"|"major_3_plus","notice_category": "policy_change"|"service_notice"|"service_restored"|"account_security","notice_status": "queued"|"sending"|"sent","operator_type": "cdl_driver"|"yard_spotter"|"mechanic","recipient_status": "queued"|"sent"|"delivered"|"failed"|"booked"|"too_late"|"no_show","shift_status": "open"|"booked"|"cancelled"|"expired","sms_consent_event": "opt_in"|"opt_out"|"opt_in_again","sms_consent_source": "onboarding"|"sms_stop"|"sms_start"|"profile","sms_direction": "inbound"|"outbound","subscription_status": "trialing"|"active"|"past_due"|"canceled"|"unpaid"|"incomplete"|"incomplete_expired"|"paused","transmission_type": "automatic_only"|"manual_ok","user_role": "driver"|"carrier"|"admin"
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
            "account_status": ["pending", "approved", "blocked"],"availability_type": ["full_time", "part_time", "on_call", "weekends"],"cdl_class": ["A", "B", "none"],"document_type": ["cdl_front", "cdl_back", "medical_card", "certification", "other"],"driving_style": ["local_day_cab", "regional"],"employment_type": ["w2", "contractor_1099", "either"],"endorsement": ["H", "N", "T", "X"],"equipment_type": ["container_drayage", "dry_van", "flatbed", "reefer"],"heard_from": ["flyer", "facebook_instagram", "google_search", "friend_coworker", "other"],"mvr_status": ["clean", "minor_1_2", "major_3_plus"],"notice_category": ["policy_change", "service_notice", "service_restored", "account_security"],"notice_status": ["queued", "sending", "sent"],"operator_type": ["cdl_driver", "yard_spotter", "mechanic"],"recipient_status": ["queued", "sent", "delivered", "failed", "booked", "too_late", "no_show"],"shift_status": ["open", "booked", "cancelled", "expired"],"sms_consent_event": ["opt_in", "opt_out", "opt_in_again"],"sms_consent_source": ["onboarding", "sms_stop", "sms_start", "profile"],"sms_direction": ["inbound", "outbound"],"subscription_status": ["trialing", "active", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused"],"transmission_type": ["automatic_only", "manual_ok"],"user_role": ["driver", "carrier", "admin"]
          }
        }
} as const

