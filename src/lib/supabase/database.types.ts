
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "access_invite_redemptions": {
                  Row: {
                    "invite_id": string,"redeemed_at": string,"user_id": string
                  }
                  Insert: {
                    "invite_id": string,"redeemed_at"?: string,"user_id": string
                  }
                  Update: {
                    "invite_id"?: string,"redeemed_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "access_invite_redemptions_invite_id_fkey"
      columns: ["invite_id"]
isOneToOne: false
      referencedRelation: "access_invites"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "access_invite_redemptions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"access_invites": {
                  Row: {
                    "code": string,"created_at": string,"created_by": string | null,"expires_at": string | null,"id": string,"max_uses": number | null,"note": string | null,"revoked_at": string | null,"uses_count": number
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"max_uses"?: number | null,"note"?: string | null,"revoked_at"?: string | null,"uses_count"?: number
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"max_uses"?: number | null,"note"?: string | null,"revoked_at"?: string | null,"uses_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "access_invites_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"app_notifications": {
                  Row: {
                    "actor_id": string | null,"body": string,"created_at": string,"delivered_at": string | null,"entity_id": string | null,"id": string,"read_at": string | null,"title": string,"type": string,"user_id": string
                  }
                  Insert: {
                    "actor_id"?: string | null,"body": string,"created_at"?: string,"delivered_at"?: string | null,"entity_id"?: string | null,"id"?: string,"read_at"?: string | null,"title": string,"type": string,"user_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"body"?: string,"created_at"?: string,"delivered_at"?: string | null,"entity_id"?: string | null,"id"?: string,"read_at"?: string | null,"title"?: string,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "app_notifications_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "app_notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"direct_messages": {
                  Row: {
                    "body": string,"created_at": string,"id": string,"read_at": string | null,"recipient_id": string,"sender_id": string
                  }
                  Insert: {
                    "body": string,"created_at"?: string,"id"?: string,"read_at"?: string | null,"recipient_id": string,"sender_id": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"id"?: string,"read_at"?: string | null,"recipient_id"?: string,"sender_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "direct_messages_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "direct_messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"friend_requests": {
                  Row: {
                    "created_at": string,"id": string,"recipient_id": string,"responded_at": string | null,"sender_id": string,"status": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"recipient_id": string,"responded_at"?: string | null,"sender_id": string,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"recipient_id"?: string,"responded_at"?: string | null,"sender_id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "friend_requests_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "friend_requests_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"friendships": {
                  Row: {
                    "created_at": string,"friend_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"friend_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"friend_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "friendships_friend_id_fkey"
      columns: ["friend_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "friendships_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"group_chat_message_reports": {
                  Row: {
                    "created_at": string,"id": string,"message_id": string,"reporter_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"message_id": string,"reporter_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"message_id"?: string,"reporter_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_chat_message_reports_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "group_chat_messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_chat_message_reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"group_chat_messages": {
                  Row: {
                    "body": string | null,"created_at": string,"deleted_at": string | null,"group_id": string,"id": string,"image_path": string | null,"reply_to_id": string | null,"user_id": string
                  }
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"group_id": string,"id"?: string,"image_path"?: string | null,"reply_to_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"group_id"?: string,"id"?: string,"image_path"?: string | null,"reply_to_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_chat_messages_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_chat_messages_reply_to_id_fkey"
      columns: ["reply_to_id"]
isOneToOne: false
      referencedRelation: "group_chat_messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_chat_messages_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"group_chat_read_receipts": {
                  Row: {
                    "group_id": string,"last_read_at": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "group_id": string,"last_read_at": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "group_id"?: string,"last_read_at"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_chat_read_receipts_group_id_user_id_fkey"
      columns: ["group_id","user_id"]
isOneToOne: true
      referencedRelation: "group_members"
      referencedColumns: ["group_id","user_id"]
    }
                  ]
                },"group_invites": {
                  Row: {
                    "created_at": string,"group_id": string,"id": string,"recipient_id": string,"responded_at": string | null,"sender_id": string,"status": string
                  }
                  Insert: {
                    "created_at"?: string,"group_id": string,"id"?: string,"recipient_id": string,"responded_at"?: string | null,"sender_id": string,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"group_id"?: string,"id"?: string,"recipient_id"?: string,"responded_at"?: string | null,"sender_id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_invites_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_invites_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_invites_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"group_members": {
                  Row: {
                    "group_id": string,"joined_at": string,"last_seen_at": string | null,"role": string,"status": string,"user_id": string
                  }
                  Insert: {
                    "group_id": string,"joined_at"?: string,"last_seen_at"?: string | null,"role"?: string,"status"?: string,"user_id": string
                  }
                  Update: {
                    "group_id"?: string,"joined_at"?: string,"last_seen_at"?: string | null,"role"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_members_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"groups": {
                  Row: {
                    "created_at": string,"description": string | null,"icon": string,"id": string,"invite_code": string,"name": string,"nudge_cooldown_seconds": number,"nudges_enabled": boolean,"owner_id": string,"updated_at": string,"visibility": string
                  }
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"icon"?: string,"id"?: string,"invite_code": string,"name": string,"nudge_cooldown_seconds"?: number,"nudges_enabled"?: boolean,"owner_id": string,"updated_at"?: string,"visibility"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"icon"?: string,"id"?: string,"invite_code"?: string,"name"?: string,"nudge_cooldown_seconds"?: number,"nudges_enabled"?: boolean,"owner_id"?: string,"updated_at"?: string,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "groups_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"nudges": {
                  Row: {
                    "created_at": string,"delivered_at": string | null,"group_id": string | null,"id": string,"message": string | null,"read_at": string | null,"recipient_id": string,"sender_id": string
                  }
                  Insert: {
                    "created_at"?: string,"delivered_at"?: string | null,"group_id"?: string | null,"id"?: string,"message"?: string | null,"read_at"?: string | null,"recipient_id": string,"sender_id": string
                  }
                  Update: {
                    "created_at"?: string,"delivered_at"?: string | null,"group_id"?: string | null,"id"?: string,"message"?: string | null,"read_at"?: string | null,"recipient_id"?: string,"sender_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "nudges_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "nudges_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "nudges_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "access_granted_at": string | null,"access_granted_by": string | null,"access_granted_source": string | null,"access_status": string,"avatar_url": string | null,"course": string | null,"created_at": string,"display_name": string | null,"id": string,"is_discoverable": boolean,"mac_email": string | null,"mac_last_seen_at": string | null,"mac_roles": (string)[],"mac_team": string | null,"mac_token_version": number | null,"mac_user_id": string | null,"profile_color": string,"study_icon": string,"updated_at": string,"username": string | null
                  }
                  Insert: {
                    "access_granted_at"?: string | null,"access_granted_by"?: string | null,"access_granted_source"?: string | null,"access_status"?: string,"avatar_url"?: string | null,"course"?: string | null,"created_at"?: string,"display_name"?: string | null,"id"?: string,"is_discoverable"?: boolean,"mac_email"?: string | null,"mac_last_seen_at"?: string | null,"mac_roles"?: (string)[],"mac_team"?: string | null,"mac_token_version"?: number | null,"mac_user_id"?: string | null,"profile_color"?: string,"study_icon"?: string,"updated_at"?: string,"username"?: string | null
                  }
                  Update: {
                    "access_granted_at"?: string | null,"access_granted_by"?: string | null,"access_granted_source"?: string | null,"access_status"?: string,"avatar_url"?: string | null,"course"?: string | null,"created_at"?: string,"display_name"?: string | null,"id"?: string,"is_discoverable"?: boolean,"mac_email"?: string | null,"mac_last_seen_at"?: string | null,"mac_roles"?: (string)[],"mac_team"?: string | null,"mac_token_version"?: number | null,"mac_user_id"?: string | null,"profile_color"?: string,"study_icon"?: string,"updated_at"?: string,"username"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_access_granted_by_fkey"
      columns: ["access_granted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"id": string,"last_seen_at": string | null,"p256dh": string,"revoked_at": string | null,"user_agent": string | null,"user_id": string
                  }
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"id"?: string,"last_seen_at"?: string | null,"p256dh": string,"revoked_at"?: string | null,"user_agent"?: string | null,"user_id": string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"id"?: string,"last_seen_at"?: string | null,"p256dh"?: string,"revoked_at"?: string | null,"user_agent"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_subscriptions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"special_unit_aliases": {
                  Row: {
                    "alias_code": string,"created_at": string,"special_unit_code": string
                  }
                  Insert: {
                    "alias_code": string,"created_at"?: string,"special_unit_code": string
                  }
                  Update: {
                    "alias_code"?: string,"created_at"?: string,"special_unit_code"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "special_unit_aliases_special_unit_code_fkey"
      columns: ["special_unit_code"]
isOneToOne: false
      referencedRelation: "special_units"
      referencedColumns: ["code"]
    }
                  ]
                },"special_unit_requests": {
                  Row: {
                    "comment": string | null,"created_at": string,"id": string,"requester_id": string,"reviewed_at": string | null,"status": string,"unit_code": string | null,"unit_name": string
                  }
                  Insert: {
                    "comment"?: string | null,"created_at"?: string,"id"?: string,"requester_id": string,"reviewed_at"?: string | null,"status"?: string,"unit_code"?: string | null,"unit_name": string
                  }
                  Update: {
                    "comment"?: string | null,"created_at"?: string,"id"?: string,"requester_id"?: string,"reviewed_at"?: string | null,"status"?: string,"unit_code"?: string | null,"unit_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "special_unit_requests_requester_id_fkey"
      columns: ["requester_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"special_units": {
                  Row: {
                    "code": string,"created_at": string,"description": string | null,"is_active": boolean,"name": string,"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"description"?: string | null,"is_active"?: boolean,"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"description"?: string | null,"is_active"?: boolean,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"study_sessions": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"duration_seconds": number | null,"ended_at": string | null,"group_id": string | null,"id": string,"note": string | null,"reminder_interval_minutes": number | null,"reminder_last_sent_at": string | null,"source": string,"started_at": string,"status": string,"subject_id": string | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"duration_seconds"?: never,"ended_at"?: string | null,"group_id"?: string | null,"id"?: string,"note"?: string | null,"reminder_interval_minutes"?: number | null,"reminder_last_sent_at"?: string | null,"source"?: string,"started_at": string,"status"?: string,"subject_id"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"duration_seconds"?: never,"ended_at"?: string | null,"group_id"?: string | null,"id"?: string,"note"?: string | null,"reminder_interval_minutes"?: number | null,"reminder_last_sent_at"?: string | null,"source"?: string,"started_at"?: string,"status"?: string,"subject_id"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "study_sessions_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "study_sessions_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "study_sessions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"subjects": {
                  Row: {
                    "archived_at": string | null,"code": string,"color": string | null,"created_at": string,"id": string,"name": string | null,"unit_offering_id": string | null,"user_id": string
                  }
                  Insert: {
                    "archived_at"?: string | null,"code": string,"color"?: string | null,"created_at"?: string,"id"?: string,"name"?: string | null,"unit_offering_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "archived_at"?: string | null,"code"?: string,"color"?: string | null,"created_at"?: string,"id"?: string,"name"?: string | null,"unit_offering_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subjects_unit_offering_id_fkey"
      columns: ["unit_offering_id"]
isOneToOne: false
      referencedRelation: "unit_offerings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subjects_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"super_nudge_requests": {
                  Row: {
                    "created_at": string,"id": string,"recipient_id": string,"sender_id": string,"status": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"recipient_id": string,"sender_id": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"recipient_id"?: string,"sender_id"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "super_nudge_requests_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "super_nudge_requests_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"unit_enrolments": {
                  Row: {
                    "joined_at": string,"left_at": string | null,"nickname": string | null,"offering_id": string,"user_id": string
                  }
                  Insert: {
                    "joined_at"?: string,"left_at"?: string | null,"nickname"?: string | null,"offering_id": string,"user_id": string
                  }
                  Update: {
                    "joined_at"?: string,"left_at"?: string | null,"nickname"?: string | null,"offering_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "unit_enrolments_offering_id_fkey"
      columns: ["offering_id"]
isOneToOne: false
      referencedRelation: "unit_offerings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "unit_enrolments_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"unit_offerings": {
                  Row: {
                    "created_at": string,"id": string,"study_year": number,"teaching_period": string,"unit_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"study_year": number,"teaching_period": string,"unit_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"study_year"?: number,"teaching_period"?: string,"unit_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "unit_offerings_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"units": {
                  Row: {
                    "code": string,"created_at": string,"id": string
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"id"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_goals": {
                  Row: {
                    "created_at": string,"id": string,"period": string,"subject_id": string | null,"target_seconds": number,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"period": string,"subject_id"?: string | null,"target_seconds": number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"period"?: string,"subject_id"?: string | null,"target_seconds"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_goals_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_goals_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_group_notification_settings": {
                  Row: {
                    "chat_muted": boolean,"created_at": string,"group_id": string,"nudges_muted": boolean,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "chat_muted"?: boolean,"created_at"?: string,"group_id": string,"nudges_muted"?: boolean,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "chat_muted"?: boolean,"created_at"?: string,"group_id"?: string,"nudges_muted"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_group_notification_settings_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_group_notification_settings_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_notification_preferences": {
                  Row: {
                    "created_at": string,"friend_notifications": boolean,"nudge_notifications": boolean,"other_notifications": boolean,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"friend_notifications"?: boolean,"nudge_notifications"?: boolean,"other_notifications"?: boolean,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"friend_notifications"?: boolean,"nudge_notifications"?: boolean,"other_notifications"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_notification_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_favourite_friends": {
                  Row: {
                    "created_at": string,"friend_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"friend_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"friend_id"?: string,"user_id"?: string
                  }
                  Relationships: []
                },"user_pinned_groups": {
                  Row: {
                    "created_at": string,"group_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"group_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"group_id"?: string,"user_id"?: string
                  }
                  Relationships: []
                },"user_message_mutes": {
                  Row: {
                    "created_at": string,"muted_user_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"muted_user_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"muted_user_id"?: string,"user_id"?: string
                  }
                  Relationships: []
                },"user_nudge_mutes": {
                  Row: {
                    "created_at": string,"group_id": string | null,"id": string,"muted_user_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"group_id"?: string | null,"id"?: string,"muted_user_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"group_id"?: string | null,"id"?: string,"muted_user_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_nudge_mutes_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_nudge_mutes_muted_user_id_fkey"
      columns: ["muted_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_nudge_mutes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_onboarding_states": {
                  Row: {
                    "created_at": string,"is_existing_at_rollout": boolean,"updated_at": string,"user_id": string,"welcome_completed_at": string | null,"welcome_dismissed_at": string | null,"welcome_version": number
                  }
                  Insert: {
                    "created_at"?: string,"is_existing_at_rollout"?: boolean,"updated_at"?: string,"user_id": string,"welcome_completed_at"?: string | null,"welcome_dismissed_at"?: string | null,"welcome_version"?: number
                  }
                  Update: {
                    "created_at"?: string,"is_existing_at_rollout"?: boolean,"updated_at"?: string,"user_id"?: string,"welcome_completed_at"?: string | null,"welcome_dismissed_at"?: string | null,"welcome_version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_onboarding_states_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
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
            "add_friend":
{ Args: { "target_user_id": string }; Returns: boolean
                           },
"can_manage_group_members":
{ Args: { "target_group_id": string }; Returns: boolean
                           },
"cancel_friend_request":
{ Args: { "target_request_id": string }; Returns: boolean
                           },
"cancel_group_invite":
{ Args: { "target_invite_id": string }; Returns: boolean
                           },
"claim_due_study_reminders":
{ Args: { "batch_size"?: number }; Returns: {
              "reminder_interval_minutes": number,"session_id": string,"started_at": string,"user_id": string
            }[]
                           },
"create_study_group":
{ Args: { "group_icon"?: string,"group_name": string,"group_visibility"?: string }; Returns: string
                           },
"delete_group_chat_message":
{ Args: { "target_message_id": string }; Returns: boolean
                           },
"get_my_unit_cohort_counts":
{ Args: Record<PropertyKey, never>; Returns: {
              "member_count": number,"offering_id": string
            }[]
                           },
"get_notification_preferences":
{ Args: Record<PropertyKey, never>; Returns: {
              "friend_notifications": boolean,"nudge_notifications": boolean,"other_notifications": boolean
            }[]
                           },
"get_unit_cohort":
{ Args: { "input_offering_id": string }; Returns: {
              "display_name": string,"is_friend": boolean,"profile_color": string,"shared_group_ids": (string)[],"study_icon": string,"user_id": string,"username": string
            }[]
                           },
"get_unit_cohort_v2":
{ Args: { "input_offering_id": string }; Returns: {
              "display_name": string,"is_friend": boolean,"mutual_friend_count": number,"profile_color": string,"shared_group_ids": (string)[],"study_icon": string,"user_id": string,"username": string
            }[]
                           },
"get_user_daily_study_seconds":
{ Args: { "target_user_id": string }; Returns: Json
                           },
"get_unit_cohort_page":
{ Args: { "friends_only"?: boolean,"input_offering_id": string,"result_limit"?: number,"result_offset"?: number,"search_query"?: string }; Returns: {
              "display_name": string,"is_friend": boolean,"mutual_friend_count": number,"profile_color": string,"shared_group_ids": (string)[],"study_icon": string,"user_id": string,"username": string
            }[]
                           },
"list_friend_suggestions":
{ Args: { "result_limit"?: number }; Returns: {
              "avatar_url": string | null,"display_name": string | null,"mutual_friend_count": number,"profile_color": string | null,"request_direction": string | null,"study_icon": string | null,"user_id": string,"username": string | null
            }[]
                           },
"get_unit_weekly_leaderboard":
{ Args: { "input_offering_id": string }; Returns: {
              "display_name": string | null,"study_icon": string | null,"user_id": string,"username": string | null,"week_seconds": number
            }[]
                           },
"invite_friend_to_group":
{ Args: { "target_group_id": string,"target_user_id": string }; Returns: boolean
                           },
"is_active_mac_member":
{ Args: { "target_user_id": string }; Returns: boolean
                           },
"is_friend":
{ Args: { "target_user_id": string }; Returns: boolean
                           },
"is_group_member":
{ Args: { "target_group_id": string }; Returns: boolean
                           },
"join_group_by_code":
{ Args: { "group_invite_code": string }; Returns: string
                           },
"join_group_by_link":
{ Args: { "group_invite_code": string,"target_group_id": string }; Returns: string
                           },
"join_public_study_group":
{ Args: { "target_group_id": string }; Returns: boolean
                           },
"leave_study_group":
{ Args: { "target_group_id": string }; Returns: string
                           },
"leave_unit_enrolment":
{ Args: { "input_offering_id": string }; Returns: boolean
                           },
"list_active_super_nudges":
{ Args: { "result_limit"?: number,"result_offset"?: number }; Returns: {
              "created_at": string,"recipient_id": string,"request_id": string,"sender_id": string,"status": string
            }[]
                           },
"list_direct_conversations":
{ Args: { "result_limit"?: number }; Returns: {
              "display_name": string,"friend_id": string,"latest_body": string,"latest_created_at": string,"latest_message_id": string,"latest_sender_id": string,"profile_color": string,"unread_count": number,"username": string
            }[]
                           },
"list_direct_messages":
{ Args: { "before_created_at"?: string,"before_message_id"?: string,"result_limit"?: number,"target_friend_id": string }; Returns: {
              "body": string,"created_at": string,"message_id": string,"read_at": string,"recipient_id": string,"sender_id": string
            }[]
                           },
"list_friend_candidates":
{ Args: Record<PropertyKey, never>; Returns: {
              "avatar_url": string,"display_name": string,"mutual_friend_count": number,"profile_color": string,"request_direction": string,"study_icon": string,"user_id": string,"username": string
            }[]
                           },
"list_friend_candidates_page":
{ Args: { "result_limit"?: number,"result_offset"?: number,"search_query"?: string }; Returns: {
              "avatar_url": string,"display_name": string,"mutual_friend_count": number,"profile_color": string,"request_direction": string,"study_icon": string,"user_id": string,"username": string
            }[]
                           },
"list_friend_requests":
{ Args: Record<PropertyKey, never>; Returns: {
              "avatar_url": string,"created_at": string,"direction": string,"display_name": string,"profile_color": string,"request_id": string,"study_icon": string,"user_id": string,"username": string
            }[]
                           },
"list_friend_requests_page":
{ Args: { "result_limit"?: number,"result_offset"?: number }; Returns: {
              "avatar_url": string,"created_at": string,"direction": string,"display_name": string,"profile_color": string,"request_id": string,"study_icon": string,"user_id": string,"username": string
            }[]
                           },
"list_group_chat_unread_counts":
{ Args: Record<PropertyKey, never>; Returns: {
              "group_id": string,"unread_count": number
            }[]
                           },
"list_group_invites":
{ Args: Record<PropertyKey, never>; Returns: {
              "avatar_url": string,"created_at": string,"direction": string,"display_name": string,"group_id": string,"group_name": string,"invite_id": string,"profile_color": string,"study_icon": string,"user_id": string,"username": string
            }[]
                           },
"list_group_invites_page":
{ Args: { "result_limit"?: number,"result_offset"?: number }; Returns: {
              "avatar_url": string,"created_at": string,"direction": string,"display_name": string,"group_id": string,"group_name": string,"invite_id": string,"profile_color": string,"study_icon": string,"user_id": string,"username": string
            }[]
                           },
"list_my_study_groups":
{ Args: Record<PropertyKey, never>; Returns: {
              "current_user_role": string,"group_icon": string,"group_id": string,"group_name": string,"invite_code": string,"member_ids": (string)[],"member_roles": Json,"visibility": string
            }[]
                           },
"list_public_study_groups":
{ Args: Record<PropertyKey, never>; Returns: {
              "group_id": string,"group_name": string,"member_count": number
            }[]
                           },
"list_social_friends":
{ Args: Record<PropertyKey, never>; Returns: {
              "active_started_at": string,"all_time_seconds": number,"avatar_url": string,"daily_study_seconds": Json,"day_seconds": number,"display_name": string,"is_friend": boolean,"month_seconds": number,"profile_color": string,"study_icon": string,"user_id": string,"username": string,"week_seconds": number
            }[]
                           },
"mark_group_chat_read":
{ Args: { "target_group_id": string }; Returns: string
                           },
"redeem_access_invite":
{ Args: { "invite_code": string }; Returns: boolean
                           },
"remove_friend":
{ Args: { "target_user_id": string }; Returns: boolean
                           },
"remove_group_member":
{ Args: { "target_group_id": string,"target_user_id": string }; Returns: boolean
                           },
"report_group_chat_message":
{ Args: { "target_message_id": string }; Returns: boolean
                           },
"request_super_nudge":
{ Args: { "target_user_id": string }; Returns: string
                           },
"respond_super_nudge":
{ Args: { "request_id": string,"response_action": string }; Returns: boolean
                           },
"respond_to_friend_request":
{ Args: { "response": string,"target_request_id": string }; Returns: boolean
                           },
"respond_to_group_invite":
{ Args: { "response": string,"target_invite_id": string }; Returns: boolean
                           },
"send_friend_request":
{ Args: { "target_user_id": string }; Returns: string
                           },
"send_nudge":
{ Args: { "target_group_id"?: string,"target_user_id": string }; Returns: string
                           },
"set_active_study_reminder":
{ Args: { "next_interval_minutes"?: number }; Returns: boolean
                           },
"set_group_member_role":
{ Args: { "new_role": string,"target_group_id": string,"target_user_id": string }; Returns: boolean
                           },
"set_profile_discoverability":
{ Args: { "next_is_discoverable": boolean }; Returns: boolean
                           },
"set_subject_unit_offering":
{ Args: { "input_offering_id"?: string,"input_subject_id": string }; Returns: boolean
                           },
"shares_active_group_with_user":
{ Args: { "target_user_id": string }; Returns: boolean
                           },
"transfer_group_leadership":
{ Args: { "target_group_id": string,"target_user_id": string }; Returns: boolean
                           },
"update_notification_preferences":
{ Args: { "next_friend_notifications": boolean,"next_nudge_notifications": boolean,"next_other_notifications": boolean }; Returns: boolean
                           },
"update_study_group":
{ Args: { "group_name": string,"group_visibility": string,"target_group_id": string }; Returns: boolean
                           },
"upsert_unit_enrolment":
{ Args: { "input_nickname"?: string,"input_study_year": number,"input_teaching_period": string,"input_unit_code": string }; Returns: string
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
  "public": {
          Enums: {
            
          }
        }
} as const

