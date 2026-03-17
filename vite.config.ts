import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // 防止 Vite 清空终端输出（Tauri 调试需要）
  clearScreen: false,

  server: {
    // Tauri 默认端口
    port: 1420,
    strictPort: true,
    watch: {
      // 忽略 Rust 目录的文件监听
      ignored: ['**/src-tauri/**'],
    },
  },

  // 允许 VITE_ 和 TAURI_ENV_ 开头的环境变量
  envPrefix: ['VITE_', 'TAURI_ENV_'],

  build: {
    // Tauri 对 Windows 使用 Chromium，对 macOS 使用 WebKit
    target: ['es2021', 'chrome100', 'safari13'],
    // 开发时不压缩以便调试
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
})
