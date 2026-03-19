# 云笺 GitHub 版

云笺是一个基于 Tauri 2.x 的跨平台 Markdown 笔记应用（Windows/macOS/Linux）。

当前版本采用 **GitHub 仓库作为云端存储**，并在客户端做 **端到端加密（E2EE）**：
- 登录后自动创建或复用同一仓库（多设备共享）
- 每篇笔记一个文件：`notes/<id>.json`
- 笔记内容密文保存到 GitHub，客户端解密后展示

## 功能概览

- GitHub OAuth Device Flow 登录
- 自动复用同一个数据仓库（首次创建，后续复用）
- 端到端加密（AES-256-GCM + PBKDF2）
- Markdown 实时编辑与预览（`@uiw/react-md-editor`）
- 自动保存（编辑后 3 秒）
- 快捷键：`Ctrl/Cmd+S` 保存，`Ctrl/Cmd+N` 新建
- 草稿机制：新建仅本地草稿，保存时才写入仓库
- 草稿可视化标识（黄点 + 草稿标签）
- 导出为 `.md`
- 主题切换（浅色/深色）
- 钱包模式（本地优先 + 手动上链，支持链上同步与链上删除）

## 模式对比

| 维度 | GitHub 模式 | 钱包模式 |
|---|---|---|
| 登录方式 | GitHub OAuth Device Flow | 私钥登录 |
| 云端存储 | GitHub 私有仓库（`notes/*.json`） | 链上合约存储 |
| 数据写入时机 | 新建本地草稿，保存时上传 | 新建/编辑本地，手动点击“上链” |
| 加密方式 | 口令派生密钥（PBKDF2 + AES-GCM） | 钱包签名派生密钥（AES-GCM） |
| 多设备同步 | 同 GitHub 账号 + 同口令自动共享 | 同钱包地址 + 同私钥同步 |
| 实时性 | 保存后即远端可见 | 需手动上链/同步 |
| 成本 | 无链上 Gas 成本 | 上链与链上删除消耗 Gas |
| 安全侧重点 | 口令保密、仓库权限控制 | 私钥安全与签名环境安全 |
| 适用场景 | 日常跨设备笔记协作 | 去中心化备份、链上可验证存证 |

## 技术栈

- 桌面框架：Tauri 2.x（Rust）
- 前端：React 18 + TypeScript + Vite
- 样式：Tailwind CSS
- 数据层：TanStack Query
- 通知：Sonner
- Markdown：@uiw/react-md-editor
- 云存储：GitHub REST API（仓库文件）

## 存储与加密设计

### 1. GitHub 仓库策略

- 仓库创建/复用由 Tauri 后端命令处理：
  - 首先尝试固定仓库名：`<repo_prefix>-<github_login>`
  - 若存在历史旧仓库（旧规则）则优先复用
  - 若都不存在才创建新仓库
- 因此同一 GitHub 账号在多设备登录会共享同一仓库

### 2. 文件组织

- 加密配置：`.yunjian/config.json`
- 笔记目录：`notes/`
- 单篇笔记：`notes/<note_id>.json`

### 3. 加密方案

- 算法：AES-256-GCM
- KDF：PBKDF2-SHA256（仓库级 salt）
- 登录时输入“加密口令”
- 口令仅存 `sessionStorage`（不上传 GitHub，不落磁盘）
- 登录后立即验证口令：
  - 无配置则初始化配置
  - 有配置则用 `key_check` 校验口令是否正确

### 4. 草稿与保存行为

- 点击新建：仅创建本地草稿（`pending=true`）
- 点击保存：加密后写入 GitHub 文件
- 删除：删除远端文件并同步清理本地缓存

## 钱包模式说明

钱包模式与 GitHub 模式并行存在，适用于“本地编辑 + 手动上链备份”的场景。

### 1. 登录与会话

- 使用私钥登录（前端校验格式并派生地址）
- 私钥仅保存在 `sessionStorage`（关闭应用后需重新输入）
- 地址会保存到 `localStorage` 作为“上次钱包”提示

### 2. 数据行为

- 本地笔记存储在钱包地址作用域下（本地优先）
- 新建/编辑后会标记 `pending=true`
- 点击“上链”时批量上传 pending 笔记到合约
- 可从链上同步笔记并与本地合并
- 已上链笔记删除时，会先尝试链上删除再更新本地

### 3. 钱包模式加密

- 上链前对标题与正文进行加密
- 密钥由钱包签名派生（确定性派生，跨设备可重复解密）
- 退出钱包模式会清理内存中的加密密钥缓存

### 4. 钱包模式界面能力

- 余额显示（OKB）
- 累计 Gas 显示
- 待上链数量显示
- 上链按钮 / 同步按钮 / 链上删除

## 目录结构（核心）

```text
src-tauri/
  src/
    lib.rs                 # 托盘、窗口行为、GitHub 后端命令
    main.rs
  Cargo.toml

src/
  components/
    Sidebar.tsx
    NoteEditor.tsx
    WalletSidebar.tsx
  pages/
    LoginPage.tsx
    MainPage.tsx
    WalletMainPage.tsx
  lib/
    githubAuth.ts          # GitHub OAuth 设备流
    githubSession.ts       # GitHub 会话管理
    github.ts              # GitHub 笔记读写
    githubCrypto.ts        # 端到端加密
    githubLocalStore.ts    # 远端缓存 + 本地草稿分层
    hooks.ts               # 查询/创建/更新/删除逻辑
    export.ts
    wallet.ts
    contract.ts
```

## 环境变量

见 [SETUP.md](./SETUP.md) 完整步骤。最小必填：

```env
VITE_GITHUB_CLIENT_ID=your_github_oauth_app_client_id
VITE_GITHUB_REPO_PREFIX=yunjian-notes
VITE_CONTRACT_ADDRESS=0x...
```

`VITE_GITHUB_CLIENT_ID` 获取地址：
- Developer settings: https://github.com/settings/developers
- OAuth App 创建页: https://github.com/settings/applications/new

## 常见问题

### 1) 登录后提示口令错误

说明仓库已有加密配置，你输入的口令与历史口令不一致。必须使用同一口令才能跨设备解密。

### 2) GitHub 授权页没有打开

当前版本已改为后端命令拉起系统默认浏览器。若系统拦截，请使用“重新打开授权页面”按钮。

### 3) 列表与仓库数量看起来不一致

列表 = 远端日志 + 本地草稿。带“草稿”标签的是尚未保存到仓库的本地项。

## 开发命令

```bash
npm install
npm run tauri dev
npm run build
```

## 许可证

仅用于学习与内部使用，按需扩展。
