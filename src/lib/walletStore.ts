import type { WalletNote } from '../types'

/** 本地存储 key（按钱包地址隔离） */
const notesKey = (address: string) =>
  `Yunqian_wallet_notes_${address.toLowerCase()}`

const gasKey = (address: string) =>
  `Yunqian_gas_${address.toLowerCase()}`

/** 累计记录 Gas 消耗（wei 字符串存储） */
export function addGasUsed(address: string, weiAmount: bigint) {
  const stored  = localStorage.getItem(gasKey(address))
  const current = stored ? BigInt(stored) : 0n
  localStorage.setItem(gasKey(address), (current + weiAmount).toString())
}

/** 读取累计 Gas 消耗（wei） */
export function getGasUsed(address: string): bigint {
  const stored = localStorage.getItem(gasKey(address))
  return stored ? BigInt(stored) : 0n
}

export function loadWalletNotes(address: string): WalletNote[] {
  try {
    const raw = localStorage.getItem(notesKey(address))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function persist(address: string, notes: WalletNote[]) {
  localStorage.setItem(notesKey(address), JSON.stringify(notes))
}

/** 新建或更新笔记（自动标记为 pending） */
export function upsertWalletNote(
  address: string,
  patch: Partial<WalletNote> & { id: string },
): WalletNote[] {
  const notes = loadWalletNotes(address)
  const now   = new Date().toISOString()
  const idx   = notes.findIndex(n => n.id === patch.id)

  if (idx >= 0) {
    notes[idx] = { ...notes[idx], ...patch, updated_at: now, pending: true }
  } else {
    notes.unshift({
      address,
      title:      '新建笔记',
      content:    '',
      created_at: now,
      updated_at: now,
      pending:    true,
      ...patch,
    } as WalletNote)
  }
  persist(address, notes)
  return loadWalletNotes(address)
}

/** 删除笔记（仅本地） */
export function removeWalletNote(address: string, id: string): WalletNote[] {
  const notes = loadWalletNotes(address).filter(n => n.id !== id)
  persist(address, notes)
  return notes
}

/** 上传成功后标记笔记为已同步 */
export function markUploaded(address: string, ids: string[]) {
  const set   = new Set(ids)
  const notes = loadWalletNotes(address).map(n =>
    set.has(n.id) ? { ...n, pending: false } : n,
  )
  persist(address, notes)
  return notes
}

/** 从链上同步回来的笔记合并到本地（链上数据优先，但保留本地 pending） */
export function mergeChainNotes(address: string, chainNotes: WalletNote[]): WalletNote[] {
  const local = loadWalletNotes(address)
  const localMap = new Map(local.map(n => [n.id, n]))
  const chainIds = new Set(chainNotes.map(n => n.id))

  for (const cn of chainNotes) {
    const ln = localMap.get(cn.id)
    if (!ln || (!ln.pending && new Date(cn.updated_at) > new Date(ln.updated_at))) {
      localMap.set(cn.id, cn)
    }
  }

  // 链上已删除的笔记（本地非 pending）从本地移除
  for (const [id, note] of localMap) {
    if (!note.pending && !chainIds.has(id)) {
      localMap.delete(id)
    }
  }

  const merged = Array.from(localMap.values()).sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )
  persist(address, merged)
  return merged
}
