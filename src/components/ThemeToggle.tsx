import { Sun, Moon } from 'lucide-react'
import { Theme } from '../types'

interface ThemeToggleProps {
  theme: Theme
  onToggle: () => void
}

/** 深色/浅色模式切换按钮 */
export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  return (
    <button
      onClick={onToggle}
      title={theme === 'light' ? '切换深色模式' : '切换浅色模式'}
      className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
    >
      {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  )
}
