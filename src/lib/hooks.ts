import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createGithubNote, deleteGithubNote, listGithubNotes, updateGithubNote } from './github'
import {
  loadGithubDraftNotes,
  loadGithubRemoteNotes,
  removeGithubDraftNote,
  removeGithubRemoteNote,
  saveGithubRemoteNotes,
  saveGithubDraftNotes,
  upsertGithubDraftNote,
  upsertGithubRemoteNote,
} from './githubLocalStore'
import { Note, SortField, SortOrder } from '../types'

function sortNotes(notes: Note[], sortField: SortField, sortOrder: SortOrder): Note[] {
  const list = [...notes]
  list.sort((a, b) => {
    if (sortField === 'title') {
      const d = a.title.localeCompare(b.title, 'zh-Hans-CN')
      return sortOrder === 'asc' ? d : -d
    }
    const d = new Date(a[sortField]).getTime() - new Date(b[sortField]).getTime()
    return sortOrder === 'asc' ? d : -d
  })
  return list
}

function mergeRemoteWithDrafts(remote: Note[], drafts: Note[], sortField: SortField, sortOrder: SortOrder): Note[] {
  const map = new Map<string, Note>()
  remote.forEach((n) => map.set(n.id, { ...n, pending: false }))

  for (const draft of drafts) {
    map.set(draft.id, { ...draft, pending: true })
  }

  return sortNotes(Array.from(map.values()), sortField, sortOrder)
}

// ===== 笔记列表查询 =====

/**
 * 获取所有笔记
 * 在线时从 GitHub 拉取并写入缓存；离线时使用本地缓存作为占位数据
 */
export function useNotes(sortField: SortField = 'updated_at', sortOrder: SortOrder = 'desc') {
  const placeholder = mergeRemoteWithDrafts(
    loadGithubRemoteNotes(),
    loadGithubDraftNotes(),
    sortField,
    sortOrder,
  )

  return useQuery({
    queryKey: ['notes', sortField, sortOrder],
    queryFn: async () => {
      const remote = await listGithubNotes(sortField, sortOrder)
      saveGithubRemoteNotes(remote)

      // 仅保留“还未上仓库”的草稿，已落库 id 直接剔除，防止列表与仓库数量漂移
      const remoteIds = new Set(remote.map((n) => n.id))
      const pendingDrafts = loadGithubDraftNotes().filter((d) => !remoteIds.has(d.id))
      saveGithubDraftNotes(pendingDrafts)

      return mergeRemoteWithDrafts(remote, pendingDrafts, sortField, sortOrder)
    },
    placeholderData: placeholder,
    retry: 1,
    staleTime: 30_000,
  })
}

// ===== 新建笔记 =====

/** 创建一篇新笔记并刷新列表 */
export function useCreateNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (note: { title: string; content: string }) => {
      return createGithubNote(note)
    },
    onSuccess: (note) => {
      upsertGithubDraftNote(note)
      queryClient.setQueriesData<Note[]>({ queryKey: ['notes'] }, (old) => {
        if (!old) return [note]
        const exists = old.some((n) => n.id === note.id)
        if (exists) return old.map((n) => (n.id === note.id ? note : n))
        return [note, ...old]
      })
    },
    onError: (err: Error) => {
      toast.error(`创建失败: ${err.message}`)
    },
  })
}

// ===== 更新笔记 =====

/** 更新笔记内容（标题或正文），同步更新缓存 */
export function useUpdateNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, title, content }: { id: string; title: string; content: string }) => {
      return updateGithubNote({ id, title, content })
    },
    onSuccess: (note, vars) => {
      removeGithubDraftNote(vars.id)
      upsertGithubRemoteNote(note)
      queryClient.setQueriesData<Note[]>({ queryKey: ['notes'] }, (old) => {
        if (!old) return [note]
        const filtered = old.filter((n) => n.id !== vars.id)
        return [note, ...filtered]
      })
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
    onError: (err: Error) => {
      toast.error(`保存失败: ${err.message}`)
    },
  })
}

// ===== 删除笔记 =====

/** 删除笔记并从缓存中移除 */
export function useDeleteNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      await deleteGithubNote(id)
      removeGithubDraftNote(id)
      removeGithubRemoteNote(id)
    },
    onSuccess: (_data, id) => {
      queryClient.setQueriesData<Note[]>({ queryKey: ['notes'] }, (old) => old?.filter((n) => n.id !== id))
      // GitHub 删除后短时间内 API 可能返回旧索引，延迟刷新避免“回魂”
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['notes'] })
      }, 1200)
      toast.success('笔记已删除')
    },
    onError: (err: Error) => {
      toast.error(`删除失败: ${err.message}`)
    },
  })
}

export type { Note, SortField, SortOrder }
