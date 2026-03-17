/* ===== 类型定义 ===== */

/** 笔记实体 */
export interface Note {
  id: string
  user_id: string
  title: string
  content: string
  created_at: string
  updated_at: string
}

/** 排序字段 */
export type SortField = 'created_at' | 'updated_at' | 'title'

/** 排序方向 */
export type SortOrder = 'asc' | 'desc'

/** 主题 */
export type Theme = 'light' | 'dark'

/** 钱包模式笔记（本地存储，手动上链） */
export interface WalletNote {
  id:         string
  address:    string   // 钱包地址（所有者）
  title:      string
  content:    string
  created_at: string
  updated_at: string
  pending:    boolean  // true = 本地有修改，尚未上链
}

/** 登录模式 */
export type AuthMode = 'supabase' | 'wallet'
