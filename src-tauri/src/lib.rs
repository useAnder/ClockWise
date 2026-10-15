use std::{
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};

use serde_json::{json, Map, Value};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, State, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

const CLOCK: &str = "clock";
const SETTINGS: &str = "settings";

/// Settings are a free-form JSON object: the frontend owns the schema and its
/// defaults. The backend only cares about `autostart` and `position`.
struct Store {
    path: PathBuf,
    data: Mutex<Value>,
    /// Bumped on every window move so only the last move of a drag is persisted.
    move_gen: AtomicU64,
}

impl Store {
    fn load(path: PathBuf) -> Self {
        let data = fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
            .filter(Value::is_object)
            .unwrap_or_else(|| json!({}));
        Self { path, data: Mutex::new(data), move_gen: AtomicU64::new(0) }
    }

    fn snapshot(&self) -> Value {
        self.data.lock().unwrap().clone()
    }

    fn persist(&self) {
        let text = serde_json::to_string_pretty(&self.snapshot()).unwrap_or_default();
        if let Some(dir) = self.path.parent() {
            let _ = fs::create_dir_all(dir);
        }
        // Write-then-rename so a crash mid-write never leaves a truncated file.
        let tmp = self.path.with_extension("json.tmp");
        if fs::write(&tmp, text).is_ok() {
            let _ = fs::rename(&tmp, &self.path);
        }
    }
}

#[tauri::command]
fn get_settings(store: State<'_, Arc<Store>>) -> Value {
    store.snapshot()
}

/// Shallow-merges `patch` into the stored settings (a `null` value removes the
/// key, falling back to the frontend default) and broadcasts the result.
#[tauri::command]
fn update_settings(app: AppHandle, store: State<'_, Arc<Store>>, patch: Map<String, Value>) -> Value {
    let snapshot = {
        let mut data = store.data.lock().unwrap();
        let obj = data.as_object_mut().expect("settings is an object");
        for (key, value) in &patch {
            if value.is_null() {
                obj.remove(key);
            } else {
                obj.insert(key.clone(), value.clone());
            }
        }
        data.clone()
    };
    store.persist();
    if patch.contains_key("autostart") {
        apply_autostart(&app, autostart_enabled(&snapshot));
    }
    let _ = app.emit("settings-changed", &snapshot);
    snapshot
}

// Async so the window is built off the main thread; building windows from a
// sync command deadlocks on Windows.
#[tauri::command]
async fn open_settings(app: AppHandle) {
    show_settings(&app);
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

fn show_settings(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(SETTINGS) {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }
    // Created on demand and destroyed on close, so its webview costs nothing while idle.
    let built = WebviewWindowBuilder::new(app, SETTINGS, WebviewUrl::App("settings.html".into()))
        .title("ClockWise — Configurações")
        .inner_size(460.0, 720.0)
        .min_inner_size(400.0, 480.0)
        .center()
        .build();
    if let Err(e) = built {
        eprintln!("failed to open settings: {e}");
    }
}

fn autostart_enabled(settings: &Value) -> bool {
    settings.get("autostart").and_then(Value::as_bool).unwrap_or(true)
}

fn apply_autostart(app: &AppHandle, enable: bool) {
    let launcher = app.autolaunch();
    if launcher.is_enabled().unwrap_or(!enable) == enable {
        return;
    }
    let result = if enable { launcher.enable() } else { launcher.disable() };
    if let Err(e) = result {
        eprintln!("failed to update autostart: {e}");
    }
}

/// Puts the clock where it was last left, as long as that point is still on a
/// connected monitor; otherwise near the top of the primary monitor.
fn restore_position(win: &WebviewWindow, store: &Store) {
    let saved = store.snapshot().get("position").and_then(|p| {
        Some((p.get("x")?.as_i64()? as i32, p.get("y")?.as_i64()? as i32))
    });
    if let Some((x, y)) = saved {
        let on_screen = win.available_monitors().unwrap_or_default().iter().any(|m| {
            let (pos, size) = (m.position(), m.size());
            x >= pos.x
                && x < pos.x + size.width as i32
                && y >= pos.y
                && y < pos.y + size.height as i32
        });
        if on_screen {
            let _ = win.set_position(PhysicalPosition::new(x, y));
            return;
        }
    }
    if let Ok(Some(m)) = win.primary_monitor() {
        let (pos, size) = (m.position(), m.size());
        let x = pos.x + size.width as i32 / 2 - (210.0 * m.scale_factor()) as i32;
        let y = pos.y + (size.height as f64 * 0.12) as i32;
        let _ = win.set_position(PhysicalPosition::new(x, y));
    }
}

/// Makes the desktop window (Progman) the clock's owner. "Show desktop"
/// (Win+D) leaves windows owned by the desktop alone, and an owned window
/// always sits right above its owner, i.e. under every regular app.
#[cfg(windows)]
fn pin_to_desktop(win: &WebviewWindow) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{FindWindowW, SetWindowLongPtrW, GWLP_HWNDPARENT};

    let Ok(hwnd) = win.hwnd() else { return };
    let class: Vec<u16> = "Progman\0".encode_utf16().collect();
    unsafe {
        let progman = FindWindowW(class.as_ptr(), std::ptr::null());
        if !progman.is_null() {
            SetWindowLongPtrW(hwnd.0 as _, GWLP_HWNDPARENT, progman as isize);
        }
    }
}

fn setup_clock(app: &AppHandle, store: Arc<Store>) {
    let Some(clock) = app.get_webview_window(CLOCK) else { return };
    #[cfg(windows)]
    pin_to_desktop(&clock);
    restore_position(&clock, &store);

    clock.on_window_event(move |event| match event {
        // No title bar, but Alt+F4 would still close it; quitting goes through the tray.
        WindowEvent::CloseRequested { api, .. } => api.prevent_close(),
        WindowEvent::Moved(pos) => {
            store.data.lock().unwrap().as_object_mut().unwrap()
                .insert("position".into(), json!({ "x": pos.x, "y": pos.y }));
            let gen = store.move_gen.fetch_add(1, Ordering::SeqCst) + 1;
            let store = store.clone();
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(600));
                if store.move_gen.load(Ordering::SeqCst) == gen {
                    store.persist();
                }
            });
        }
        _ => {}
    });
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Configurações", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("ClockWise")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_settings(app),
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
                show_settings(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        // Must be the first plugin: a second launch just opens the settings panel.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_settings(app)))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .invoke_handler(tauri::generate_handler![get_settings, update_settings, open_settings, quit])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let path = app.path().app_config_dir()?.join("settings.json");
            let store = Arc::new(Store::load(path));
            app.manage(store.clone());

            // Dev builds never register themselves; only the explicit toggle does.
            #[cfg(not(debug_assertions))]
            apply_autostart(app.handle(), autostart_enabled(&store.snapshot()));

            setup_clock(app.handle(), store);
            setup_tray(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ClockWise");
}
