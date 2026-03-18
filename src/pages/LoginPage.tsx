import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import {
  isValidPrivateKey, deriveAddress, normalizeKey,
  saveWalletSession, getLastWalletAddress,
} from '../lib/wallet'

interface LoginPageProps {
  onWalletLogin: (address: string, privateKey: string) => void
}

export function LoginPage({ onWalletLogin }: LoginPageProps) {
  const [tab, setTab] = useState<'supabase' | 'wallet'>('wallet')

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">✍️</div>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">云笺</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">优雅的跨平台 Markdown 云端笔记</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl shadow-black/5 p-8 border border-gray-100 dark:border-gray-700">
          {/* 登录方式切换 */}
          <div className="flex mb-6 bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
           
            <button onClick={() => setTab('wallet')}
              className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all ${
                tab === 'wallet'
                  ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
              }`}>
              🔑 钱包登录
            </button>
            <button onClick={() => setTab('supabase')}
              className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all ${
                tab === 'supabase'
                  ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
              }`}>
              账号登录
            </button>
          </div>

          {tab === 'supabase' ? (
            <SupabaseForm />
          ) : (
            <WalletForm onLogin={onWalletLogin} />
          )}
        </div>

        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-4">
          {tab === 'supabase' ? '账号数据存储于 Supabase' : '钱包数据本地优先，手动上链至 XLayer'}
        </p>
      </div>
    </div>
  )
}

// ── 账号登录表单 ──
function SupabaseForm() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [mode,     setMode]     = useState<'login' | 'register'>('login')
  const [loading,  setLoading]  = useState(false)

  const i18n: Record<string, string> = {
    'Invalid login credentials':              '邮箱或密码错误',
    'Email not confirmed':                    '邮箱未验证，请查收验证邮件',
    'User already registered':                '该邮箱已注册，请直接登录',
    'Password should be at least 6 characters': '密码至少需要 6 个字符',
  }

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
      toast.error(i18n[msg] ?? msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex mb-2 bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
        {(['login', 'register'] as const).map(m => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all ${
              mode === m
                ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400'
            }`}>
            {m === 'login' ? '登录' : '注册'}
          </button>
        ))}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">邮箱地址</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"
          placeholder="your@email.com"
          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">密码</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
          placeholder={mode === 'register' ? '至少 6 位密码' : '请输入密码'}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
      </div>
      <button type="submit" disabled={loading}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors disabled:opacity-60 text-sm mt-2">
        {loading ? '请稍候...' : mode === 'login' ? '登录' : '注册账号'}
      </button>
    </form>
  )
}

// ── 钱包私钥登录表单 ──
function WalletForm({ onLogin }: { onLogin: (address: string, pk: string) => void }) {
  const lastAddr = getLastWalletAddress()
  const [pk,      setPk]      = useState('')
  const [showPk,  setShowPk]  = useState(false)
  const [derived, setDerived] = useState('')
  const [pkError, setPkError] = useState('')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim()
    setPk(val); setPkError('')
    if (!val) { setDerived(''); return }
    if (isValidPrivateKey(val)) {
      setDerived(deriveAddress(val))
    } else {
      setDerived('')
      if (val.length > 10) setPkError('无效的私钥格式（需 64 位 hex）')
    }
  }

  const handleLogin = () => {
    if (!derived) return
    const normalized = normalizeKey(pk)
    saveWalletSession(normalized, derived)
    onLogin(derived, normalized)
    toast.success('钱包登录成功')
  }

  return (
    <div className="space-y-4">
      {lastAddr && (
        <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
          上次钱包：<span className="font-mono text-blue-500">{lastAddr.slice(0,6)}...{lastAddr.slice(-4)}</span>
          <span className="ml-1 text-gray-400">（请重新输入私钥）</span>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          私钥 <span className="text-gray-400 font-normal">（64 位 hex）</span>
        </label>
        <div className="relative">
          <input type={showPk ? 'text' : 'password'} value={pk} onChange={handleChange}
            placeholder="0x... 或 64 位 hex 字符串"
            className="w-full px-4 py-2.5 pr-10 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm" />
          <button type="button" onClick={() => setShowPk(!showPk)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {showPk ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        {pkError && <p className="text-red-500 text-xs mt-1">{pkError}</p>}
      </div>

      {derived && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-3 py-2.5">
          <p className="text-xs text-gray-400 mb-0.5">派生钱包地址</p>
          <p className="font-mono text-sm text-green-700 dark:text-green-400 break-all">{derived}</p>
        </div>
      )}

      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
        ⚠️ 私钥仅保存在内存中，应用关闭后自动清除。请勿在不信任的设备上使用。
      </div>

      <button onClick={handleLogin} disabled={!derived}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-medium rounded-xl transition-colors text-sm">
        进入钱包模式
      </button>
    </div>
  )
}
