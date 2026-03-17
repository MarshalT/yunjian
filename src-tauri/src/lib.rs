// Tauri 2.x 应用库入口
// 注册插件、自定义命令

/// 应用入口（移动端也通过此处启动）
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 打开外部链接插件
        .plugin(tauri_plugin_opener::init())
        // 文件系统插件（导出 .md 文件）
        .plugin(tauri_plugin_fs::init())
        // 系统对话框插件（另存为对话框）
        .plugin(tauri_plugin_dialog::init())
        // 注册自定义命令（如有需要可在此扩展）
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用时发生错误");
}
