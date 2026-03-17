import { useState, useEffect, useCallback } from 'react'
import { Wallet2 } from 'lucide-react'
import { loadWalletNotes, upsertWalletNote } from '../lib/walletStore'
import { WalletSidebar } from '../components/WalletSidebar'
import { WalletNoteEditor } from '../components/WalletNoteEditor'
import { WalletNote, SortField, Theme } from '../types'

interface WalletMainPageProps {
  address:    string
  privateKey: string
  theme:      Theme
  toggleTheme: () => void
}

/** 钱包模式主页面：离线优先，手动触发上链 */
export function WalletMainPage({ address, privateKey, theme, toggleTheme }: WalletMainPageProps) {
  const [notes,      setNotes]      = useState<WalletNote[]>(() => loadWalletNotes(address))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sortField,  setSortField]  = useState<SortField>('updated_at')

  // 启动时自动选中第一篇
  useEffect(() => {
    if (notes.length > 0 && !selectedId) setSelectedId(notes[0].id)
  }, [notes, selectedId])

  // Ctrl+N 新建
  const handleNew = useCallback(() => {
    const id      = crypto.randomUUID()
    const updated = upsertWalletNote(address, { id, title: '新建笔记', content: '' })
    setNotes(updated)
    setSelectedId(id)
  }, [address])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); handleNew() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleNew])

  const selectedNote = notes.find(n => n.id === selectedId)

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-gray-900">
      <WalletSidebar
        notes={notes}
        address={address}
        privateKey={privateKey}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onNewNote={id => { setSelectedId(id || notes[0]?.id || null) }}
        onNotesChange={setNotes}
        theme={theme}
        onToggleTheme={toggleTheme}
        sortField={sortField}
        onSortChange={setSortField}
      />
      <main className="flex-1 overflow-hidden">
        {selectedNote ? (
          <WalletNoteEditor
            key={selectedNote.id}
            note={selectedNote}
            address={address}
            theme={theme}
            onSaved={setNotes}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-300 dark:text-gray-600">
            <div className="text-center space-y-3">
              <Wallet2 size={48} className="mx-auto opacity-30" />
              <p className="text-base font-medium">钱包模式 · 数据本地优先</p>
              <p className="text-sm opacity-70">
                笔记保存在本地，点击「上链」手动同步到 XLayer
              </p>
              <p className="text-sm opacity-70">
                按 <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono">Ctrl+N</kbd> 新建
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
