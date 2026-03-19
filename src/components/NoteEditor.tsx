import { useState, useRef, useEffect, useCallback } from 'react'
import MDEditor from '@uiw/react-md-editor'
import { Save, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Note, Theme } from '../types'
import { useUpdateNote } from '../lib/hooks'
import { exportNote } from '../lib/export'

interface NoteEditorProps {
  note: Note
  theme: Theme
}

/** Markdown 编辑器组件，支持实时预览、自动保存、快捷键 */
export function NoteEditor({ note, theme }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [saving, setSaving] = useState(false)
  // 自动保存定时器引用
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const updateNote = useUpdateNote()

  // 切换笔记时同步编辑器内容
  useEffect(() => {
    setTitle(note.title)
    setContent(note.content)
  }, [note.id])

  /** 触发自动保存（防抖 3 秒） */
  const scheduleAutoSave = useCallback(
    (newTitle: string, newContent: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(async () => {
        setSaving(true)
        try {
          await updateNote.mutateAsync({ id: note.id, title: newTitle, content: newContent })
        } finally {
          setSaving(false)
        }
      }, 3000)
    },
    [note.id, updateNote],
  )

  /** 立即保存（手动触发或快捷键） */
  const handleSave = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaving(true)
    try {
      await updateNote.mutateAsync({ id: note.id, title, content })
      toast.success('已保存')
    } finally {
      setSaving(false)
    }
  }, [note.id, title, content, updateNote])

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value)
    scheduleAutoSave(e.target.value, content)
  }

  const handleContentChange = (val: string | undefined) => {
    const newContent = val ?? ''
    setContent(newContent)
    scheduleAutoSave(title, newContent)
  }

  // 注册 Ctrl/Cmd+S 快捷键
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleSave])

  // 格式化最后更新时间
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* 顶部工具栏：标题 + 操作按钮 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          placeholder="笔记标题..."
          className="flex-1 text-xl font-semibold bg-transparent outline-none text-gray-800 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600"
        />
        {/* 保存状态提示 */}
        <span className="text-xs text-gray-400 whitespace-nowrap">
          {saving ? '保存中...' : `已同步 ${formatDate(note.updated_at)}`}
        </span>
        {/* 手动保存按钮 */}
        <button
          onClick={handleSave}
          title="保存 (Ctrl+S)"
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
        >
          <Save size={16} />
        </button>
        {/* 导出 .md 按钮 */}
        <button
          onClick={() => exportNote(title, content)}
          title="导出为 .md 文件"
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
        >
          <Download size={16} />
        </button>
      </div>

      {/* Markdown 编辑器（占满剩余高度） */}
      <div className="flex-1 overflow-hidden" data-color-mode={theme}>
        <MDEditor
          value={content}
          onChange={handleContentChange}
          height="100%"
          preview="edit"
          visibleDragbar={false}
        />
      </div>
    </div>
  )
}
