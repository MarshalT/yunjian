use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use std::time::{SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// 记录窗口最近一次因失去焦点而隐藏的时间戳
type LastHideTime = Arc<Mutex<Option<Instant>>>;

/// 对话框打开期间设为 true，抑制失焦自动隐藏
type SuppressBlur = Arc<AtomicBool>;
/// 窗口钉住状态：true 时失去焦点不自动隐藏
type PinnedWindow = Arc<AtomicBool>;

/// 前端调用：对话框弹出前设 true，关闭后设 false
#[tauri::command]
fn set_suppress_blur(state: tauri::State<SuppressBlur>, suppress: bool) {
    state.store(suppress, Ordering::SeqCst);
}

/// 前端调用：设置窗口是否钉住（钉住时不因失焦而隐藏）
#[tauri::command]
fn set_window_pinned(state: tauri::State<PinnedWindow>, pinned: bool) {
    state.store(pinned, Ordering::SeqCst);
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = std::process::Command::new("open");
        c.arg(url);
        c
    };

    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = std::process::Command::new("cmd");
        c.args(["/C", "start", "", &url]);
        c
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(url);
        c
    };

    cmd.spawn()
        .map_err(|e| format!("打开浏览器失败: {}", e))?;
    Ok(())
}

#[derive(Debug, Deserialize)]
struct DeviceCodeResp {
    device_code: String,
    user_code: String,
    verification_uri: String,
    expires_in: u64,
    interval: u64,
}

#[derive(Debug, Serialize)]
struct DeviceCodeOut {
    device_code: String,
    user_code: String,
    verification_uri: String,
    expires_in: u64,
    interval: u64,
}

#[derive(Debug, Deserialize)]
struct TokenResp {
    access_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Debug, Serialize)]
struct TokenPollOut {
    status: String,
    access_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GithubUserResp {
    login: String,
}

#[derive(Debug, Deserialize)]
struct RepoCreateResp {
    name: String,
    default_branch: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RepoListResp {
    name: String,
    description: Option<String>,
    default_branch: Option<String>,
}

#[derive(Debug, Serialize)]
struct RepoCreateOut {
    login: String,
    repo: String,
    branch: String,
}

fn unix_suffix() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    secs.to_string()
}

fn sanitize_repo_prefix(prefix: &str) -> String {
    let lowered = prefix.trim().to_lowercase();
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in lowered.chars() {
        let keep = ch.is_ascii_lowercase() || ch.is_ascii_digit();
        if keep {
            out.push(ch);
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "yunjian-notes".to_string()
    } else {
        trimmed
    }
}

fn canonical_repo_name(prefix: &str, login: &str) -> String {
    let p = sanitize_repo_prefix(prefix);
    let l = login.trim().to_lowercase();
    let mut name = format!("{}-{}", p, l);
    if name.len() > 96 {
        name.truncate(96);
        while name.ends_with('-') {
            name.pop();
        }
    }
    if name.is_empty() {
        format!("yunjian-notes-{}", unix_suffix())
    } else {
        name
    }
}

fn gh_client() -> reqwest::Client {
    reqwest::Client::builder()
        .build()
        .expect("failed to build reqwest client")
}

#[tauri::command]
async fn github_start_device_flow(client_id: String) -> Result<DeviceCodeOut, String> {
    let client = gh_client();
    let res = client
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&[("client_id", client_id.as_str()), ("scope", "repo read:user")])
        .send()
        .await
        .map_err(|e| format!("GitHub 设备授权请求失败: {e}"))?;

    if !res.status().is_success() {
        let text = res.text().await.unwrap_or_default();
        return Err(format!("GitHub 设备授权请求失败: {}", text));
    }

    let d = res
        .json::<DeviceCodeResp>()
        .await
        .map_err(|e| format!("解析 GitHub 设备授权响应失败: {e}"))?;

    Ok(DeviceCodeOut {
        device_code: d.device_code,
        user_code: d.user_code,
        verification_uri: d.verification_uri,
        expires_in: d.expires_in,
        interval: d.interval,
    })
}

#[tauri::command]
async fn github_poll_device_token(client_id: String, device_code: String) -> Result<TokenPollOut, String> {
    let client = gh_client();
    let res = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&[
            ("client_id", client_id.as_str()),
            ("device_code", device_code.as_str()),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await
        .map_err(|e| format!("轮询 GitHub Token 失败: {e}"))?;

    if !res.status().is_success() {
        let text = res.text().await.unwrap_or_default();
        return Err(format!("轮询 GitHub Token 失败: {}", text));
    }

    let t = res
        .json::<TokenResp>()
        .await
        .map_err(|e| format!("解析 GitHub Token 响应失败: {e}"))?;

    let status = if t.access_token.is_some() {
        "ok".to_string()
    } else if let Some(e) = &t.error {
        match e.as_str() {
            "authorization_pending" => "pending".to_string(),
            "slow_down" => "slow_down".to_string(),
            "access_denied" => "denied".to_string(),
            "expired_token" => "expired".to_string(),
            _ => "error".to_string(),
        }
    } else {
        "error".to_string()
    };

    Ok(TokenPollOut {
        status,
        access_token: t.access_token,
        error: t.error,
        error_description: t.error_description,
    })
}

#[tauri::command]
async fn github_create_repo_for_notes(access_token: String, repo_prefix: String) -> Result<RepoCreateOut, String> {
    let client = gh_client();

    let user_res = client
        .get("https://api.github.com/user")
        .header("Accept", "application/vnd.github+json")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header("User-Agent", "yunjian-desktop")
        .send()
        .await
        .map_err(|e| format!("获取 GitHub 用户信息失败: {e}"))?;

    if !user_res.status().is_success() {
        let text = user_res.text().await.unwrap_or_default();
        return Err(format!("获取 GitHub 用户信息失败: {}", text));
    }

    let user = user_res
        .json::<GithubUserResp>()
        .await
        .map_err(|e| format!("解析 GitHub 用户信息失败: {e}"))?;

    let canonical = canonical_repo_name(&repo_prefix, &user.login);

    // 1) 先尝试直接读取规范仓库名（多设备共享同一仓库）
    let get_repo_url = format!("https://api.github.com/repos/{}/{}", user.login, canonical);
    let repo_get_res = client
        .get(&get_repo_url)
        .header("Accept", "application/vnd.github+json")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header("User-Agent", "yunjian-desktop")
        .send()
        .await
        .map_err(|e| format!("检查 GitHub 仓库失败: {e}"))?;

    if repo_get_res.status().is_success() {
        let repo = repo_get_res
            .json::<RepoCreateResp>()
            .await
            .map_err(|e| format!("解析 GitHub 仓库响应失败: {e}"))?;
        return Ok(RepoCreateOut {
            login: user.login,
            repo: repo.name,
            branch: repo.default_branch.unwrap_or_else(|| "main".to_string()),
        });
    }

    // 2) 兼容旧版：如果存在历史前缀仓库，优先复用最近一个，避免数据分叉
    let list_res = client
        .get("https://api.github.com/user/repos?per_page=100&type=owner&sort=pushed&direction=desc")
        .header("Accept", "application/vnd.github+json")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header("User-Agent", "yunjian-desktop")
        .send()
        .await
        .map_err(|e| format!("查询 GitHub 仓库列表失败: {e}"))?;

    if list_res.status().is_success() {
        let repos = list_res
            .json::<Vec<RepoListResp>>()
            .await
            .map_err(|e| format!("解析 GitHub 仓库列表失败: {e}"))?;

        let prefix_norm = sanitize_repo_prefix(&repo_prefix);
        if let Some(found) = repos.into_iter().find(|r| {
            let desc_ok = r
                .description
                .as_deref()
                .map(|d| d.contains("Yunjian notes storage repository"))
                .unwrap_or(false);
            r.name == canonical || r.name.starts_with(&format!("{}-", prefix_norm)) && desc_ok
        }) {
            return Ok(RepoCreateOut {
                login: user.login,
                repo: found.name,
                branch: found.default_branch.unwrap_or_else(|| "main".to_string()),
            });
        }
    }

    // 3) 都没有时再创建规范仓库（只创建一次）
    let payload = serde_json::json!({
        "name": canonical,
        "private": true,
        "auto_init": true,
        "description": "Yunjian notes storage repository"
    });

    let repo_res = client
        .post("https://api.github.com/user/repos")
        .header("Accept", "application/vnd.github+json")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header("User-Agent", "yunjian-desktop")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("创建 GitHub 仓库失败: {e}"))?;

    if !repo_res.status().is_success() {
        let text = repo_res.text().await.unwrap_or_default();
        return Err(format!("创建 GitHub 仓库失败: {}", text));
    }

    let repo = repo_res
        .json::<RepoCreateResp>()
        .await
        .map_err(|e| format!("解析 GitHub 仓库响应失败: {e}"))?;

    Ok(RepoCreateOut {
        login: user.login,
        repo: repo.name,
        branch: repo.default_branch.unwrap_or_else(|| "main".to_string()),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // ── 初始化共享状态 ──
            let last_hide: LastHideTime = Arc::new(Mutex::new(None));
            app.manage(last_hide.clone());
            let suppress_blur: SuppressBlur = Arc::new(AtomicBool::new(false));
            app.manage(suppress_blur);
            let pinned_window: PinnedWindow = Arc::new(AtomicBool::new(false));
            app.manage(pinned_window);

            // ── 系统托盘右键菜单 ──
            let quit_item =
                MenuItem::with_id(app, "quit", "退出云笺", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit_item])?;

            // ── 创建托盘图标 ──
            let tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("云笺\n左键：显示/隐藏\nCtrl+Shift+Y：快速唤起")
                .menu(&menu)
                .show_menu_on_left_click(false) // 左键不弹菜单，留给自定义逻辑
                .build(app)?;

            // ── 托盘左键单击：显示/隐藏主窗口 ──
            let app_handle = app.handle().clone();
            tray.on_tray_icon_event(move |_tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    let window = app_handle.get_webview_window("main").unwrap();
                    let last_hide = app_handle.state::<LastHideTime>();

                    // 若窗口是在 300ms 内因失焦被隐藏的，说明用户刚才点击托盘「收起」
                    // 此时不应再次弹出，以实现点击托盘切换显示/隐藏的效果
                    let was_just_hidden = {
                        let lock = last_hide.lock().unwrap();
                    lock.map(|t| t.elapsed().as_millis() < 500)
                            .unwrap_or(false)
                    };

                    if was_just_hidden {
                        // 窗口刚刚因失焦收起，本次点击视为「主动收起」，不再弹出
                        return;
                    }

                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                        let _ = window.set_skip_taskbar(true);
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = window.set_skip_taskbar(false);
                    }
                }
            });

            // ── 右键菜单事件：退出 ──
            let app_handle2 = app.handle().clone();
            app.on_menu_event(move |_app, event| {
                if event.id().as_ref() == "quit" {
                    app_handle2.exit(0);
                }
            });

            // ── 全局快捷键 Ctrl+Shift+Y：在任意应用中召唤/隐藏云笺 ──
            let shortcut = Shortcut::new(
                Some(Modifiers::CONTROL | Modifiers::SHIFT),
                Code::KeyY,
            );
            let app_handle3 = app.handle().clone();
            app.global_shortcut().on_shortcut(
                shortcut,
                move |_app, _sc, event| {
                    if event.state() == ShortcutState::Pressed {
                        let window =
                            app_handle3.get_webview_window("main").unwrap();
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                            let _ = window.set_skip_taskbar(true);
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.set_skip_taskbar(false);
                        }
                    }
                },
            )?;

            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                // ── 失去焦点 → 延迟 150ms 后确认仍未聚焦再隐藏 ──
                // 直接隐藏会误伤：拖动标题栏、点击右键菜单等操作会短暂触发 Focused(false)
                // 150ms 内如果焦点回来了（如拖动完成），就不隐藏
                WindowEvent::Focused(false) => {
                    // 对话框弹出期间不隐藏（dialog 会抢走焦点）
                    let suppress = window.app_handle().state::<SuppressBlur>();
                    if suppress.load(Ordering::SeqCst) {
                        return;
                    }
                    // 钉住开启时不因失焦隐藏
                    let pinned = window.app_handle().state::<PinnedWindow>();
                    if pinned.load(Ordering::SeqCst) {
                        return;
                    }

                    let state = window.app_handle().state::<LastHideTime>();
                    *state.lock().unwrap() = Some(Instant::now());

                    let win = window.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(150));
                        // 150ms 后仍未重新获得焦点，才真正隐藏
                        if !win.is_focused().unwrap_or(true) {
                            let _ = win.hide();
                            let _ = win.set_skip_taskbar(true);
                        }
                    });
                }
                // ── 点击关闭按钮 → 隐藏到托盘而非退出 ──
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = window.hide();
                    let _ = window.set_skip_taskbar(true);
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            set_suppress_blur,
            set_window_pinned,
            open_external_url,
            github_start_device_flow,
            github_poll_device_token,
            github_create_repo_for_notes
        ])
        .run(tauri::generate_context!())
        .expect("运行云笺时发生错误");
}
