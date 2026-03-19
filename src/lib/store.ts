import { Note } from '../types'

/** localStorage 缓存 key */
const NOTES_CACHE_KEY = 'Yunqian_notes_cache'
const THEME_KEY = 'Yunqian_theme'
const WINDOW_PINNED_KEY = 'Yunqian_window_pinned'

// ===== 笔记缓存（离线支持） =====

/** 将笔记列表缓存到 localStorage */
export function cacheNotes(notes: Note[]): void {
  try {
    localStorage.setItem(NOTES_CACHE_KEY, JSON.stringify(notes))
  } catch {
    // 存储空间不足时静默忽略
  }
}

/** 从 localStorage 读取缓存的笔记 */
export function loadCachedNotes(): Note[] {
  try {
    const raw = localStorage.getItem(NOTES_CACHE_KEY)
    return raw ? (JSON.parse(raw) as Note[]) : []
  } catch {
    return []
  }
}

/** 更新缓存中的单篇笔记（新增或覆盖） */
export function updateCachedNote(note: Note): void {
  const notes = loadCachedNotes()
  const idx = notes.findIndex((n) => n.id === note.id)
  if (idx !== -1) {
    notes[idx] = note
  } else {
    notes.unshift(note)
  }
  cacheNotes(notes)
}

/** 从缓存中移除单篇笔记 */
export function deleteCachedNote(id: string): void {
  const notes = loadCachedNotes()
  cacheNotes(notes.filter((n) => n.id !== id))
}

// ===== 主题持久化 =====

/** 保存主题偏好 */
export function saveTheme(theme: string): void {
  localStorage.setItem(THEME_KEY, theme)
}

/** 读取主题偏好，默认跟随系统 */
export function loadTheme(): string {
  return localStorage.getItem(THEME_KEY) ?? 'system'
}

/** 保存窗口钉住状态 */
export function saveWindowPinned(pinned: boolean): void {
  localStorage.setItem(WINDOW_PINNED_KEY, pinned ? '1' : '0')
}

/** 读取窗口钉住状态 */
export function loadWindowPinned(): boolean {
  return localStorage.getItem(WINDOW_PINNED_KEY) === '1'
}
