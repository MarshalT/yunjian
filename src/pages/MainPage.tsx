import { useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useNotes, useCreateNote } from '../lib/hooks'
import { Sidebar } from '../components/Sidebar'
import { NoteEditor } from '../components/NoteEditor'
import { SortField, Theme } from '../types'

interface MainPageProps {
  theme: Theme
  toggleTheme: () => void
}

/** 主页面：侧边栏 + 编辑器 */
export function MainPage({ theme, toggleTheme }: MainPageProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('updated_at')
  const queryClient = useQueryClient()
  const createNote = useCreateNote()

  const { data: notes = [], isLoading } = useNotes(sortField, 'desc')

  // 笔记列表加载后，若还未选中则自动选中第一篇
  useEffect(() => {
    if (notes.length > 0 && !selectedId) {
      setSelectedId(notes[0].id)
    }
  }, [notes, selectedId])

  // Ctrl+N 快捷键新建笔记
  const handleNewNote = useCallback(async () => {
    const note = await createNote.mutateAsync({ title: '新建笔记', content: '' })
    setSelectedId(note.id)
  }, [createNote])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        handleNewNote()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleNewNote])

  // Supabase Realtime 实时订阅：其他设备修改时本设备自动刷新
  useEffect(() => {
    const channel = supabase
      .channel('notes-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes' },
        () => {
          // 收到变更信号，让 TanStack Query 重新拉取最新数据
          queryClient.invalidateQueries({ queryKey: ['notes'] })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  const selectedNote = notes.find((n) => n.id === selectedId)

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* 侧边栏 */}
      <Sidebar
        notes={notes}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onNewNote={(id) => (id ? setSelectedId(id) : setSelectedId(notes[0]?.id ?? null))}
        theme={theme}
        onToggleTheme={toggleTheme}
        sortField={sortField}
        onSortChange={setSortField}
        isLoading={isLoading}
      />

      {/* 编辑区 */}
      <main className="flex-1 overflow-hidden">
        {selectedNote ? (
          <NoteEditor key={selectedNote.id} note={selectedNote} theme={theme} />
        ) : (
          // 空状态提示
          <div className="flex h-full items-center justify-center text-gray-300 dark:text-gray-600">
            <div className="text-center space-y-3">
              <FileText size={48} className="mx-auto opacity-30" />
              <p className="text-base font-medium">选择一篇笔记，或新建一篇</p>
              <p className="text-sm opacity-70">
                按 <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono">Ctrl+N</kbd> 快速新建
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
