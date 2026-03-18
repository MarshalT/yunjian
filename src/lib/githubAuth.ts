import { invoke } from '@tauri-apps/api/core'
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

  window.open(device.verification_uri, '_blank', 'noopener,noreferrer')

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
