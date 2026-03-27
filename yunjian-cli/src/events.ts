import { randomUUID } from 'node:crypto'
import {
  appendPendingEvent,
  loadAuthSession,
  loadEventCache,
  loadPendingEvents,
  loadState,
  saveEventCache,
  savePendingEvents,
  saveState,
} from './config.js'
import { decryptPayload, encryptPayload, unlockRepoCryptoKey } from './crypto.js'
import {
  getRepoConfig,
  getRepoFile,
  listRemoteEventFiles,
  putRepoFile,
  readEncryptedEvent,
  toSession,
} from './github.js'
import { Note, SyncEvent } from './types.js'

function isoNow(): string {
  return new Date().toISOString()
}

function remotePathForEvent(eventId: string) {
  return `notes/${eventId}.json`
}

const META_PREFIX = '<!-- yunjian-cli-meta:'
const META_SUFFIX = '-->'
const TITLE_PREFIX = '[yunjian-cli]'

function encodeEventBody(event: SyncEvent): string {
  const meta = JSON.stringify({
    type: event.type,
    to: event.to ?? null,
    deviceId: event.deviceId,
  })
  return `${event.content}\n\n${META_PREFIX}${meta}${META_SUFFIX}`
}

function parseEventBody(content: string): { message: string; meta: { type: SyncEvent['type']; to?: string; deviceId?: string } } | null {
  const start = content.lastIndexOf(META_PREFIX)
  const end = content.lastIndexOf(META_SUFFIX)
  if (start < 0 || end < 0 || end <= start) return null

  const metaRaw = content.slice(start + META_PREFIX.length, end).trim()
  const message = content.slice(0, start).trimEnd()
  try {
    const parsed = JSON.parse(metaRaw) as { type?: SyncEvent['type']; to?: string | null; deviceId?: string }
    if (parsed.type !== 'log' && parsed.type !== 'agent_message') return null
    return {
      message,
      meta: {
        type: parsed.type,
        to: parsed.to ?? undefined,
        deviceId: parsed.deviceId,
      },
    }
  } catch {
    return null
  }
}

function eventToNote(event: SyncEvent, owner: string): Note {
  const title = event.type === 'log' ? `${TITLE_PREFIX} log` : `${TITLE_PREFIX} agent:${event.to ?? 'unknown'}`
  return {
    id: event.id,
    user_id: owner,
    title,
    content: encodeEventBody(event),
    created_at: event.createdAt,
    updated_at: event.createdAt,
    pending: false,
  }
}

function noteToEvent(note: Note): SyncEvent | null {
  if (!note.title.startsWith(TITLE_PREFIX)) return null
  const parsed = parseEventBody(note.content)
  if (!parsed) return null

  return {
    id: note.id,
    type: parsed.meta.type,
    to: parsed.meta.to,
    deviceId: parsed.meta.deviceId ?? 'unknown-device',
    createdAt: note.created_at || note.updated_at,
    content: parsed.message,
  }
}

export async function createAndQueueEvent(input: {
  type: SyncEvent['type']
  content: string
  to?: string
}): Promise<SyncEvent> {
  const state = await loadState()
  const event: SyncEvent = {
    id: randomUUID(),
    type: input.type,
    content: input.content,
    to: input.to,
    deviceId: state.deviceId,
    createdAt: isoNow(),
  }
  await appendPendingEvent(event)
  return event
}

export async function runSync(): Promise<{ pushed: number; pulled: number; total: number }> {
  const auth = await loadAuthSession()
  if (!auth) {
    throw new Error('Not logged in. Run: yunjian auth login')
  }
  const session = toSession(auth)

  const repoConfig = await getRepoConfig(session)
  if (!repoConfig) {
    throw new Error('Repository encryption config missing')
  }
  const key = await unlockRepoCryptoKey(auth.passphrase, repoConfig.config)

  const pending = await loadPendingEvents()
  const pushedIds = new Set<string>()

  for (const event of pending) {
    const filePath = remotePathForEvent(event.id)
    const existing = await getRepoFile(session, filePath)
    if (!existing) {
      const note = eventToNote(event, auth.login)
      const encrypted = await encryptPayload(note, key, event.createdAt)
      await putRepoFile(session, {
        filePath,
        message: `add cli note ${event.id}`,
        content: JSON.stringify(encrypted, null, 2),
      })
    }
    pushedIds.add(event.id)
  }

  if (pushedIds.size > 0) {
    await savePendingEvents(pending.filter((event) => !pushedIds.has(event.id)))
  }

  const remotePaths = await listRemoteEventFiles(session)
  const cache = await loadEventCache()
  const known = new Set(cache.map((event) => event.id))
  const pulled: SyncEvent[] = []

  for (const filePath of remotePaths) {
    const name = filePath.split('/').pop()
    if (!name || !name.endsWith('.json')) continue
    const eventId = name.replace(/\.json$/, '')
    if (known.has(eventId)) continue

    const encrypted = await readEncryptedEvent(session, filePath)
    if (!encrypted) continue
    const note = await decryptPayload<Note>(encrypted, key)
    const event = noteToEvent(note)
    if (!event) continue
    pulled.push(event)
    known.add(event.id)
  }

  const merged = [...cache, ...pulled].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )
  await saveEventCache(merged)

  const state = await loadState()
  state.lastSyncAt = isoNow()
  await saveState(state)

  return {
    pushed: pushedIds.size,
    pulled: pulled.length,
    total: merged.length,
  }
}

export async function readLocalTimeline(limit: number): Promise<Array<SyncEvent & { pending?: boolean }>> {
  const cache = await loadEventCache()
  const pending = await loadPendingEvents()
  const merged: Array<SyncEvent & { pending?: boolean }> = [...cache]
  const seen = new Set(cache.map((event) => event.id))

  for (const event of pending) {
    if (!seen.has(event.id)) {
      merged.push({ ...event, pending: true })
    }
  }

  return merged
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, Math.max(limit, 1))
}
