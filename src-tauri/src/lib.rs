use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;
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

/// 前端调用：对话框弹出前设 true，关闭后设 false
#[tauri::command]
fn set_suppress_blur(state: tauri::State<SuppressBlur>, suppress: bool) {
    state.store(suppress, Ordering::SeqCst);
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
        .invoke_handler(tauri::generate_handler![set_suppress_blur])
        .run(tauri::generate_context!())
        .expect("运行云笺时发生错误");
}
