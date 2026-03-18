import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { loadTheme, saveTheme } from './lib/store'
import { clearSupabaseEncryptionKey } from './lib/supabaseCrypto'
import { loadWalletSession } from './lib/wallet'
import { LoginPage } from './pages/LoginPage'
import { MainPage } from './pages/MainPage'
import { WalletMainPage } from './pages/WalletMainPage'
import { Theme } from './types'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

export default function App() {
  const [session,    setSession]    = useState<Session | null>(null)
  const [walletAuth, setWalletAuth] = useState<{ address: string; privateKey: string } | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [theme,      setTheme]      = useState<Theme>('light')

  useEffect(() => {
    // 初始化主题
    const saved      = loadTheme()
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark     = saved === 'dark' || (saved === 'system' && systemDark)
    applyTheme(isDark ? 'dark' : 'light')

    const mq         = window.matchMedia('(prefers-color-scheme: dark)')
    const onMqChange = (e: MediaQueryListEvent) => {
      if (loadTheme() === 'system') applyTheme(e.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', onMqChange)

    // 先检查钱包 session（sessionStorage 级别，关 app 即失效）
    const ws = loadWalletSession()
    if (ws) {
      setWalletAuth(ws)
      setLoading(false)
    } else {
      // 再检查 Supabase session
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session)
        setLoading(false)
      })
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) clearSupabaseEncryptionKey()
      setSession(session)
    })

    return () => {
      mq.removeEventListener('change', onMqChange)
      subscription.unsubscribe()
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
        // 钱包模式：本地存储，手动上链
        <WalletMainPage
          address={walletAuth.address}
          privateKey={walletAuth.privateKey}
          theme={theme}
          toggleTheme={toggleTheme}
        />
      ) : session ? (
        // Supabase 模式：云端自动同步
        <MainPage theme={theme} toggleTheme={toggleTheme} />
      ) : (
        // 未登录：登录页（支持两种方式）
        <LoginPage onWalletLogin={(addr, pk) => setWalletAuth({ address: addr, privateKey: pk })} />
      )}
      <Toaster richColors position="top-right" duration={3000} />
    </QueryClientProvider>
  )
}
