import { useEffect, useState } from 'react'
import { Pin, PinOff } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { loadWindowPinned, saveWindowPinned } from '../lib/store'

/** 窗口钉住开关：开启后失去焦点不自动隐藏 */
export function PinToggle() {
  const [pinned, setPinned] = useState(loadWindowPinned())

  useEffect(() => {
    invoke('set_window_pinned', { pinned }).catch(() => {})
  }, [pinned])

  const toggle = () => {
    const next = !pinned
    setPinned(next)
    saveWindowPinned(next)
  }

  return (
    <button
      onClick={toggle}
      title={pinned ? '取消钉住窗口（恢复失焦隐藏）' : '钉住窗口（失焦不隐藏）'}
      className={`p-1.5 rounded-lg transition-colors ${
        pinned
          ? 'bg-blue-100 text-blue-600 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60'
          : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'
      }`}
    >
      {pinned ? <Pin size={16} /> : <PinOff size={16} />}
    </button>
  )
}
