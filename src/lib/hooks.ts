import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from './supabase'
import { cacheNotes, loadCachedNotes, updateCachedNote, deleteCachedNote } from './store'
import {
  decryptMaybeEncryptedField,
  encryptNoteFields,
  getSupabaseEncryptionKey,
  noteNeedsKey,
} from './supabaseCrypto'
import { Note, SortField, SortOrder } from '../types'

// ===== 笔记列表查询 =====

/**
 * 获取当前用户的所有笔记
 * 在线时从 Supabase 拉取并写入缓存；离线时使用本地缓存作为占位数据
 */
export function useNotes(sortField: SortField = 'updated_at', sortOrder: SortOrder = 'desc') {
  return useQuery({
    queryKey: ['notes', sortField, sortOrder],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('未登录')

      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', user.id)
        .order(sortField, { ascending: sortOrder === 'asc' })

      if (error) throw error

      const rows = (data ?? []) as Note[]
      const key = await getSupabaseEncryptionKey(user.id)

      if (!key && rows.some((n) => noteNeedsKey(n.title, n.content))) {
        throw new Error('检测到已加密笔记，但当前会话未解锁。请退出后重新用密码登录。')
      }

      const notes: Note[] = await Promise.all(
        rows.map(async (n) => ({
          ...n,
          title: await decryptMaybeEncryptedField(key, n.title),
          content: await decryptMaybeEncryptedField(key, n.content),
        })),
      )
      // 同步写入本地缓存，下次离线可用
      cacheNotes(notes)
      return notes
    },
    // 网络请求失败时返回本地缓存（离线支持）
    placeholderData: loadCachedNotes(),
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
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('未登录')
      const key = await getSupabaseEncryptionKey(user.id)
      if (!key) throw new Error('当前会话未解锁，无法加密保存。请退出后重新登录。')

      const encrypted = await encryptNoteFields(key, note.title, note.content)

      const { data, error } = await supabase
        .from('notes')
        .insert({
          user_id: user.id,
          title: encrypted.title,
          content: encrypted.content,
        })
        .select()
        .single()

      if (error) throw error
      return {
        ...(data as Note),
        title: note.title,
        content: note.content,
      }
    },
    onSuccess: (note) => {
      // 乐观更新：直接把新笔记插入缓存
      updateCachedNote(note)
      queryClient.invalidateQueries({ queryKey: ['notes'] })
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
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('未登录')
      const key = await getSupabaseEncryptionKey(user.id)
      if (!key) throw new Error('当前会话未解锁，无法加密保存。请退出后重新登录。')
      const encrypted = await encryptNoteFields(key, title, content)

      const { data, error } = await supabase
        .from('notes')
        .update({
          title: encrypted.title,
          content: encrypted.content,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return {
        ...(data as Note),
        title,
        content,
      }
    },
    onSuccess: (note) => {
      updateCachedNote(note)
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
      const { error } = await supabase.from('notes').delete().eq('id', id)
      if (error) throw error
      deleteCachedNote(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      toast.success('笔记已删除')
    },
    onError: (err: Error) => {
      toast.error(`删除失败: ${err.message}`)
    },
  })
}
