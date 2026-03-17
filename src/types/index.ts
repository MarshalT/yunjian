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
