import { AesKey, createRepoCryptoConfig, unlockRepoCryptoKey } from './crypto.js'
import { AuthSession, EncryptedPayload, RepoCryptoConfig } from './types.js'

interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

interface TokenPollResponse {
  access_token?: string
  error?: string
  error_description?: string
}

interface GithubUserResponse {
  login: string
}

interface GithubRepoResponse {
  name: string
  default_branch?: string
  description?: string
}

interface GithubTreeResponse {
  tree: Array<{
    path: string
    type: 'blob' | 'tree'
  }>
}

export interface GithubSession {
  accessToken: string
  login: string
  repo: string
  branch: string
}

interface RepoFileResponse {
  sha: string
  content?: string
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sanitizeRepoPrefix(prefix: string): string {
  const lowered = prefix.trim().toLowerCase()
  let out = ''
  let prevDash = false
  for (const ch of lowered) {
    const keep = /[a-z0-9]/.test(ch)
    if (keep) {
      out += ch
      prevDash = false
    } else if (!prevDash) {
      out += '-'
      prevDash = true
    }
  }
  const trimmed = out.replace(/^-+|-+$/g, '')
  return trimmed || 'yunjian-notes'
}

function canonicalRepoName(prefix: string, login: string): string {
  const p = sanitizeRepoPrefix(prefix)
  const l = login.trim().toLowerCase()
  const value = `${p}-${l}`.slice(0, 96).replace(/-+$/g, '')
  return value || `yunjian-notes-${Date.now()}`
}

function apiHeaders(accessToken: string, contentType = true): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${accessToken}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'yunjian-cli',
    ...(contentType ? { 'Content-Type': 'application/json' } : {}),
  }
}

async function readErrorText(res: Response) {
  try {
    const text = await res.text()
    return text || `${res.status} ${res.statusText}`
  } catch {
    return `${res.status} ${res.statusText}`
  }
}

export async function startDeviceFlow(clientId: string): Promise<DeviceCodeResponse> {
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      scope: 'repo read:user',
    }),
  })

  if (!res.ok) {
    throw new Error(`Failed to start device flow: ${await readErrorText(res)}`)
  }
  return (await res.json()) as DeviceCodeResponse
}

export async function pollDeviceToken(input: {
  clientId: string
  deviceCode: string
  expiresIn: number
  interval: number
}): Promise<string> {
  const deadline = Date.now() + input.expiresIn * 1000
  let intervalMs = Math.max(input.interval, 3) * 1000

  while (Date.now() < deadline) {
    await sleep(intervalMs)
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: input.clientId,
        device_code: input.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    })

    if (!res.ok) {
      throw new Error(`Failed to poll token: ${await readErrorText(res)}`)
    }

    const data = (await res.json()) as TokenPollResponse
    if (data.access_token) return data.access_token

    switch (data.error) {
      case 'authorization_pending':
        continue
      case 'slow_down':
        intervalMs += 5000
        continue
      case 'access_denied':
        throw new Error('Authorization denied by user')
      case 'expired_token':
        throw new Error('Device code expired')
      default:
        throw new Error(data.error_description || data.error || 'Token polling failed')
    }
  }

  throw new Error('GitHub authorization timed out')
}

export async function ensureRepoForNotes(accessToken: string, repoPrefix: string): Promise<GithubSession> {
  const userRes = await fetch('https://api.github.com/user', {
    headers: apiHeaders(accessToken, false),
  })
  if (!userRes.ok) throw new Error(`Failed to load user: ${await readErrorText(userRes)}`)
  const user = (await userRes.json()) as GithubUserResponse
  const canonical = canonicalRepoName(repoPrefix, user.login)

  const checkRes = await fetch(`https://api.github.com/repos/${user.login}/${canonical}`, {
    headers: apiHeaders(accessToken, false),
  })
  if (checkRes.ok) {
    const repo = (await checkRes.json()) as GithubRepoResponse
    return {
      accessToken,
      login: user.login,
      repo: repo.name,
      branch: repo.default_branch || 'main',
    }
  }

  const listRes = await fetch('https://api.github.com/user/repos?per_page=100&type=owner&sort=pushed&direction=desc', {
    headers: apiHeaders(accessToken, false),
  })
  if (listRes.ok) {
    const repos = (await listRes.json()) as GithubRepoResponse[]
    const prefix = sanitizeRepoPrefix(repoPrefix)
    const found = repos.find((repo) => repo.name.toLowerCase().startsWith(`${prefix}-`))
    if (found) {
      return {
        accessToken,
        login: user.login,
        repo: found.name,
        branch: found.default_branch || 'main',
      }
    }
  }

  const createRes = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: apiHeaders(accessToken),
    body: JSON.stringify({
      name: canonical,
      private: true,
      auto_init: true,
      description: 'Yunjian CLI encrypted sync data',
    }),
  })
  if (!createRes.ok) throw new Error(`Failed to create repository: ${await readErrorText(createRes)}`)
  const created = (await createRes.json()) as GithubRepoResponse
  return {
    accessToken,
    login: user.login,
    repo: created.name,
    branch: created.default_branch || 'main',
  }
}

function decodeBase64Utf8(base64: string): string {
  return Buffer.from(base64, 'base64').toString('utf8')
}

function encodeBase64Utf8(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64')
}

export async function getRepoFile(session: GithubSession, filePath: string): Promise<RepoFileResponse | null> {
  const url = `https://api.github.com/repos/${session.login}/${session.repo}/contents/${filePath}?ref=${encodeURIComponent(session.branch)}`
  const res = await fetch(url, {
    headers: apiHeaders(session.accessToken, false),
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to get file ${filePath}: ${await readErrorText(res)}`)
  return (await res.json()) as RepoFileResponse
}

export async function putRepoFile(
  session: GithubSession,
  input: { filePath: string; content: string; message: string; sha?: string },
) {
  const url = `https://api.github.com/repos/${session.login}/${session.repo}/contents/${input.filePath}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: apiHeaders(session.accessToken),
    body: JSON.stringify({
      message: input.message,
      content: encodeBase64Utf8(input.content),
      ...(input.sha ? { sha: input.sha } : {}),
      branch: session.branch,
    }),
  })
  if (!res.ok) throw new Error(`Failed to put file ${input.filePath}: ${await readErrorText(res)}`)
}

export async function getRepoConfig(session: GithubSession): Promise<{ config: RepoCryptoConfig; sha: string } | null> {
  const file = await getRepoFile(session, '.yunjian/config.json')
  if (!file) return null
  if (!file.content) throw new Error('Encryption config is empty')
  const decoded = decodeBase64Utf8(file.content.replace(/\n/g, ''))
  return {
    config: JSON.parse(decoded) as RepoCryptoConfig,
    sha: file.sha,
  }
}

export async function verifyOrInitRepoPassphrase(session: GithubSession, passphrase: string): Promise<AesKey> {
  const existing = await getRepoConfig(session)
  if (!existing) {
    const created = await createRepoCryptoConfig(passphrase)
    await putRepoFile(session, {
      filePath: '.yunjian/config.json',
      content: JSON.stringify(created.config, null, 2),
      message: 'init encryption config',
    })
    return created.key
  }
  return unlockRepoCryptoKey(passphrase, existing.config)
}

export async function listRemoteEventFiles(session: GithubSession): Promise<string[]> {
  const url = `https://api.github.com/repos/${session.login}/${session.repo}/git/trees/${encodeURIComponent(session.branch)}?recursive=1`
  const res = await fetch(url, {
    headers: apiHeaders(session.accessToken, false),
  })
  if (!res.ok) throw new Error(`Failed to list files: ${await readErrorText(res)}`)
  const tree = (await res.json()) as GithubTreeResponse
  return tree.tree
    .filter((item) => item.type === 'blob' && item.path.startsWith('notes/') && item.path.endsWith('.json'))
    .map((item) => item.path)
}

export async function readEncryptedEvent(session: GithubSession, filePath: string): Promise<EncryptedPayload | null> {
  const file = await getRepoFile(session, filePath)
  if (!file || !file.content) return null
  const decoded = decodeBase64Utf8(file.content.replace(/\n/g, ''))
  return JSON.parse(decoded) as EncryptedPayload
}

export function toSession(auth: AuthSession): GithubSession {
  return {
    accessToken: auth.accessToken,
    login: auth.login,
    repo: auth.repo,
    branch: auth.branch,
  }
}
