mod pet_package;

use pet_package::{ExportRequest, ExportResult, ImportedPet, SourceExportResult};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, State, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

const PET_BASE_WIDTH: f64 = 260.0;
const PET_BASE_HEIGHT: f64 = 270.0;
const PET_MIN_SCALE: f64 = 0.70;
const PET_MAX_SCALE: f64 = 1.40;

#[derive(Default)]
struct RuntimeState {
    active_package: Mutex<Option<PathBuf>>,
    tray_ready: AtomicBool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeDiagnostics {
    tray_ready: bool,
    transparent: bool,
    decorations: bool,
    skip_taskbar: bool,
    always_on_top: bool,
}

#[tauri::command]
fn import_local_pet(app: AppHandle, path: String) -> Result<ImportedPet, String> {
    pet_package::import_local(&app, &path)
}

#[tauri::command]
async fn import_petdex_pet(app: AppHandle, slug_or_url: String) -> Result<ImportedPet, String> {
    pet_package::import_petdex(&app, &slug_or_url).await
}

#[tauri::command]
fn export_standalone_pet(app: AppHandle, request: ExportRequest) -> Result<ExportResult, String> {
    pet_package::export_pet(&app, request)
}

#[tauri::command]
fn export_cross_platform_kit(request: ExportRequest) -> Result<SourceExportResult, String> {
    pet_package::export_source_kit(request)
}

#[tauri::command]
fn get_runtime_pet(state: State<RuntimeState>) -> Result<ImportedPet, String> {
    let package = state
        .active_package
        .lock()
        .map_err(|_| "无法读取桌宠运行状态。".to_string())?
        .clone()
        .ok_or("没有可运行的宠物包。")?;
    pet_package::load_package(&package, "runtime")
}

#[tauri::command]
fn launch_pet_preview(
    app: AppHandle,
    state: State<RuntimeState>,
    package_dir: String,
) -> Result<(), String> {
    let package = PathBuf::from(package_dir);
    let pet = pet_package::load_package(&package, "preview")?;
    if !pet.valid {
        return Err(format!("宠物校验未通过：{}", pet.errors.join("；")));
    }
    *state
        .active_package
        .lock()
        .map_err(|_| "无法更新桌宠运行状态。".to_string())? = Some(package);
    if let Some(existing) = app.get_webview_window("pet-preview") {
        let _ = existing.close();
    }
    create_pet_window(&app, "pet-preview", &pet.display_name)
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn runtime_diagnostics(state: State<RuntimeState>) -> RuntimeDiagnostics {
    RuntimeDiagnostics {
        tray_ready: state.tray_ready.load(Ordering::SeqCst),
        transparent: true,
        decorations: false,
        skip_taskbar: true,
        always_on_top: true,
    }
}

#[tauri::command]
fn resize_pet_window(window: WebviewWindow, scale: f64) -> Result<f64, String> {
    let scale = scale.clamp(PET_MIN_SCALE, PET_MAX_SCALE);
    window
        .set_size(LogicalSize::new(
            PET_BASE_WIDTH * scale,
            PET_BASE_HEIGHT * scale,
        ))
        .map_err(|error| format!("无法调整桌宠大小：{error}"))?;
    keep_pet_window_visible(&window, scale)?;
    Ok(scale)
}

fn create_studio_window(app: &AppHandle) -> Result<(), String> {
    let window = WebviewWindowBuilder::new(app, "studio", WebviewUrl::App("index.html".into()))
        .title("PetPack Studio · Codex 桌宠打包器")
        .inner_size(1120.0, 780.0)
        .min_inner_size(960.0, 680.0)
        .resizable(true)
        .minimizable(true)
        .closable(true)
        .decorations(true)
        .skip_taskbar(false)
        .center()
        .build()
        .map_err(|error| format!("无法创建工作室窗口：{error}"))?;
    window
        .set_skip_taskbar(false)
        .map_err(|error| format!("无法启用工作室任务栏入口：{error}"))?;
    let app_handle = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::CloseRequested { .. }) {
            app_handle.exit(0);
        }
    });
    Ok(())
}

fn create_pet_window(app: &AppHandle, label: &str, title: &str) -> Result<(), String> {
    let window = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title(title)
        .inner_size(PET_BASE_WIDTH, PET_BASE_HEIGHT)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .build()
        .map_err(|error| format!("无法创建桌宠窗口：{error}"))?;

    // Re-apply the runtime contract after the native window exists. On Windows,
    // applying these flags only through the builder can be lost while WebView2
    // finishes creating the top-level window.
    window
        .set_decorations(false)
        .map_err(|error| format!("无法移除桌宠窗口边框：{error}"))?;
    window
        .set_shadow(false)
        .map_err(|error| format!("无法移除桌宠窗口阴影：{error}"))?;
    window
        .set_skip_taskbar(true)
        .map_err(|error| format!("无法隐藏桌宠任务栏入口：{error}"))?;
    window
        .set_always_on_top(true)
        .map_err(|error| format!("无法置顶桌宠窗口：{error}"))?;
    enforce_native_pet_window_contract(&window)?;
    place_pet_window(&window, 1.0)?;
    Ok(())
}

fn monitor_bounds_for_pet(
    origin: LogicalPosition<f64>,
    size: LogicalSize<f64>,
    window_scale: f64,
) -> LogicalPosition<f64> {
    let width = PET_BASE_WIDTH * window_scale;
    let height = PET_BASE_HEIGHT * window_scale;
    LogicalPosition::new(
        origin.x + (size.width - width - 24.0).max(8.0),
        origin.y + (size.height - height - 72.0).max(8.0),
    )
}

fn place_pet_window(window: &WebviewWindow, window_scale: f64) -> Result<(), String> {
    let Some(monitor) = window
        .current_monitor()
        .map_err(|error| format!("无法读取显示器信息：{error}"))?
    else {
        return Ok(());
    };
    let dpi = window
        .scale_factor()
        .map_err(|error| format!("无法读取显示缩放：{error}"))?;
    let origin = monitor.position().to_logical::<f64>(dpi);
    let size = monitor.size().to_logical::<f64>(dpi);
    window
        .set_position(monitor_bounds_for_pet(origin, size, window_scale))
        .map_err(|error| format!("无法放置桌宠窗口：{error}"))
}

fn keep_pet_window_visible(window: &WebviewWindow, window_scale: f64) -> Result<(), String> {
    let Some(monitor) = window
        .current_monitor()
        .map_err(|error| format!("无法读取显示器信息：{error}"))?
    else {
        return Ok(());
    };
    let dpi = window
        .scale_factor()
        .map_err(|error| format!("无法读取显示缩放：{error}"))?;
    let origin = monitor.position().to_logical::<f64>(dpi);
    let size = monitor.size().to_logical::<f64>(dpi);
    let current = window
        .outer_position()
        .map_err(|error| format!("无法读取桌宠位置：{error}"))?
        .to_logical::<f64>(dpi);
    let width = PET_BASE_WIDTH * window_scale;
    let height = PET_BASE_HEIGHT * window_scale;
    let max_x = origin.x + (size.width - width - 8.0).max(8.0);
    let max_y = origin.y + (size.height - height - 64.0).max(8.0);
    let x = current.x.clamp(origin.x + 8.0, max_x);
    let y = current.y.clamp(origin.y + 8.0, max_y);
    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|error| format!("无法保持桌宠在屏幕内：{error}"))
}

#[cfg(target_os = "windows")]
fn enforce_native_pet_window_contract(window: &tauri::WebviewWindow) -> Result<(), String> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, GWL_STYLE, HWND_TOPMOST,
        SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, WS_EX_APPWINDOW,
        WS_EX_TOOLWINDOW,
    };

    let hwnd = window
        .hwnd()
        .map_err(|error| format!("无法读取桌宠窗口句柄：{error}"))?
        .0;
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
        // Caption, border, dialog frame, system menu, resize frame and min/max buttons.
        SetWindowLongPtrW(hwnd, GWL_STYLE, style & !(0x00CF_0000isize));

        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        SetWindowLongPtrW(
            hwnd,
            GWL_EXSTYLE,
            (ex_style & !(WS_EX_APPWINDOW as isize)) | WS_EX_TOOLWINDOW as isize,
        );

        if SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        ) == 0
        {
            return Err(format!(
                "无法应用桌宠原生窗口样式：{}",
                std::io::Error::last_os_error()
            ));
        }
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn enforce_native_pet_window_contract(_window: &tauri::WebviewWindow) -> Result<(), String> {
    Ok(())
}

fn emit_pet_action(app: &AppHandle, action: &str) {
    if let Some(window) = app.get_webview_window("pet") {
        let _ = window.emit("pet-action", action);
    }
}

fn show_pet_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("pet") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn create_runtime_tray(app: &AppHandle, title: &str) -> Result<(), String> {
    let show = MenuItem::with_id(app, "show", "显示桌宠", true, None::<&str>)
        .map_err(|error| format!("无法创建托盘菜单：{error}"))?;
    let hide = MenuItem::with_id(app, "hide", "隐藏桌宠", true, None::<&str>)
        .map_err(|error| format!("无法创建托盘菜单：{error}"))?;
    let idle = MenuItem::with_id(app, "idle", "待机", true, None::<&str>)
        .map_err(|error| format!("无法创建托盘菜单：{error}"))?;
    let wave = MenuItem::with_id(app, "wave", "挥手", true, None::<&str>)
        .map_err(|error| format!("无法创建托盘菜单：{error}"))?;
    let jump = MenuItem::with_id(app, "jump", "跳跃", true, None::<&str>)
        .map_err(|error| format!("无法创建托盘菜单：{error}"))?;
    let work = MenuItem::with_id(app, "work", "工作", true, None::<&str>)
        .map_err(|error| format!("无法创建托盘菜单：{error}"))?;
    let size_small = MenuItem::with_id(app, "size-small", "小尺寸", true, None::<&str>)
        .map_err(|error| format!("无法创建托盘菜单：{error}"))?;
    let size_normal = MenuItem::with_id(app, "size-normal", "标准尺寸", true, None::<&str>)
        .map_err(|error| format!("无法创建托盘菜单：{error}"))?;
    let size_large = MenuItem::with_id(app, "size-large", "大尺寸", true, None::<&str>)
        .map_err(|error| format!("无法创建托盘菜单：{error}"))?;
    let pin = CheckMenuItem::with_id(app, "pin", "始终置顶", true, true, None::<&str>)
        .map_err(|error| format!("无法创建托盘菜单：{error}"))?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)
        .map_err(|error| format!("无法创建托盘菜单：{error}"))?;
    let separator_a =
        PredefinedMenuItem::separator(app).map_err(|error| format!("无法创建托盘菜单：{error}"))?;
    let separator_b =
        PredefinedMenuItem::separator(app).map_err(|error| format!("无法创建托盘菜单：{error}"))?;
    let separator_c =
        PredefinedMenuItem::separator(app).map_err(|error| format!("无法创建托盘菜单：{error}"))?;
    let menu = Menu::with_items(
        app,
        &[
            &show,
            &hide,
            &separator_a,
            &idle,
            &wave,
            &jump,
            &work,
            &separator_b,
            &size_small,
            &size_normal,
            &size_large,
            &separator_c,
            &pin,
            &quit,
        ],
    )
    .map_err(|error| format!("无法创建托盘菜单：{error}"))?;
    let pin_for_handler = pin.clone();
    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or("应用图标不可用，无法创建托盘。")?;

    TrayIconBuilder::with_id("petpack-runtime")
        .icon(icon)
        .tooltip(format!("{title} · PetPack"))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "show" => show_pet_window(app),
            "hide" => {
                if let Some(window) = app.get_webview_window("pet") {
                    let _ = window.hide();
                }
            }
            "idle" => emit_pet_action(app, "idle"),
            "wave" => emit_pet_action(app, "waving"),
            "jump" => emit_pet_action(app, "jumping"),
            "work" => emit_pet_action(app, "running"),
            "size-small" => emit_pet_scale(app, 0.78),
            "size-normal" => emit_pet_scale(app, 1.0),
            "size-large" => emit_pet_scale(app, 1.25),
            "pin" => {
                let pinned = pin_for_handler.is_checked().unwrap_or(true);
                if let Some(window) = app.get_webview_window("pet") {
                    let _ = window.set_always_on_top(pinned);
                    let _ = window.emit("pet-pin-changed", pinned);
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_pet_window(tray.app_handle());
            }
        })
        .build(app)
        .map_err(|error| format!("无法创建托盘图标：{error}"))?;
    Ok(())
}

fn emit_pet_scale(app: &AppHandle, scale: f64) {
    if let Some(window) = app.get_webview_window("pet") {
        let _ = window.emit("pet-scale", scale);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(RuntimeState::default())
        .setup(|app| {
            if let Some(bundle) = pet_package::find_runtime_bundle(&app.handle()) {
                let pet = pet_package::load_package(&bundle, "runtime")
                    .map_err(Box::<dyn std::error::Error>::from)?;
                *app.state::<RuntimeState>()
                    .active_package
                    .lock()
                    .map_err(|_| "无法设置桌宠运行状态")? = Some(bundle);
                create_pet_window(&app.handle(), "pet", &pet.display_name)
                    .map_err(Box::<dyn std::error::Error>::from)?;
                create_runtime_tray(&app.handle(), &pet.display_name)
                    .map_err(Box::<dyn std::error::Error>::from)?;
                app.state::<RuntimeState>()
                    .tray_ready
                    .store(true, Ordering::SeqCst);
            } else {
                create_studio_window(&app.handle()).map_err(Box::<dyn std::error::Error>::from)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            import_local_pet,
            import_petdex_pet,
            export_standalone_pet,
            export_cross_platform_kit,
            get_runtime_pet,
            launch_pet_preview,
            runtime_diagnostics,
            resize_pet_window,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running PetPack Studio");
}

pub use pet_package::export_with_runtime;

pub fn pet_package_for_example(path: &std::path::Path) -> (String, String, String) {
    let pet = pet_package::load_package(path, "example").expect("valid pet package");
    (pet.id, pet.display_name, pet.description)
}

pub fn run_cli_if_requested() -> Option<i32> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if args.first().map(String::as_str) != Some("build-pet") {
        return None;
    }
    let value_after = |flag: &str| {
        args.iter()
            .position(|value| value == flag)
            .and_then(|index| args.get(index + 1))
            .cloned()
    };
    let Some(source) = value_after("--source") else {
        eprintln!("缺少 --source <petpack.bundle>");
        return Some(2);
    };
    let Some(output) = value_after("--output") else {
        eprintln!("缺少 --output <目录>");
        return Some(2);
    };
    let source = std::path::PathBuf::from(source);
    let output = std::path::PathBuf::from(output);
    let runtime = match std::env::current_exe() {
        Ok(path) => path,
        Err(error) => {
            eprintln!("无法定位构建器：{error}");
            return Some(1);
        }
    };
    let pet = match pet_package::load_package(&source, "relay-builder") {
        Ok(pet) if pet.valid => pet,
        Ok(pet) => {
            eprintln!("宠物校验未通过：{}", pet.errors.join("；"));
            return Some(1);
        }
        Err(error) => {
            eprintln!("无法读取宠物：{error}");
            return Some(1);
        }
    };
    match pet_package::export_with_runtime(
        &source,
        &output,
        &runtime,
        &pet.id,
        &pet.display_name,
        &pet.description,
    ) {
        Ok(result) => {
            println!("folder={}", result.folder_path);
            println!("zip={}", result.zip_path);
            Some(0)
        }
        Err(error) => {
            eprintln!("构建失败：{error}");
            Some(1)
        }
    }
}

#[cfg(test)]
mod window_contract_tests {
    use super::*;

    #[test]
    fn places_a_standard_pet_inside_logical_monitor_bounds() {
        let position = monitor_bounds_for_pet(
            LogicalPosition::new(0.0, 0.0),
            LogicalSize::new(1536.0, 864.0),
            1.0,
        );
        assert_eq!(position, LogicalPosition::new(1252.0, 522.0));
    }

    #[test]
    fn accounts_for_scaled_pet_size_and_nonzero_monitor_origin() {
        let position = monitor_bounds_for_pet(
            LogicalPosition::new(1920.0, -120.0),
            LogicalSize::new(1280.0, 900.0),
            1.4,
        );
        assert_eq!(position, LogicalPosition::new(2812.0, 330.0));
    }
}
