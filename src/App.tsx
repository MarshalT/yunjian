import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { loadTheme, saveTheme } from './lib/store'
import { LoginPage } from './pages/LoginPage'
import { MainPage } from './pages/MainPage'
import { Theme } from './types'

/** TanStack Query 全局客户端配置 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    // 初始化主题（读取本地偏好，或跟随系统）
    const saved = loadTheme()
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = saved === 'dark' || (saved === 'system' && systemDark)
    applyTheme(isDark ? 'dark' : 'light')

    // 监听系统主题变化（仅在 system 模式下生效）
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onMqChange = (e: MediaQueryListEvent) => {
      if (loadTheme() === 'system') applyTheme(e.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', onMqChange)

    // 恢复上次登录 session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    // 监听认证状态变化（登录/登出/token 刷新）
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => {
      mq.removeEventListener('change', onMqChange)
      subscription.unsubscribe()
    }
  }, [])

  /** 应用主题：更新 state + HTML class */
  const applyTheme = (t: Theme) => {
    setTheme(t)
    document.documentElement.classList.toggle('dark', t === 'dark')
  }

  /** 切换深色/浅色并持久化 */
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
      {session ? (
        <MainPage theme={theme} toggleTheme={toggleTheme} />
      ) : (
        <LoginPage />
      )}
      {/* 全局 Toast 通知 */}
      <Toaster richColors position="top-right" duration={3000} />
    </QueryClientProvider>
  )
}
