import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AuthSession, LocalState, SyncEvent } from './types.js'

const DATA_DIR = process.env.YUNJIAN_CLI_HOME || path.join(os.homedir(), '.yunjian-cli')
const AUTH_FILE = path.join(DATA_DIR, 'auth.json')
const STATE_FILE = path.join(DATA_DIR, 'state.json')
const PENDING_FILE = path.join(DATA_DIR, 'pending-events.json')
const CACHE_FILE = path.join(DATA_DIR, 'events-cache.json')

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 })
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function writeJson(filePath: string, value: unknown) {
  await ensureDataDir()
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 })
}

export function getDataDir() {
  return DATA_DIR
}

export async function loadAuthSession(): Promise<AuthSession | null> {
  return readJson<AuthSession>(AUTH_FILE)
}

export async function saveAuthSession(session: AuthSession) {
  await writeJson(AUTH_FILE, session)
}

export async function loadState(): Promise<LocalState> {
  const state = await readJson<LocalState>(STATE_FILE)
  if (state?.deviceId) return state
  const next: LocalState = { deviceId: randomUUID() }
  await saveState(next)
  return next
}

export async function saveState(state: LocalState) {
  await writeJson(STATE_FILE, state)
}

export async function loadPendingEvents(): Promise<SyncEvent[]> {
  return (await readJson<SyncEvent[]>(PENDING_FILE)) ?? []
}

export async function savePendingEvents(events: SyncEvent[]) {
  await writeJson(PENDING_FILE, events)
}

export async function appendPendingEvent(event: SyncEvent) {
  const current = await loadPendingEvents()
  current.push(event)
  await savePendingEvents(current)
}

export async function loadEventCache(): Promise<SyncEvent[]> {
  return (await readJson<SyncEvent[]>(CACHE_FILE)) ?? []
}

export async function saveEventCache(events: SyncEvent[]) {
  const sorted = [...events].sort((a, b) => {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })
  await writeJson(CACHE_FILE, sorted)
}
