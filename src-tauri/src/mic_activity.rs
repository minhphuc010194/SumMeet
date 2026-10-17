use serde::Serialize;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const POLL_INTERVAL: Duration = Duration::from_secs(3);
const IGNORED_BUNDLE_IDS: &[&str] = &["com.apple.CoreSpeech"];

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct MicActivity {
    other_app_active: bool,
    active_app: Option<String>,
}

#[cfg(target_os = "macos")]
fn read_property<T: Copy + Default>(object: u32, selector: u32) -> Result<Vec<T>, i32> {
    use objc2_core_audio::{
        kAudioObjectPropertyElementMain, kAudioObjectPropertyScopeGlobal,
        AudioObjectGetPropertyData, AudioObjectGetPropertyDataSize, AudioObjectPropertyAddress,
    };
    use std::mem::size_of;
    use std::ptr::{null, NonNull};

    let address = AudioObjectPropertyAddress {
        mSelector: selector,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain,
    };
    let mut size = 0u32;
    let status = unsafe {
        AudioObjectGetPropertyDataSize(
            object,
            NonNull::from(&address),
            0,
            null(),
            NonNull::from(&mut size),
        )
    };
    if status != 0 {
        return Err(status);
    }

    let mut values = vec![T::default(); size as usize / size_of::<T>()];
    let mut size = (values.len() * size_of::<T>()) as u32;
    let status = unsafe {
        AudioObjectGetPropertyData(
            object,
            NonNull::from(&address),
            0,
            null(),
            NonNull::from(&mut size),
            NonNull::from(values.as_mut_slice()).cast(),
        )
    };
    if status != 0 {
        return Err(status);
    }
    values.truncate(size as usize / size_of::<T>());
    Ok(values)
}

#[cfg(target_os = "macos")]
fn input_processes() -> Result<Vec<(i32, u32, String)>, i32> {
    use objc2_core_audio::{
        kAudioHardwarePropertyProcessObjectList, kAudioObjectSystemObject,
        kAudioProcessPropertyBundleID, kAudioProcessPropertyIsRunningInput,
        kAudioProcessPropertyPID,
    };
    use objc2_core_foundation::{CFRetained, CFString};
    use std::ptr::NonNull;

    let objects = read_property::<u32>(
        kAudioObjectSystemObject as u32,
        kAudioHardwarePropertyProcessObjectList,
    )?;
    Ok(objects
        .into_iter()
        .filter_map(|object| {
            let pid = *read_property::<i32>(object, kAudioProcessPropertyPID)
                .ok()?
                .first()?;
            let running_input = *read_property::<u32>(object, kAudioProcessPropertyIsRunningInput)
                .ok()?
                .first()?;
            let bundle_id =
                read_property::<Option<NonNull<CFString>>>(object, kAudioProcessPropertyBundleID)
                    .ok()
                    .and_then(|ids| ids.first().copied().flatten())
                    .map(|id| unsafe { CFRetained::from_raw(id) }.to_string())
                    .unwrap_or_default();
            Some((pid, running_input, bundle_id))
        })
        .collect())
}

#[cfg(windows)]
fn input_processes() -> Result<Vec<(i32, u32, String)>, i32> {
    use windows::core::{Interface, HRESULT};
    use windows::Win32::Media::Audio::{
        eCapture, AudioSessionStateActive, IAudioSessionControl2, IAudioSessionManager2,
        IMMDeviceEnumerator, MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
    };

    thread_local! {
        static COM_INIT: HRESULT = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    }

    (|| -> windows::core::Result<Vec<(i32, u32, String)>> {
        COM_INIT.with(|result| result.ok())?;
        let mut processes = Vec::new();
        unsafe {
            let enumerator =
                CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let devices = enumerator.EnumAudioEndpoints(eCapture, DEVICE_STATE_ACTIVE)?;
            for device in 0..devices.GetCount()? {
                let Ok(sessions) = devices
                    .Item(device)
                    .and_then(|device| device.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None))
                    .and_then(|manager| manager.GetSessionEnumerator())
                else {
                    continue;
                };
                processes.extend((0..sessions.GetCount().unwrap_or_default()).filter_map(
                    |index| {
                        let session = sessions.GetSession(index).ok()?;
                        let running_input = session.GetState().ok()? == AudioSessionStateActive;
                        let pid = session
                            .cast::<IAudioSessionControl2>()
                            .ok()?
                            .GetProcessId()
                            .ok()?;
                        Some((pid as i32, running_input as u32, String::new()))
                    },
                ));
            }
        }
        Ok(processes)
    })()
    .map_err(|error| error.code().0)
}

#[cfg(not(any(target_os = "macos", windows)))]
fn input_processes() -> Result<Vec<(i32, u32, String)>, i32> {
    Ok(Vec::new())
}

fn detect_mic_activity(processes: &[(i32, u32, String)], own_pid: i32) -> MicActivity {
    let mut other_app_active = false;
    for (pid, running_input, bundle_id) in processes {
        let is_running_input = *running_input != 0;
        let is_own_process = *pid == own_pid;
        let is_ignored = IGNORED_BUNDLE_IDS.contains(&bundle_id.as_str());
        let is_other_active_app = is_running_input && !is_own_process && !is_ignored;
        if !is_other_active_app {
            continue;
        }
        other_app_active = true;
        let active_app = match bundle_id.as_str() {
            "us.zoom.xos" => Some("Zoom".to_string()),
            "com.apple.FaceTime" => Some("FaceTime".to_string()),
            "com.google.Chrome" => Some("Google Chrome".to_string()),
            "com.microsoft.teams" | "com.microsoft.teams2" => Some("Microsoft Teams".to_string()),
            "com.tinyspeck.slackmacgap" => Some("Slack".to_string()),
            "com.hnc.Discord" => Some("Discord".to_string()),
            "com.vng.zalo" => Some("Zalo".to_string()),
            "com.apple.Safari" => Some("Safari".to_string()),
            "org.mozilla.firefox" => Some("Firefox".to_string()),
            "com.microsoft.edgemac" => Some("Microsoft Edge".to_string()),
            "company.thebrowser.Browser" => Some("Arc".to_string()),
            "com.brave.Browser" => Some("Brave".to_string()),
            "ru.keepcoder.Telegram" | "org.telegram.desktop" => Some("Telegram".to_string()),
            "net.whatsapp.WhatsApp" => Some("WhatsApp".to_string()),
            "com.cisco.webexmeetingsapp" => Some("Webex".to_string()),
            other => other
                .rsplit('.')
                .next()
                .filter(|name| !name.is_empty())
                .map(str::to_string),
        };
        if active_app.is_some() {
            return MicActivity {
                other_app_active: true,
                active_app,
            };
        }
    }
    MicActivity {
        other_app_active,
        active_app: None,
    }
}

pub fn spawn_watcher(app: AppHandle) {
    thread::spawn(move || {
        let own_pid = std::process::id() as i32;
        let mut last_error = None;
        loop {
            let activity = match input_processes() {
                Ok(processes) => {
                    last_error = None;
                    detect_mic_activity(&processes, own_pid)
                }
                Err(status) => {
                    if last_error != Some(status) {
                        eprintln!("[MicActivity] Audio input query failed: status {status}");
                        last_error = Some(status);
                    }
                    MicActivity {
                        other_app_active: false,
                        active_app: None,
                    }
                }
            };
            let _ = app.emit("mic-activity", activity);
            thread::sleep(POLL_INTERVAL);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    const OWN_PID: i32 = 100;
    const OTHER_PID: i32 = 200;
    const CORE_SPEECH_PID: i32 = 300;

    fn process(pid: i32, running_input: u32, bundle_id: &str) -> (i32, u32, String) {
        (pid, running_input, bundle_id.to_string())
    }

    #[test]
    fn ignores_own_process_running_input() {
        assert_eq!(
            detect_mic_activity(&[process(OWN_PID, 1, "")], OWN_PID),
            MicActivity {
                other_app_active: false,
                active_app: None,
            }
        );
    }

    #[test]
    fn detects_other_process_running_input_without_bundle_id() {
        assert_eq!(
            detect_mic_activity(&[process(OTHER_PID, 1, "")], OWN_PID),
            MicActivity {
                other_app_active: true,
                active_app: None,
            }
        );
    }

    #[test]
    fn detects_other_process_alongside_own_recording() {
        assert_eq!(
            detect_mic_activity(
                &[process(OWN_PID, 1, ""), process(OTHER_PID, 1, "us.zoom.xos")],
                OWN_PID
            ),
            MicActivity {
                other_app_active: true,
                active_app: Some("Zoom".to_string()),
            }
        );
    }

    #[test]
    fn ignores_idle_processes() {
        assert_eq!(
            detect_mic_activity(
                &[process(OTHER_PID, 0, "us.zoom.xos"), process(OWN_PID, 0, "")],
                OWN_PID
            ),
            MicActivity {
                other_app_active: false,
                active_app: None,
            }
        );
    }

    #[test]
    fn reports_inactive_without_processes() {
        assert_eq!(
            detect_mic_activity(&[], OWN_PID),
            MicActivity {
                other_app_active: false,
                active_app: None,
            }
        );
    }

    #[test]
    fn ignores_core_speech_running_input() {
        assert_eq!(
            detect_mic_activity(
                &[process(CORE_SPEECH_PID, 1, "com.apple.CoreSpeech")],
                OWN_PID
            ),
            MicActivity {
                other_app_active: false,
                active_app: None,
            }
        );
    }

    #[test]
    fn detects_call_app_alongside_core_speech() {
        assert_eq!(
            detect_mic_activity(
                &[
                    process(CORE_SPEECH_PID, 1, "com.apple.CoreSpeech"),
                    process(OTHER_PID, 1, "com.apple.FaceTime")
                ],
                OWN_PID
            ),
            MicActivity {
                other_app_active: true,
                active_app: Some("FaceTime".to_string()),
            }
        );
    }

    #[test]
    fn falls_back_to_bundle_id_tail_for_unknown_bundle_ids() {
        assert_eq!(
            detect_mic_activity(&[process(OTHER_PID, 1, "org.jitsi.JitsiMeet")], OWN_PID),
            MicActivity {
                other_app_active: true,
                active_app: Some("JitsiMeet".to_string()),
            }
        );
    }
}
