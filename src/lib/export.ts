import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { toast } from 'sonner'

/**
 * 导出笔记为 .md 文件
 * 弹出系统对话框前先告知 Rust 抑制失焦隐藏，对话框关闭后恢复
 */
export async function exportNote(title: string, content: string): Promise<void> {
  try {
    // 对话框即将抢走焦点，暂停失焦自动隐藏
    await invoke('set_suppress_blur', { suppress: true })

    const filePath = await save({
      filters: [{ name: 'Markdown 文件', extensions: ['md'] }],
      defaultPath: `${title.replace(/[<>:"/\\|?*\n\r]/g, '_') || '未命名'}.md`,
    })

    if (!filePath) return

    await writeTextFile(filePath, content)
    toast.success('导出成功')
  } catch (err) {
    console.error('导出失败:', err)
    toast.error('导出失败，请检查文件权限')
  } finally {
    // 恢复失焦自动隐藏，稍作延迟等窗口重新获得焦点
    setTimeout(() => invoke('set_suppress_blur', { suppress: false }), 300)
  }
}
