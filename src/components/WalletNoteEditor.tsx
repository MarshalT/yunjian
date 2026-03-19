import { useState, useRef, useEffect, useCallback } from 'react'
import MDEditor from '@uiw/react-md-editor'
import { Save, Download } from 'lucide-react'
import { toast } from 'sonner'
import { WalletNote, Theme } from '../types'
import { upsertWalletNote } from '../lib/walletStore'
import { exportNote } from '../lib/export'

interface WalletNoteEditorProps {
  note:    WalletNote
  address: string
  theme:   Theme
  onSaved: (notes: WalletNote[]) => void
}

/** 钱包模式编辑器：自动保存到 localStorage，不上传云端 */
export function WalletNoteEditor({ note, address, theme, onSaved }: WalletNoteEditorProps) {
  const [title,   setTitle]   = useState(note.title)
  const [content, setContent] = useState(note.content)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setTitle(note.title)
    setContent(note.content)
  }, [note.id])

  const saveLocal = useCallback(
    (t: string, c: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        const updated = upsertWalletNote(address, { id: note.id, title: t, content: c })
        onSaved(updated)
      }, 1000) // 1s 防抖，仅写本地，速度快
    },
    [address, note.id, onSaved],
  )

  const handleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const updated = upsertWalletNote(address, { id: note.id, title, content })
    onSaved(updated)
    toast.success('已保存到本地')
  }, [address, note.id, title, content, onSaved])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSave])

  const formatDate = (s: string) => {
    const d = new Date(s)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <input
          type="text"
          value={title}
          onChange={e => { setTitle(e.target.value); saveLocal(e.target.value, content) }}
          placeholder="笔记标题..."
          className="flex-1 text-xl font-semibold bg-transparent outline-none text-gray-800 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600"
        />
        {/* 未上链提示 */}
        {note.pending && (
          <span className="text-xs text-amber-500 flex items-center gap-1 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
            本地未上链
          </span>
        )}
        {!note.pending && (
          <span className="text-xs text-gray-400 whitespace-nowrap">
            已上链 {formatDate(note.updated_at)}
          </span>
        )}
        <button onClick={handleSave} title="保存 (Ctrl+S)"
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors">
          <Save size={16} />
        </button>
        <button onClick={() => exportNote(title, content)} title="导出 .md"
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors">
          <Download size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-hidden" data-color-mode={theme}>
        <MDEditor
          value={content}
          onChange={val => { setContent(val ?? ''); saveLocal(title, val ?? '') }}
          height="100%"
          preview="edit"
          visibleDragbar={false}
        />
      </div>
    </div>
  )
}
