import { createClient } from '@supabase/supabase-js'

/** 从环境变量读取 Supabase 配置（.env 文件中设置） */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('缺少 Supabase 环境变量，请复制 .env.example 为 .env 并填写配置')
}

/** Supabase 客户端单例 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // 将 session 持久化到 localStorage
    persistSession: true,
    autoRefreshToken: true,
  },
})

/** 数据库类型定义（与 Supabase 表结构一一对应） */
export type Database = {
  public: {
    Tables: {
      notes: {
        Row: {
          id: string
          user_id: string
          title: string
          content: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          content: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          content?: string
          updated_at?: string
        }
      }
    }
  }
}
