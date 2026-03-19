import { useState } from 'react'
import { Plus, Search, Trash2, LogOut, ArrowUpDown } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { ask } from '@tauri-apps/plugin-dialog'
import { toast } from 'sonner'
import { Note, SortField, Theme } from '../types'
import { useCreateNote, useDeleteNote } from '../lib/hooks'
import { PinToggle } from './PinToggle'
import { ThemeToggle } from './ThemeToggle'

interface SidebarProps {
  notes: Note[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNewNote: (id: string) => void
  theme: Theme
  onToggleTheme: () => void
  sortField: SortField
  onSortChange: (field: SortField) => void
  isLoading: boolean
  onLogout: () => void
}

/** 侧边栏：笔记列表、搜索、排序、新建、登出 */
export function Sidebar({
  notes,
  selectedId,
  onSelect,
  onNewNote,
  theme,
  onToggleTheme,
  sortField,
  onSortChange,
  isLoading,
  onLogout,
}: SidebarProps) {
  const [search, setSearch] = useState('')
  const createNote = useCreateNote()
  const deleteNote = useDeleteNote()

  /** 新建空白笔记并选中 */
  const handleNewNote = async () => {
    const note = await createNote.mutateAsync({ title: '新建笔记', content: '' })
    onNewNote(note.id)
  }

  /** 删除笔记（带二次确认） */
  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    // confirm 对话框会抢走焦点，先抑制失焦隐藏
    await invoke('set_suppress_blur', { suppress: true })
    const confirmed = await ask('确定删除这篇笔记吗？此操作不可恢复。', {
      title: '删除笔记',
      kind: 'warning',
    })
    setTimeout(() => invoke('set_suppress_blur', { suppress: false }), 300)
    if (!confirmed) return
    await deleteNote.mutateAsync(id)
    if (selectedId === id) onNewNote('')
  }

  /** 退出登录 */
  const handleLogout = () => {
    onLogout()
    toast.success('已退出登录')
  }

  // 根据搜索关键词过滤（标题 + 内容）
  const filtered = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.content.toLowerCase().includes(search.toLowerCase()),
  )

  // 格式化笔记预览时间
  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
    if (diffDays === 0) return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    if (diffDays < 7) return `${diffDays}天前`
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  // 从 Markdown 内容提取纯文本预览（去掉常见符号）
  const preview = (content: string) =>
    content.replace(/[#*`>\-\[\]()!_~]/g, '').replace(/\n+/g, ' ').trim().slice(0, 50)

  return (
    <div className="flex flex-col h-full w-64 shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 select-none">
      {/* ===== 顶部标题栏 ===== */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-base font-bold text-gray-800 dark:text-gray-100 tracking-wide">
          ✍️ 云笺
        </h1>
        <div className="flex items-center gap-0.5">
          <PinToggle />
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button
            onClick={handleNewNote}
            disabled={createNote.isPending}
            title="新建笔记 (Ctrl+N)"
            className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors disabled:opacity-50"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* ===== 搜索框 ===== */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 bg-white dark:bg-gray-700 rounded-lg px-3 py-1.5 border border-gray-200 dark:border-gray-600">
          <Search size={13} className="text-gray-400 shrink-0" />
          <input
            type="text"
            placeholder="搜索笔记..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400"
          />
        </div>
      </div>

      {/* ===== 排序选择 ===== */}
      <div className="px-3 pb-1 flex items-center gap-1.5">
        <ArrowUpDown size={12} className="text-gray-400" />
        <select
          value={sortField}
          onChange={(e) => onSortChange(e.target.value as SortField)}
          className="flex-1 text-xs bg-transparent text-gray-400 dark:text-gray-500 outline-none cursor-pointer"
        >
          <option value="updated_at">最近更新</option>
          <option value="created_at">创建时间</option>
          <option value="title">标题排序</option>
        </select>
      </div>

      {/* ===== 笔记列表 ===== */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="text-center text-gray-400 text-sm py-8">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8 px-4">
            {search ? '没有匹配的笔记' : '还没有笔记，点击 + 创建第一篇'}
          </div>
        ) : (
          filtered.map((note) => (
            <div
              key={note.id}
              onClick={() => onSelect(note.id)}
              className={`group flex items-start justify-between px-4 py-3 cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-700/50 ${
                selectedId === note.id
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-r-2 border-blue-500'
                  : ''
              }`}
            >
              <div className="flex-1 min-w-0 pr-1">
                {/* 标题 */}
                <div className="flex items-center gap-1.5">
                  {note.pending && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
                      title="本地草稿，尚未保存到仓库"
                    />
                  )}
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                    {note.title || '无标题'}
                  </div>
                  {note.pending && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 shrink-0">
                      草稿
                    </span>
                  )}
                </div>
                {/* 时间 + 内容预览 */}
                <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
                  <span>{formatTime(note.updated_at)}</span>
                  <span className="truncate">{preview(note.content) || '空笔记'}</span>
                </div>
              </div>
              {/* 删除按钮（hover 时显示） */}
              <button
                onClick={(e) => handleDelete(e, note.id)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-400 shrink-0 transition-opacity"
                title="删除笔记"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* ===== 底部登出按钮 ===== */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 w-full px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <LogOut size={13} />
          退出登录
        </button>
      </div>
    </div>
  )
}
