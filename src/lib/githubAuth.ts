import { invoke } from '@tauri-apps/api/core'
import { createRepoCryptoConfig, RepoCryptoConfig, unlockRepoCryptoKey } from './githubCrypto'
import { GithubSession } from './githubSession'

interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

interface TokenPollResponse {
  status: 'ok' | 'pending' | 'slow_down' | 'denied' | 'expired' | 'error'
  access_token?: string
  error?: string
  error_description?: string
}

interface RepoCreateResponse {
  login: string
  repo: string
  branch: string
}

function requireClientId(): string {
  const clientId = (import.meta.env.VITE_GITHUB_CLIENT_ID as string | undefined)?.trim()
  if (!clientId) {
    throw new Error('缺少 VITE_GITHUB_CLIENT_ID，请在 .env 中配置 GitHub OAuth App Client ID')
  }
  return clientId
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function repoPrefix(): string {
  return ((import.meta.env.VITE_GITHUB_REPO_PREFIX as string | undefined) ?? 'yunjian-notes').trim()
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

async function fetchRepoConfig(session: GithubSession): Promise<{ config: RepoCryptoConfig; sha: string } | null> {
  const url = `https://api.github.com/repos/${session.login}/${session.repo}/contents/.yunjian/config.json?ref=${encodeURIComponent(session.branch)}`
  const res = await fetch(url, {
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${session.accessToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (res.status === 404) return null
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`读取加密配置失败: ${text || res.status}`)
  }

  const body = (await res.json()) as { content?: string; sha: string }
  if (!body.content) throw new Error('读取加密配置失败: 配置内容为空')

  return {
    config: JSON.parse(decodeBase64Utf8(body.content.replace(/\n/g, ''))) as RepoCryptoConfig,
    sha: body.sha,
  }
}

async function putRepoConfig(session: GithubSession, config: RepoCryptoConfig, sha?: string): Promise<void> {
  const url = `https://api.github.com/repos/${session.login}/${session.repo}/contents/.yunjian/config.json`
  const payload = {
    message: sha ? 'update encryption config' : 'init encryption config',
    content: encodeBase64Utf8(JSON.stringify(config, null, 2)),
    ...(sha ? { sha } : {}),
    branch: session.branch,
  }

  const res = await fetch(url, {
    method: 'PUT',
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${session.accessToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`写入加密配置失败: ${text || res.status}`)
  }
}

export async function verifyOrInitRepoPassphrase(session: GithubSession, passphrase: string): Promise<void> {
  const existing = await fetchRepoConfig(session)
  if (!existing) {
    const created = await createRepoCryptoConfig(passphrase)
    await putRepoConfig(session, created.config)
    return
  }

  await unlockRepoCryptoKey(passphrase, existing.config)
}

export async function startGithubDeviceFlowLogin(opts?: {
  onDeviceCode?: (payload: { userCode: string; verificationUri: string }) => void
}): Promise<{ session: GithubSession; userCode: string; verificationUri: string }> {
  const clientId = requireClientId()

  const device = await invoke<DeviceCodeResponse>('github_start_device_flow', {
    clientId,
  })

  opts?.onDeviceCode?.({
    userCode: device.user_code,
    verificationUri: device.verification_uri,
  })

  await invoke('open_external_url', { url: device.verification_uri })

  const deadline = Date.now() + device.expires_in * 1000
  let intervalMs = Math.max(3, device.interval) * 1000
  let accessToken = ''

  while (Date.now() < deadline) {
    await sleep(intervalMs)

    const polled = await invoke<TokenPollResponse>('github_poll_device_token', {
      clientId,
      deviceCode: device.device_code,
    })

    if (polled.status === 'ok' && polled.access_token) {
      accessToken = polled.access_token
      break
    }

    if (polled.status === 'pending') continue
    if (polled.status === 'slow_down') {
      intervalMs += 5000
      continue
    }
    if (polled.status === 'denied') {
      throw new Error('GitHub 授权被拒绝')
    }
    if (polled.status === 'expired') {
      throw new Error('GitHub 授权已过期，请重试')
    }

    throw new Error(polled.error_description ?? polled.error ?? 'GitHub 授权失败')
  }

  if (!accessToken) {
    throw new Error('GitHub 授权超时，请重试')
  }

  const created = await invoke<RepoCreateResponse>('github_create_repo_for_notes', {
    accessToken,
    repoPrefix: repoPrefix(),
  })

  return {
    userCode: device.user_code,
    verificationUri: device.verification_uri,
    session: {
      accessToken,
      login: created.login,
      repo: created.repo,
      branch: created.branch || 'main',
    },
  }
}
