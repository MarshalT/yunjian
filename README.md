你现在是一位资深的全栈工程师 + Tauri 框架专家，同时非常熟悉 Supabase 的使用。请为我完整生成一个跨平台（Windows、macOS、Linux）Markdown 笔记桌面应用的完整项目代码和搭建指南，使用最新稳定版的 Tauri 2.x 框架，前端使用 React + TypeScript + Tailwind CSS，后端使用 Rust（Tauri 默认），数据全部存储在 Supabase 云端数据库。

核心需求如下：

1. 项目名称：建议叫 "MarkDownSync" 或 "云笺"（你可以自己起一个好听的中文/英文名）

2. 主要功能：
   - 用户注册/登录（Supabase Auth，支持邮箱密码登录 + 可选 GitHub/Google 第三方登录）
   - 创建、编辑、删除、搜索笔记
   - Markdown 编辑器（支持实时预览，最好用 monaco-editor 或 @uiw/react-md-editor 这种好用的组件）
   - 笔记列表（侧边栏），支持按标题搜索
   - 自动保存（编辑后 3–5 秒自动同步到 Supabase）
   - 深色/浅色模式切换（跟随系统或手动）
   - 离线支持（使用 localStorage 或 tauri-plugin-store 做简单缓存，重新联网时同步）
   - 导出单篇笔记为 .md 文件（使用 Tauri 的文件系统 API）
   - 基本的笔记排序（创建时间/更新时间/标题）

3. 技术栈强制要求：
   - Tauri 2.x（必须使用新版插件系统）
   - 前端：React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui 或 Radix UI（推荐现代组件库）
   - Markdown 处理：react-markdown + remark-gfm + rehype-raw + rehype-highlight 等插件
   - Supabase：使用 @supabase/supabase-js 最新版
   - 数据库表结构（在 Supabase 中创建）：
     - 表名：notes
     - 字段：id (uuid primary key), user_id (uuid references auth.users), title (text), content (text), created_at (timestamptz), updated_at (timestamptz)
   - 开启 Supabase Row Level Security (RLS)，确保用户只能读写自己的笔记（policy 示例要给出）
   - 实时同步：尽量使用 Supabase Realtime 订阅（当笔记变更时，其他设备能看到更新）

4. 项目结构建议（请按照这个结构输出代码）：
   src-tauri/
   ├── src/
   │   └── main.rs
   ├── tauri.conf.json
   ├── capabilities/
   └── Cargo.toml
   src/                    # 前端
   ├── components/
   ├── pages/
   ├── lib/
   │   └── supabase.ts     # supabase 客户端初始化 + hooks
   ├── App.tsx
   ├── main.tsx
   └── index.css
   README.md               # 中文说明文档（必须包含：安装依赖、配置 Supabase、运行、打包步骤）

5. 必须提供的完整内容：
   - Supabase 项目创建 + 表结构 SQL + RLS 策略 SQL（中文注释）
   - .env.example 文件内容（SUPABASE_URL 和 SUPABASE_ANON_KEY）
   - 前端如何处理登录状态、登出、保护路由
   - Tauri 如何安全地调用文件系统（保存导出 md 文件）
   - 完整的 package.json / pnpm-lock.yaml（或 yarn）依赖列表
   - 推荐的 VS Code 插件和常用命令
   - 打包命令（tauri build）各平台的说明

6. 代码风格要求：
   - 所有代码必须带中文注释（关键部分详细说明）
   - 使用现代 hooks（如 useQuery/useMutation 如果用 tanstack-query 更好）
   - 错误处理要友好（toast 提示，使用 sonner 或 react-hot-toast）
   - UI 要简洁现代，美观（参考 Notion / Obsidian 的感觉）

7. 额外加分项（如果能实现更好）：
   - 使用 tanstack/query + supabase realtime 实现乐观更新
   - 支持笔记文件夹（简单层级）
   - 快捷键（Ctrl+S 保存、Ctrl+N 新建等）

请按照以下顺序完整输出：
1. 项目中文介绍 + 技术亮点
2. Supabase 后台配置步骤（SQL + RLS）
3. 项目完整目录树
4. 关键配置文件（tauri.conf.json、package.json、.env.example）
5. 核心代码文件（逐个给出，带路径）
6. 安装 & 运行 & 打包完整教程（中文）
7. 可能遇到的坑 + 解决方案

开始吧！直接输出完整可运行的项目内容，不要省略代码。