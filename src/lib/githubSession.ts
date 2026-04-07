export interface GithubSession {
  accessToken: string
  login: string
  repo: string
  branch: string
}

const SESSION_KEY = 'Yunqian_github_session'

export function saveGithubSession(session: GithubSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function loadGithubSession(): GithubSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<GithubSession>
    if (!parsed.accessToken || !parsed.login || !parsed.repo || !parsed.branch) return null
    return {
      accessToken: parsed.accessToken,
      login: parsed.login,
      repo: parsed.repo,
      branch: parsed.branch,
    }
  } catch {
    return null
  }
}

export function clearGithubSession() {
  localStorage.removeItem(SESSION_KEY)
}

// 将 session 同步写入 CLI 配置目录，供 yunjian-cli 共享使用
export async function syncSessionToCli(session: GithubSession): Promise<void> {
  try {
    const { writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs')
    const { homeDir } = await import('@tauri-apps/api/path')
    const home = await homeDir()
    const dir = `${home}/.yunjian-cli`
    await mkdir(dir, { recursive: true })
    await writeTextFile(`${dir}/auth.json`, JSON.stringify(session, null, 2))
  } catch {
    // 同步失败不影响主流程
  }
}
