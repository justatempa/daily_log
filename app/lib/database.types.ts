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
      profiles: {
        Row: {
          id: string
          display_name: string | null
          timezone: string
          quick_templates: Json
          memos_host: string | null
          backup_folder: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          timezone?: string
          quick_templates?: Json
          memos_host?: string | null
          backup_folder?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          timezone?: string
          quick_templates?: Json
          memos_host?: string | null
          backup_folder?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      entries: {
        Row: {
          id: string
          user_id: string
          entry_date: string
          recorded_at: string
          content: string
          metadata: Json
          source: 'manual' | 'quick' | 'import' | 'api'
          pinned: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          entry_date: string
          recorded_at?: string
          content: string
          metadata?: Json
          source?: 'manual' | 'quick' | 'import' | 'api'
          pinned?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          entry_date?: string
          recorded_at?: string
          content?: string
          metadata?: Json
          source?: 'manual' | 'quick' | 'import' | 'api'
          pinned?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      tags: {
        Row: {
          id: string
          user_id: string
          label: string
          category: 'weather' | 'mood' | 'task' | 'activity' | 'vitamin' | 'custom'
          color: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          label: string
          category: 'weather' | 'mood' | 'task' | 'activity' | 'vitamin' | 'custom'
          color?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          label?: string
          category?: 'weather' | 'mood' | 'task' | 'activity' | 'vitamin' | 'custom'
          color?: string | null
          created_at?: string
        }
      }
      entry_tags: {
        Row: {
          entry_id: string
          tag_id: string
        }
        Insert: {
          entry_id: string
          tag_id: string
        }
        Update: {
          entry_id?: string
          tag_id?: string
        }
      }
      external_accounts: {
        Row: {
          id: string
          user_id: string
          provider: 'memos' | 'jianguoyun'
          access_token: string | null
          config: Json
          last_synced_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          provider: 'memos' | 'jianguoyun'
          access_token?: string | null
          config?: Json
          last_synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          provider?: 'memos' | 'jianguoyun'
          access_token?: string | null
          config?: Json
          last_synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      backups: {
        Row: {
          id: number
          user_id: string
          exported_at: string
          export_range: string | null
          file_name: string | null
          checksum: string | null
          meta: Json
        }
        Insert: {
          id?: number
          user_id: string
          exported_at?: string
          export_range?: string | null
          file_name?: string | null
          checksum?: string | null
          meta?: Json
        }
        Update: {
          id?: number
          user_id?: string
          exported_at?: string
          export_range?: string | null
          file_name?: string | null
          checksum?: string | null
          meta?: Json
        }
      }
      holidays: {
        Row: {
          id: number
          user_id: string | null
          locale: string
          holiday_date: string
          name: string
          name_cn: string | null
          name_en: string | null
          type:
            | 'public_holiday'
            | 'transfer_workday'
            | 'company_event'
            | 'observed'
            | 'makeup_workday'
          is_workday: boolean
          description: string | null
          meta: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          user_id?: string | null
          locale?: string
          holiday_date: string
          name: string
          name_cn?: string | null
          name_en?: string | null
          type?:
            | 'public_holiday'
            | 'transfer_workday'
            | 'company_event'
            | 'observed'
            | 'makeup_workday'
          is_workday?: boolean
          description?: string | null
          meta?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          user_id?: string | null
          locale?: string
          holiday_date?: string
          name?: string
          name_cn?: string | null
          name_en?: string | null
          type?:
            | 'public_holiday'
            | 'transfer_workday'
            | 'company_event'
            | 'observed'
            | 'makeup_workday'
          is_workday?: boolean
          description?: string | null
          meta?: Json
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      entry_source: 'manual' | 'quick' | 'import' | 'api'
    }
  }
}
