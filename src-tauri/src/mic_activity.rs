use serde::Serialize;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const POLL_INTERVAL: Duration = Duration::from_secs(3);
const IGNORED_BUNDLE_IDS: &[&str] = &["com.apple.CoreSpeech"];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MicActivity {
    other_app_active: bool,
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

fn has_other_app_input(processes: &[(i32, u32, String)], own_pid: i32) -> bool {
    processes.iter().any(|(pid, running_input, bundle_id)| {
        let is_running_input = *running_input != 0;
        let is_own_process = *pid == own_pid;
        let is_ignored = IGNORED_BUNDLE_IDS.contains(&bundle_id.as_str());
        is_running_input && !is_own_process && !is_ignored
    })
}

pub fn spawn_watcher(app: AppHandle) {
    thread::spawn(move || {
        let own_pid = std::process::id() as i32;
        let mut last_error = None;
        loop {
            let other_app_active = match input_processes() {
                Ok(processes) => {
                    last_error = None;
                    has_other_app_input(&processes, own_pid)
                }
                Err(status) => {
                    if last_error != Some(status) {
                        eprintln!("[MicActivity] Audio input query failed: status {status}");
                        last_error = Some(status);
                    }
                    false
                }
            };
            let _ = app.emit("mic-activity", MicActivity { other_app_active });
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
        assert!(!has_other_app_input(&[process(OWN_PID, 1, "")], OWN_PID));
    }

    #[test]
    fn detects_other_process_running_input() {
        assert!(has_other_app_input(&[process(OTHER_PID, 1, "")], OWN_PID));
    }

    #[test]
    fn detects_other_process_alongside_own_recording() {
        assert!(has_other_app_input(
            &[process(OWN_PID, 1, ""), process(OTHER_PID, 1, "")],
            OWN_PID
        ));
    }

    #[test]
    fn ignores_idle_processes() {
        assert!(!has_other_app_input(
            &[process(OTHER_PID, 0, ""), process(OWN_PID, 0, "")],
            OWN_PID
        ));
    }

    #[test]
    fn reports_inactive_without_processes() {
        assert!(!has_other_app_input(&[], OWN_PID));
    }

    #[test]
    fn ignores_core_speech_running_input() {
        assert!(!has_other_app_input(
            &[process(CORE_SPEECH_PID, 1, "com.apple.CoreSpeech")],
            OWN_PID
        ));
    }

    #[test]
    fn detects_call_app_alongside_core_speech() {
        assert!(has_other_app_input(
            &[
                process(CORE_SPEECH_PID, 1, "com.apple.CoreSpeech"),
                process(OTHER_PID, 1, "com.apple.FaceTime")
            ],
            OWN_PID
        ));
    }
}
