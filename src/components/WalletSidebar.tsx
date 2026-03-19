import { useState, useEffect } from 'react'
import { Plus, Search, Trash2, LogOut, Upload, RefreshCw, ArrowUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { invoke } from '@tauri-apps/api/core'
import { ask } from '@tauri-apps/plugin-dialog'
import { WalletNote, SortField, Theme } from '../types'
import { removeWalletNote, upsertWalletNote, markUploaded, mergeChainNotes, getGasUsed } from '../lib/walletStore'
import { walletFromPrivateKey, getOKBBalance } from '../lib/wallet'
import { uploadNotes, fetchNotesFromChain, deleteNoteOnChain } from '../lib/contract'
import { clearEncryptionKey } from '../lib/crypto'
import { PinToggle } from './PinToggle'
import { ThemeToggle } from './ThemeToggle'

interface WalletSidebarProps {
  notes:          WalletNote[]
  address:        string
  privateKey:     string
  selectedId:     string | null
  onSelect:       (id: string) => void
  onNewNote:      (id: string) => void
  onNotesChange:  (notes: WalletNote[]) => void
  theme:          Theme
  onToggleTheme:  () => void
  sortField:      SortField
  onSortChange:   (f: SortField) => void
}

/** 将 wei 格式化为可读 Gas 费用（≥0.0001 OKB 显示 OKB，否则显示 Gwei） */
function formatGas(wei: bigint): string {
  const okb = Number(wei) / 1e18
  if (okb >= 0.0001) return `${okb.toFixed(6)} OKB`
  const gwei = Number(wei) / 1e9
  return `${gwei.toFixed(4)} Gwei`
}

/** 提取错误信息（兼容 ethers.js 错误对象） */
function errMsg(err: unknown): string {
  if (err == null) return '未知错误'
  if (typeof err === 'object') {
    const e = err as Record<string, unknown>
    return (
      (typeof e.shortMessage === 'string' && e.shortMessage) ||
      (typeof e.reason      === 'string' && e.reason) ||
      (typeof e.message     === 'string' && e.message) ||
      String(err)
    )
  }
  return String(err)
}

/** 侧边栏（钱包模式）：支持本地 CRUD + 批量上链 + 从链同步 */
export function WalletSidebar({
  notes, address, privateKey, selectedId,
  onSelect, onNewNote, onNotesChange,
  theme, onToggleTheme, sortField, onSortChange,
}: WalletSidebarProps) {
  const [search,    setSearch]    = useState('')
  const [uploading, setUploading] = useState(false)
  const [syncing,   setSyncing]   = useState(false)
  const [okbBalance, setOkbBalance] = useState<string | null>(null)
  const [gasUsed,    setGasUsed]    = useState<bigint>(BigInt(0))

  // 加载余额和 Gas
  const refreshStats = () => {
    getOKBBalance(address).then(setOkbBalance).catch(() => {})
    setGasUsed(getGasUsed(address))
  }
  useEffect(() => { refreshStats() }, [address])

  const pendingCount = notes.filter(n => n.pending).length

  // 新建笔记（本地）
  const handleNew = () => {
    const id      = crypto.randomUUID()
    const updated = upsertWalletNote(address, { id, title: '新建笔记', content: '' })
    onNotesChange(updated)
    onNewNote(id)
  }

  // 删除笔记（本地）
  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await invoke('set_suppress_blur', { suppress: true })
    const ok = await ask('确定删除这篇笔记吗？此操作不可恢复。', {
      title: '删除笔记',
      kind: 'warning',
    })
    setTimeout(() => invoke('set_suppress_blur', { suppress: false }), 300)
    if (!ok) return

    const note = notes.find(n => n.id === id)
    // 已上链的笔记需同步删除链上数据
    if (note && !note.pending) {
      try {
        const wallet = walletFromPrivateKey(privateKey)
        await deleteNoteOnChain(wallet, id)
        refreshStats()
      } catch (err: unknown) {
        toast.error(`链上删除失败: ${errMsg(err)}`)
        return
      }
    }

    const updated = removeWalletNote(address, id)
    onNotesChange(updated)
    if (selectedId === id) onNewNote(updated[0]?.id ?? '')
  }

  // 上传所有 pending 笔记到链上
  const handleUpload = async () => {
    const pending = notes.filter(n => n.pending)
    if (pending.length === 0) { toast.info('没有待上传的笔记'); return }

    await invoke('set_suppress_blur', { suppress: true })
    const ok = await ask(`即将将 ${pending.length} 篇笔记上传到 XLayer 链上，确认继续？`, {
      title: '上传到链上',
      kind: 'info',
    })
    setTimeout(() => invoke('set_suppress_blur', { suppress: false }), 300)
    if (!ok) return

    setUploading(true)
    try {
      const wallet  = walletFromPrivateKey(privateKey)
      const txHash  = await uploadNotes(wallet, pending)
      const updated = markUploaded(address, pending.map(n => n.id))
      onNotesChange(updated)
      toast.success(`上传成功！交易: ${txHash.slice(0, 10)}...`)
      refreshStats()
    } catch (err: unknown) {
      toast.error(`上传失败: ${errMsg(err)}`)
    } finally {
      setUploading(false)
    }
  }

  // 从链上同步笔记
  const handleSync = async () => {
    setSyncing(true)
    try {
      const wallet     = walletFromPrivateKey(privateKey)
      const chainNotes = await fetchNotesFromChain(address, wallet)
      const merged     = mergeChainNotes(address, chainNotes)
      onNotesChange(merged)
      toast.success(`同步完成，共 ${chainNotes.length} 篇链上笔记`)
    } catch (err: unknown) {
      toast.error(`同步失败: ${errMsg(err)}`)
    } finally {
      setSyncing(false)
    }
  }

  const handleLogout = () => {
    clearEncryptionKey()
    import('../lib/wallet').then(({ clearWalletSession }) => clearWalletSession())
    window.location.reload()
  }

  const sorted = [...notes].sort((a, b) => {
    if (sortField === 'title') return a.title.localeCompare(b.title)
    return new Date(b[sortField]).getTime() - new Date(a[sortField]).getTime()
  })

  const filtered = sorted.filter(
    n => n.title.toLowerCase().includes(search.toLowerCase()) ||
         n.content.toLowerCase().includes(search.toLowerCase()),
  )

  const formatTime = (s: string) => {
    const d = new Date(s), now = new Date()
    const diff = Math.floor((now.getTime() - d.getTime()) / 86400000)
    if (diff === 0) return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
    if (diff < 7)   return `${diff}天前`
    return `${d.getMonth()+1}/${d.getDate()}`
  }

  return (
    <div className="flex flex-col h-full w-64 shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 select-none">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h1 className="text-base font-bold text-gray-800 dark:text-gray-100">✍️ 云笺</h1>
          <p className="text-[10px] text-gray-400 truncate w-44" title={address}>
            {address.slice(0, 6)}...{address.slice(-4)}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-emerald-500 font-medium">
              {okbBalance !== null ? `${okbBalance} OKB` : '…'}
            </span>
            {gasUsed >BigInt(0) && (
              <span className="text-[10px] text-gray-400" title="累计消耗 Gas">
                Gas: {formatGas(gasUsed)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <PinToggle />
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button onClick={handleNew} title="新建 (Ctrl+N)"
            className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 transition-colors">
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* 上链操作区 */}
      <div className="px-3 py-2 flex gap-1.5">
        <button
          onClick={handleUpload}
          disabled={uploading || pendingCount === 0}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white transition-colors font-medium"
        >
          <Upload size={12} />
          {uploading ? '上传中...' : `上链${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
        </button>
        <button
          onClick={handleSync}
          disabled={syncing}
          title="从链上同步"
          className="p-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-40 transition-colors"
        >
          <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* 搜索框 */}
      <div className="px-3 pb-1.5">
        <div className="flex items-center gap-2 bg-white dark:bg-gray-700 rounded-lg px-3 py-1.5 border border-gray-200 dark:border-gray-600">
          <Search size={13} className="text-gray-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜索笔记..." className="flex-1 bg-transparent outline-none text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400" />
        </div>
      </div>

      {/* 排序 */}
      <div className="px-3 pb-1 flex items-center gap-1.5">
        <ArrowUpDown size={12} className="text-gray-400" />
        <select value={sortField} onChange={e => onSortChange(e.target.value as SortField)}
          className="flex-1 text-xs bg-transparent text-gray-400 dark:text-gray-500 outline-none cursor-pointer">
          <option value="updated_at">最近更新</option>
          <option value="created_at">创建时间</option>
          <option value="title">标题排序</option>
        </select>
      </div>

      {/* 笔记列表 */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8 px-4">
            {search ? '没有匹配的笔记' : '还没有笔记，点击 + 创建'}
          </div>
        ) : (
          filtered.map(note => (
            <div key={note.id} onClick={() => onSelect(note.id)}
              className={`group flex items-start justify-between px-4 py-3 cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-700/50 ${
                selectedId === note.id ? 'bg-blue-50 dark:bg-blue-900/20 border-r-2 border-blue-500' : ''
              }`}>
              <div className="flex-1 min-w-0 pr-1">
                <div className="flex items-center gap-1.5">
                  {/* pending 指示点 */}
                  {note.pending && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="本地未上链" />}
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                    {note.title || '无标题'}
                  </span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
                  <span>{formatTime(note.updated_at)}</span>
                  <span className="truncate">
                    {note.content.replace(/[#*`>\-\[\]()!_~]/g, '').replace(/\n+/g, ' ').trim().slice(0, 40) || '空笔记'}
                  </span>
                </div>
              </div>
              <button onClick={e => handleDelete(e, note.id)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-400 shrink-0 transition-opacity">
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* 底部退出 */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700">
        <button onClick={handleLogout}
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-red-500 w-full px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
          <LogOut size={13} />退出钱包
        </button>
      </div>
    </div>
  )
}
