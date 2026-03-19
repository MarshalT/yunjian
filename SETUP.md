# 云笺 GitHub 版安装与配置指南

本文档按“当前项目真实实现”说明从零启动。

## 1. 环境要求

- Node.js 18+
- Rust stable（含 cargo）
- Tauri 2.x 运行所需系统依赖
  - macOS：Xcode Command Line Tools
  - Windows：MSVC Build Tools + WebView2 Runtime
  - Linux：GTK/WebKit2GTK（按 Tauri 官方文档）

安装 Rust：

```bash
curl https://sh.rustup.rs -sSf | sh
```

## 2. 获取代码并安装依赖

```bash
cd /Users/tangjianhong/脚本/yunjian-github
npm install
```

## 3. 配置 GitHub OAuth App（必须）

应用使用 GitHub Device Flow 登录，需要你自己的 OAuth App Client ID。

### 3.1 创建 OAuth App

1. 打开 GitHub OAuth Apps 页面：
   - Developer settings: https://github.com/settings/developers
   - 直接创建页: https://github.com/settings/applications/new
2. 建议填写：
   - Application name: `Yunjian Desktop`
   - Homepage URL: `http://localhost:1420`
   - Authorization callback URL: `http://localhost:1420/callback`
3. 创建后复制 `Client ID`
4. 在 OAuth App 设置中确认已启用 Device Flow（若有该开关）

## 4. 配置环境变量

复制并编辑 `.env`：

```bash
cp .env.example .env
```

`.env` 示例：

```env
VITE_GITHUB_CLIENT_ID=your_github_oauth_app_client_id
VITE_GITHUB_REPO_PREFIX=yunjian-notes
VITE_CONTRACT_ADDRESS=0x0277D3A6DEa35ba6d9585E1AF155779736FFBe25
```

字段说明：
- `VITE_GITHUB_CLIENT_ID`: GitHub OAuth App 的 Client ID
- `VITE_GITHUB_REPO_PREFIX`: 数据仓库名前缀
- `VITE_CONTRACT_ADDRESS`: 钱包上链模式用到

## 5. 启动开发环境

```bash
npm run tauri dev
```

## 6. 首次登录与仓库行为

1. 选择“GitHub 登录”
2. 输入加密口令（至少 8 位）
3. 点击登录后会自动打开系统浏览器授权页
4. 输入页面展示的授权码完成授权

登录后仓库行为：
- 先尝试复用固定仓库名：`<prefix>-<github_login>`
- 若存在旧版本历史仓库，会优先复用
- 若都不存在，首次自动创建

这保证同一 GitHub 账号在多设备登录共享同一仓库。

## 7. 数据写入规则（当前实现）

- 新建笔记：只创建本地草稿（列表显示“草稿”）
- 保存笔记：才会加密并上传到 GitHub
- 删除笔记：删除远端文件并同步清理本地缓存

## 8. 钱包模式配置与使用

钱包模式不依赖 GitHub，可单独使用。

### 8.1 必要配置

`.env` 中需配置合约地址：

```env
VITE_CONTRACT_ADDRESS=0x0277D3A6DEa35ba6d9585E1AF155779736FFBe25
```

### 8.2 使用流程

1. 在登录页切换到“钱包登录”
2. 输入私钥并登录
3. 本地创建/编辑笔记（会标记待上链）
4. 点击“上链”批量写入链上
5. 需要时点击“同步”从链上拉取

### 8.3 安全与注意事项

- 私钥只保存在会话中，应用关闭后自动失效
- 不建议在不可信设备输入私钥
- 删除已上链笔记会触发链上删除交易（会消耗 Gas）
- 钱包模式和 GitHub 模式数据互不共享
## 9. 加密机制说明

- 算法：AES-256-GCM
- KDF：PBKDF2-SHA256
- 仓库配置文件：`.yunjian/config.json`
- 笔记文件：`notes/<id>.json`（密文）
- 口令仅存 sessionStorage，重启后需重新输入

登录时即校验口令：
- 如果仓库已有加密配置，口令错误会直接拒绝登录
- 如果仓库还没配置，会用当前口令初始化

## 10. 打包

```bash
npm run tauri build
```

产物目录：

```text
src-tauri/target/release/bundle/
```

## 11. 常见问题

### Q1: 点登录后浏览器没打开

已使用后端命令拉起系统浏览器。若仍未打开，点“重新打开授权页面”按钮。

### Q2: 登录提示加密口令错误

说明该仓库已绑定历史口令。请使用同一口令，或清理仓库后重新初始化。

### Q3: 列表数量与仓库不一致

列表 = 远端日志 + 本地草稿。带“草稿”标签的是尚未保存到仓库的本地项。

### Q4: 删除后短时间又出现

项目已做 `no-store` + 延迟刷新。若偶现，等待 1-2 秒自动同步后会消失。

### Q5: 钱包模式看不到上链数据

先确认：\n1) 合约地址是否正确；\n2) 当前私钥地址是否与上链账户一致；\n3) 网络与 RPC 是否可用。\n然后点击“同步”从链上拉取。
## 12. 开发建议

- 功能改动后先执行：

```bash
npm run build
cd src-tauri && cargo check
```

- 涉及 Tauri Rust 命令改动时，必须重启 `tauri dev`。
