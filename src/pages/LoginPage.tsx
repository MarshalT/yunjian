import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from 'sonner'

type Mode = 'login' | 'register'

/** 登录 / 注册页面 */
export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<Mode>('login')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        toast.success('登录成功，欢迎回来！')
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        toast.success('注册成功！请检查邮箱完成验证后登录。')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '操作失败'
      // 英文错误信息汉化
      const zh: Record<string, string> = {
        'Invalid login credentials': '邮箱或密码错误',
        'Email not confirmed': '邮箱未验证，请先查收验证邮件',
        'User already registered': '该邮箱已注册，请直接登录',
        'Password should be at least 6 characters': '密码至少需要 6 个字符',
      }
      toast.error(zh[msg] ?? msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800">
      <div className="w-full max-w-sm">
        {/* 品牌 Logo */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">✍️</div>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">云笺</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            优雅的跨平台 Markdown 云端笔记
          </p>
        </div>

        {/* 登录卡片 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl shadow-black/5 p-8 border border-gray-100 dark:border-gray-700">
          {/* 模式切换 Tab */}
          <div className="flex mb-6 bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all ${
                  mode === m
                    ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                }`}
              >
                {m === 'login' ? '登录' : '注册'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                邮箱地址
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                autoComplete="email"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? '至少 6 位密码' : '请输入密码'}
                required
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-sm mt-2"
            >
              {loading ? '请稍候...' : mode === 'login' ? '登录' : '注册账号'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-4">
          数据端对端加密存储于 Supabase
        </p>
      </div>
    </div>
  )
}
