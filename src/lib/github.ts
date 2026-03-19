import { Note, SortField, SortOrder } from '../types'
import { loadGithubSession } from './githubSession'
import {
  createRepoCryptoConfig,
  decryptNote,
  encryptNote,
  EncryptedNotePayload,
  RepoCryptoConfig,
  requireGithubPassphrase,
  unlockRepoCryptoKey,
} from './githubCrypto'

interface GithubConfig {
  owner: string
  repo: string
  token: string
  branch: string
}

interface GithubContentItem {
  name: string
  path: string
  sha: string
  type: 'file' | 'dir'
}

interface GithubFileResponse {
  content?: string
  sha: string
}

const NOTES_DIR = 'notes'
const CONFIG_PATH = '.yunjian/config.json'

function getGithubConfig(): GithubConfig {
  const session = loadGithubSession()
  if (!session) {
    throw new Error('GitHub 未登录，请先完成 GitHub 授权')
  }

  return {
    owner: session.login,
    repo: session.repo,
    token: session.accessToken,
    branch: session.branch,
  }
}

async function githubRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const cfg = getGithubConfig()
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}${path}`

  const res = await fetch(url, {
    cache: 'no-store',
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${cfg.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    const text = await res.text()
    const message = text ? text.slice(0, 500) : `HTTP ${res.status}`
    throw new Error(`GitHub API 请求失败: ${message}`)
  }

  return (await res.json()) as T
}

function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary)
}

function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

function normalizeNote(raw: Partial<Note>, owner: string): Note {
  const now = new Date().toISOString()
  return {
    id: raw.id ?? crypto.randomUUID(),
    user_id: raw.user_id ?? owner,
    title: raw.title ?? '',
    content: raw.content ?? '',
    created_at: raw.created_at ?? now,
    updated_at: raw.updated_at ?? now,
    pending: false,
  }
}

function sortNotes(notes: Note[], sortField: SortField, sortOrder: SortOrder): Note[] {
  const list = [...notes]
  list.sort((a, b) => {
    if (sortField === 'title') {
      const t = a.title.localeCompare(b.title, 'zh-Hans-CN')
      return sortOrder === 'asc' ? t : -t
    }

    const av = new Date(a[sortField]).getTime()
    const bv = new Date(b[sortField]).getTime()
    const d = av - bv
    return sortOrder === 'asc' ? d : -d
  })
  return list
}

async function getNoteFileSha(path: string): Promise<string | null> {
  try {
    const data = await githubRequest<GithubFileResponse>(`/contents/${path}`)
    return data.sha
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('404')) return null
    throw err
  }
}

async function getRepoConfig(): Promise<{ config: RepoCryptoConfig; sha: string } | null> {
  const cfg = getGithubConfig()
  try {
    const file = await githubRequest<GithubFileResponse>(`/contents/${CONFIG_PATH}?ref=${encodeURIComponent(cfg.branch)}`)
    if (!file.content) throw new Error('加密配置文件内容为空')
    const text = decodeBase64Utf8(file.content.replace(/\n/g, ''))
    return {
      config: JSON.parse(text) as RepoCryptoConfig,
      sha: file.sha,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('404')) return null
    throw err
  }
}

async function putRepoConfig(config: RepoCryptoConfig, sha?: string): Promise<void> {
  const cfg = getGithubConfig()
  const body = {
    message: sha ? 'update encryption config' : 'init encryption config',
    content: encodeBase64Utf8(JSON.stringify(config, null, 2)),
    ...(sha ? { sha } : {}),
    branch: cfg.branch,
  }
  await githubRequest(`/contents/${CONFIG_PATH}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

async function ensureRepoKeyForWrite(): Promise<CryptoKey> {
  const passphrase = requireGithubPassphrase()
  const existing = await getRepoConfig()
  if (!existing) {
    const created = await createRepoCryptoConfig(passphrase)
    await putRepoConfig(created.config)
    return created.key
  }
  return unlockRepoCryptoKey(passphrase, existing.config)
}

async function loadRepoKeyForRead(): Promise<CryptoKey | null> {
  const existing = await getRepoConfig()
  if (!existing) return null
  const passphrase = requireGithubPassphrase()
  return unlockRepoCryptoKey(passphrase, existing.config)
}

export async function listGithubNotes(sortField: SortField, sortOrder: SortOrder): Promise<Note[]> {
  const cfg = getGithubConfig()
  let files: GithubContentItem[] = []

  try {
    files = await githubRequest<GithubContentItem[]>(`/contents/${NOTES_DIR}?ref=${encodeURIComponent(cfg.branch)}`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('404')) return []
    throw err
  }

  const noteFiles = files.filter((f) => f.type === 'file' && f.name.endsWith('.json'))
  if (noteFiles.length === 0) return []

  const key = await loadRepoKeyForRead()
  if (!key) {
    throw new Error('仓库缺少加密配置，无法读取数据')
  }

  const notes: Note[] = []

  for (const f of noteFiles) {
    const file = await githubRequest<GithubFileResponse>(`/contents/${f.path}?ref=${encodeURIComponent(cfg.branch)}`)
    if (!file.content) continue
    const parsed = JSON.parse(decodeBase64Utf8(file.content.replace(/\n/g, ''))) as EncryptedNotePayload
    const decrypted = await decryptNote(parsed, key)
    notes.push(normalizeNote(decrypted, cfg.owner))
  }

  return sortNotes(notes, sortField, sortOrder)
}

export async function createGithubNote(input: { title: string; content: string }): Promise<Note> {
  const cfg = getGithubConfig()
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    user_id: cfg.owner,
    title: input.title,
    content: input.content,
    created_at: now,
    updated_at: now,
    pending: true,
  }
}

export async function saveGithubNote(input: { id: string; title: string; content: string }): Promise<Note> {
  const cfg = getGithubConfig()
  const key = await ensureRepoKeyForWrite()
  const now = new Date().toISOString()
  const path = `${NOTES_DIR}/${input.id}.json`
  const sha = await getNoteFileSha(path)

  let createdAt = now
  if (sha) {
    try {
      const existing = await getGithubNoteById(input.id)
      createdAt = existing.created_at
    } catch {
      // 回退为当前时间
    }
  }

  const note: Note = {
    id: input.id,
    user_id: cfg.owner,
    title: input.title,
    content: input.content,
    created_at: createdAt,
    updated_at: now,
    pending: false,
  }
  const encrypted = await encryptNote(note, key)

  const body = {
    message: `${sha ? 'update' : 'create'} note ${note.id}`,
    content: encodeBase64Utf8(JSON.stringify(encrypted, null, 2)),
    ...(sha ? { sha } : {}),
    branch: cfg.branch,
  }

  await githubRequest(`/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })

  return note
}

export async function updateGithubNote(input: { id: string; title: string; content: string }): Promise<Note> {
  return saveGithubNote(input)
}

export async function deleteGithubNote(id: string): Promise<void> {
  const cfg = getGithubConfig()
  const path = `${NOTES_DIR}/${id}.json`
  const sha = await getNoteFileSha(path)
  if (!sha) return

  const body = {
    message: `delete note ${id}`,
    sha,
    branch: cfg.branch,
  }

  await githubRequest(`/contents/${path}`, {
    method: 'DELETE',
    body: JSON.stringify(body),
  })
}

export async function getGithubNoteById(id: string): Promise<Note> {
  const cfg = getGithubConfig()
  const key = await loadRepoKeyForRead()
  if (!key) throw new Error('仓库缺少加密配置，无法读取数据')
  const path = `${NOTES_DIR}/${id}.json`
  const file = await githubRequest<GithubFileResponse>(`/contents/${path}?ref=${encodeURIComponent(cfg.branch)}`)

  if (!file.content) {
    throw new Error('读取笔记失败：文件内容为空')
  }

  const parsed = JSON.parse(decodeBase64Utf8(file.content.replace(/\n/g, ''))) as EncryptedNotePayload
  const decrypted = await decryptNote(parsed, key)
  return normalizeNote(decrypted, cfg.owner)
}
