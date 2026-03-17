# 云笺 - 跨平台 Markdown 云端笔记

基于 **Tauri 2.x + React + TypeScript + Supabase** 构建的跨平台桌面笔记应用。

## 技术栈

| 层次 | 技术 |
|------|------|
| 桌面框架 | Tauri 2.x (Rust) |
| 前端 | React 18 + TypeScript + Vite |
| 样式 | Tailwind CSS |
| Markdown | @uiw/react-md-editor（实时分屏预览） |
| 数据存储 | Supabase（PostgreSQL + Auth + Realtime） |
| 状态管理 | TanStack Query v5 |
| 通知 | Sonner |

## 快速开始

### 1. 环境准备

```bash
# 安装 Rust（必须）
# https://www.rust-lang.org/tools/install

# 安装 Node.js 18+
# https://nodejs.org

# 安装 pnpm
npm install -g pnpm

# Windows 额外安装 WebView2（Win10 通常已内置）
# https://developer.microsoft.com/en-us/microsoft-edge/webview2/
```

### 2. 配置 Supabase

1. 前往 [supabase.com](https://supabase.com) 创建新项目
2. 在 **SQL Editor** 中执行 `supabase/schema.sql` 中的所有 SQL
3. 在 **Table Editor → notes → Realtime** 中开启实时订阅
4. 在 **Project Settings → API** 中复制 `Project URL` 和 `anon public` key

### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`：

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4. 安装依赖

```bash
pnpm install
```

### 5. 开发运行

```bash
pnpm tauri dev
```

### 6. 打包构建

```bash
# 当前平台打包
pnpm tauri build

# 产物位于 src-tauri/target/release/bundle/
# Windows: .msi 安装包 + .exe
# macOS:   .dmg + .app
# Linux:   .deb + .AppImage
```

## 功能

- **用户认证**：邮箱密码注册登录（Supabase Auth）
- **Markdown 编辑**：分屏实时预览，支持 GFM 语法
- **自动保存**：编辑后 3 秒自动同步至云端
- **实时同步**：Supabase Realtime，多设备实时刷新
- **离线支持**：断网时读取本地缓存，联网后自动同步
- **导出**：导出单篇笔记为 `.md` 文件
- **深色模式**：跟随系统或手动切换
- **笔记搜索**：标题 + 内容全文搜索
- **排序**：按更新时间 / 创建时间 / 标题排序

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+S` | 立即保存当前笔记 |
| `Ctrl+N` | 新建笔记 |

## 常见问题

**Q: Tauri 开发时报 `WebView2` 错误（Windows）**
> 安装 [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)

**Q: 导出文件无权限**
> 检查 `src-tauri/capabilities/default.json` 中的 `fs:allow-write-text-file` 路径范围

**Q: Supabase 连接失败**
> 确认 `.env` 文件存在且 URL/KEY 填写正确；不要使用 `service_role` key，应使用 `anon` key

**Q: 注册后无法登录**
> Supabase 默认需要邮箱验证，检查邮箱收件箱，或在 Supabase 控制台 **Auth → Settings** 中关闭邮箱验证
