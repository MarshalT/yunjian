import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { loadTheme, saveTheme } from './lib/store'
import { clearGithubSession, GithubSession, loadGithubSession, saveGithubSession } from './lib/githubSession'
import { loadWalletSession } from './lib/wallet'
import { LoginPage } from './pages/LoginPage'
import { MainPage } from './pages/MainPage'
import { WalletMainPage } from './pages/WalletMainPage'
import { Theme } from './types'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

export default function App() {
  const [githubAuth, setGithubAuth] = useState<GithubSession | null>(null)
  const [walletAuth, setWalletAuth] = useState<{ address: string; privateKey: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    const saved = loadTheme()
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = saved === 'dark' || (saved === 'system' && systemDark)
    applyTheme(isDark ? 'dark' : 'light')

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onMqChange = (e: MediaQueryListEvent) => {
      if (loadTheme() === 'system') applyTheme(e.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', onMqChange)

    const ws = loadWalletSession()
    if (ws) {
      setWalletAuth(ws)
    } else {
      setGithubAuth(loadGithubSession())
    }
    setLoading(false)

    return () => {
      mq.removeEventListener('change', onMqChange)
    }
  }, [])

  const applyTheme = (t: Theme) => {
    setTheme(t)
    document.documentElement.classList.toggle('dark', t === 'dark')
  }

  const toggleTheme = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light'
    saveTheme(next)
    applyTheme(next)
  }

  const handleGithubLogin = (session: GithubSession) => {
    saveGithubSession(session)
    setGithubAuth(session)
  }

  const handleGithubLogout = () => {
    clearGithubSession()
    queryClient.clear()
    setGithubAuth(null)
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-gray-400 text-sm animate-pulse">加载中...</div>
      </div>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      {walletAuth ? (
        <WalletMainPage
          address={walletAuth.address}
          privateKey={walletAuth.privateKey}
          theme={theme}
          toggleTheme={toggleTheme}
        />
      ) : githubAuth ? (
        <MainPage theme={theme} toggleTheme={toggleTheme} onLogout={handleGithubLogout} />
      ) : (
        <LoginPage
          onGithubLogin={handleGithubLogin}
          onWalletLogin={(addr, pk) => setWalletAuth({ address: addr, privateKey: pk })}
        />
      )}
      <Toaster richColors position="top-right" duration={3000} />
    </QueryClientProvider>
  )
}
