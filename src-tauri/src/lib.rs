pub mod audio;
mod credentials;
pub mod db;
mod mic;
mod mic_activity;
mod recordings;

use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_notification::NotificationExt;

use audio::audio_engine::{
    compute_dual_stream_routing, list_system_audio_devices, system_audio_supported,
    AudioDeviceInfo, DualStreamRoutingSnapshot,
};

/// Returns all system audio devices and automatically classifies AirPods / Headphones.
pub fn get_audio_devices_inventory() -> Vec<AudioDeviceInfo> {
    list_system_audio_devices()
}

/// Computes the optimal dual-stream routing state for the current active input/output devices.
pub fn get_current_dual_stream_routing() -> DualStreamRoutingSnapshot {
    let devices = list_system_audio_devices();

    let default_in = devices
        .iter()
        .find(|d| d.is_input && d.is_default)
        .or_else(|| devices.iter().find(|d| d.is_input));

    let default_out = devices
        .iter()
        .find(|d| d.is_output && d.is_default)
        .or_else(|| devices.iter().find(|d| d.is_output));

    let in_name = default_in
        .map(|d| d.name.as_str())
        .unwrap_or("Default Microphone");
    let out_name = default_out
        .map(|d| d.name.as_str())
        .unwrap_or("Default System Output");
    let in_rate = default_in.map(|d| d.sample_rate).unwrap_or(48_000);
    let out_rate = default_out.map(|d| d.sample_rate).unwrap_or(48_000);

    compute_dual_stream_routing(in_name, out_name, in_rate, out_rate)
}

#[tauri::command(async)]
fn list_audio_devices() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "devices": get_audio_devices_inventory(),
        "routing": get_current_dual_stream_routing(),
        "system_audio_supported": system_audio_supported(),
    }))
}

fn show_main_window(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if let Err(error) = window.show() {
        eprintln!("[Window] Show failed: {error}");
    }
    if let Err(error) = window.unminimize() {
        eprintln!("[Window] Unminimize failed: {error}");
    }
    if let Err(error) = window.set_focus() {
        eprintln!("[Window] Focus failed: {error}");
    }
}

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .manage(mic::MicRecorder::default())
        .setup(|app| {
            let recordings_dir = app.path().app_data_dir()?.join("recordings");
            std::fs::create_dir_all(&recordings_dir)?;
            app.manage(recordings::RecordingsDir(recordings_dir));
            mic_activity::spawn_watcher(app.handle().clone());

            let click_opens_window = !cfg!(target_os = "macos");
            let mut tray = TrayIconBuilder::with_id("main")
                .tooltip(&app.package_info().name)
                .show_menu_on_left_click(!click_opens_window)
                .on_tray_icon_event(move |tray, event| {
                    if !click_opens_window {
                        return;
                    }
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            if let Err(error) = tray.build(app) {
                eprintln!("[Tray] Build failed: {error}");
            }

            let handle = app.handle().clone();
            app.notification()
                .on_action(move |_| show_main_window(&handle))?;

            if !std::env::args().any(|arg| arg == "--autostart") {
                show_main_window(app.handle());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            credentials::get_openrouter_key,
            credentials::set_openrouter_key,
            credentials::delete_openrouter_key,
            list_audio_devices,
            mic::start_mic_recording,
            mic::get_recording_status,
            mic::stop_mic_recording,
            recordings::read_recording_slice,
            recordings::list_recordings,
            recordings::delete_recording,
            recordings::delete_all_recordings,
        ]);

    let builder = builder
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if let Err(error) = window.hide() {
                    eprintln!("[Window] Hide failed: {error}");
                }
            }
        })
        .on_menu_event(|app, event| {
            if event.id() == "check-for-updates" || event.id() == "show-main-window" {
                show_main_window(app);
            } else if event.id() == "quit" {
                app.exit(0);
            }
        });

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building SumMeet");

    #[cfg(target_os = "macos")]
    app.run(|app_handle, event| {
        if let tauri::RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } = event
        {
            show_main_window(app_handle);
        }
    });
    #[cfg(not(target_os = "macos"))]
    app.run(|_, _| {});
}
