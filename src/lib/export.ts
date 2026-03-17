import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { toast } from 'sonner'

/**
 * 将笔记内容导出为 .md 文件
 * 使用 Tauri dialog 让用户选择保存路径，然后写入文件
 */
export async function exportNote(title: string, content: string): Promise<void> {
  try {
    // 弹出系统「另存为」对话框，限制只能保存 .md 格式
    const filePath = await save({
      filters: [{ name: 'Markdown 文件', extensions: ['md'] }],
      // 默认文件名（去掉文件系统非法字符）
      defaultPath: `${title.replace(/[<>:"/\\|?*\n\r]/g, '_') || '未命名'}.md`,
    })

    if (!filePath) return // 用户取消对话框

    await writeTextFile(filePath, content)
    toast.success('导出成功')
  } catch (err) {
    console.error('导出失败:', err)
    toast.error('导出失败，请检查文件权限')
  }
}
