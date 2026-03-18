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
