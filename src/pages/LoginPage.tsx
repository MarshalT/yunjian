import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { startGithubDeviceFlowLogin } from '../lib/githubAuth'
import { GithubSession } from '../lib/githubSession'
import {
  isValidPrivateKey, deriveAddress, normalizeKey,
  saveWalletSession, getLastWalletAddress,
} from '../lib/wallet'

interface LoginPageProps {
  onWalletLogin: (address: string, privateKey: string) => void
  onGithubLogin: (session: GithubSession) => void
}

export function LoginPage({ onWalletLogin, onGithubLogin }: LoginPageProps) {
  const [tab, setTab] = useState<'github' | 'wallet'>('github')

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">✍️</div>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">云笺 GitHub</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">登录后自动创建仓库存储数据</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl shadow-black/5 p-8 border border-gray-100 dark:border-gray-700">
          <div className="flex mb-6 bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
            <button
              onClick={() => setTab('github')}
              className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all ${
                tab === 'github'
                  ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
              }`}
            >
              ☁️ GitHub 登录
            </button>
            <button
              onClick={() => setTab('wallet')}
              className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all ${
                tab === 'wallet'
                  ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
              }`}
            >
              🔑 钱包登录
            </button>
          </div>

          {tab === 'github' ? (
            <GithubForm onLogin={onGithubLogin} />
          ) : (
            <WalletForm onLogin={onWalletLogin} />
          )}
        </div>

        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-4">
          {tab === 'github' ? 'GitHub 仓库作为数据存储（一个文件一条记录）' : '钱包数据本地优先，手动上链至 XLayer'}
        </p>
      </div>
    </div>
  )
}

function GithubForm({ onLogin }: { onLogin: (session: GithubSession) => void }) {
  const [loading, setLoading] = useState(false)
  const [userCode, setUserCode] = useState('')
  const [verifyUrl, setVerifyUrl] = useState('')

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.focus()
      el.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(el)
      return ok
    }
  }

  const handleLogin = async () => {
    setLoading(true)
    setUserCode('')
    setVerifyUrl('')

    try {
      const { session } = await startGithubDeviceFlowLogin({
        onDeviceCode: ({ userCode, verificationUri }) => {
          setUserCode(userCode)
          setVerifyUrl(verificationUri)
          toast.info(`请在 GitHub 页面输入授权码：${userCode}`)
        },
      })
      toast.success(`登录成功，已初始化仓库：${session.repo}`)
      onLogin(session)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'GitHub 登录失败'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
        登录后会自动创建一个新的私有仓库用于保存笔记数据。
      </div>

      {userCode && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-3 py-2.5">
          <p className="text-xs text-gray-400 mb-0.5">授权码</p>
          <div className="flex items-center gap-2">
            <p className="font-mono text-sm text-green-700 dark:text-green-400 break-all flex-1">{userCode}</p>
            <button
              type="button"
              onClick={async () => {
                const ok = await copyText(userCode)
                if (ok) toast.success('授权码已复制')
                else toast.error('复制失败，请手动复制')
              }}
              className="px-2 py-1 text-xs rounded-md bg-white/80 dark:bg-gray-800/60 border border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 hover:bg-white"
            >
              复制
            </button>
          </div>
          {verifyUrl && (
            <div className="mt-1 space-y-1">
              <p className="text-[11px] text-gray-500 break-all">请在浏览器完成授权：{verifyUrl}</p>
              <button
                type="button"
                onClick={() => window.open(verifyUrl, '_blank', 'noopener,noreferrer')}
                className="text-[11px] text-blue-600 hover:underline"
              >
                重新打开授权页面
              </button>
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleLogin}
        disabled={loading}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-medium rounded-xl transition-colors text-sm"
      >
        {loading ? '等待 GitHub 授权中...' : '使用 GitHub 登录'}
      </button>
    </div>
  )
}

function WalletForm({ onLogin }: { onLogin: (address: string, pk: string) => void }) {
  const lastAddr = getLastWalletAddress()
  const [pk, setPk] = useState('')
  const [showPk, setShowPk] = useState(false)
  const [derived, setDerived] = useState('')
  const [pkError, setPkError] = useState('')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim()
    setPk(val)
    setPkError('')
    if (!val) {
      setDerived('')
      return
    }
    if (isValidPrivateKey(val)) {
      setDerived(deriveAddress(val))
    } else {
      setDerived('')
      if (val.length > 10) setPkError('无效的私钥格式（需 64 位 hex）')
    }
  }

  const handleWalletLogin = () => {
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
          上次钱包：<span className="font-mono text-blue-500">{lastAddr.slice(0, 6)}...{lastAddr.slice(-4)}</span>
          <span className="ml-1 text-gray-400">（请重新输入私钥）</span>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          私钥 <span className="text-gray-400 font-normal">（64 位 hex）</span>
        </label>
        <div className="relative">
          <input
            type={showPk ? 'text' : 'password'}
            value={pk}
            onChange={handleChange}
            placeholder="0x... 或 64 位 hex 字符串"
            className="w-full px-4 py-2.5 pr-10 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
          />
          <button
            type="button"
            onClick={() => setShowPk(!showPk)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
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

      <button
        onClick={handleWalletLogin}
        disabled={!derived}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-medium rounded-xl transition-colors text-sm"
      >
        进入钱包模式
      </button>
    </div>
  )
}
