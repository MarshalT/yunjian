import { Note } from '../types'
import { loadGithubSession } from './githubSession'

const REMOTE_KEY_PREFIX = 'Yunqian_github_remote_'
const DRAFT_KEY_PREFIX = 'Yunqian_github_drafts_'

function repoScope(): string {
  const session = loadGithubSession()
  if (!session?.login || !session.repo) return 'default'
  return `${session.login}_${session.repo}`.toLowerCase()
}

function remoteKey() {
  return `${REMOTE_KEY_PREFIX}${repoScope()}`
}

function draftKey() {
  return `${DRAFT_KEY_PREFIX}${repoScope()}`
}

function safeParse(raw: string | null): Note[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Note[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function write(key: string, notes: Note[]) {
  try {
    localStorage.setItem(key, JSON.stringify(notes))
  } catch {
    // ignore storage errors
  }
}

export function loadGithubRemoteNotes(): Note[] {
  return safeParse(localStorage.getItem(remoteKey())).map((n) => ({ ...n, pending: false }))
}

export function saveGithubRemoteNotes(notes: Note[]) {
  write(
    remoteKey(),
    notes.map((n) => ({ ...n, pending: false })),
  )
}

export function upsertGithubRemoteNote(note: Note) {
  const list = loadGithubRemoteNotes()
  const idx = list.findIndex((n) => n.id === note.id)
  const value = { ...note, pending: false }
  if (idx >= 0) list[idx] = value
  else list.unshift(value)
  saveGithubRemoteNotes(list)
}

export function removeGithubRemoteNote(id: string) {
  saveGithubRemoteNotes(loadGithubRemoteNotes().filter((n) => n.id !== id))
}

export function loadGithubDraftNotes(): Note[] {
  return safeParse(localStorage.getItem(draftKey())).map((n) => ({ ...n, pending: true }))
}

export function saveGithubDraftNotes(notes: Note[]) {
  write(
    draftKey(),
    notes.map((n) => ({ ...n, pending: true })),
  )
}

export function upsertGithubDraftNote(note: Note) {
  const list = loadGithubDraftNotes()
  const idx = list.findIndex((n) => n.id === note.id)
  const value = { ...note, pending: true }
  if (idx >= 0) list[idx] = value
  else list.unshift(value)
  saveGithubDraftNotes(list)
}

export function removeGithubDraftNote(id: string) {
  saveGithubDraftNotes(loadGithubDraftNotes().filter((n) => n.id !== id))
}
