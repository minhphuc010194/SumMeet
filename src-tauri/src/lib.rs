pub mod audio;
mod credentials;
pub mod db;
mod mic;
mod mic_activity;
mod recordings;

use tauri::Manager;

use audio::audio_engine::{
    compute_dual_stream_routing, list_system_audio_devices, AudioDeviceInfo,
    DualStreamRoutingSnapshot,
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
    }))
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(mic::MicRecorder::default())
        .setup(|app| {
            let recordings_dir = app.path().app_data_dir()?.join("recordings");
            std::fs::create_dir_all(&recordings_dir)?;
            app.manage(recordings::RecordingsDir(recordings_dir));
            mic_activity::spawn_watcher(app.handle().clone());
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running SumMeet");
}
