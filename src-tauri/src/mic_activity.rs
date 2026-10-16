use serde::Serialize;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const POLL_INTERVAL: Duration = Duration::from_secs(3);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MicActivity {
    other_app_active: bool,
}

#[cfg(target_os = "macos")]
fn read_property<T: Copy + Default>(object: u32, selector: u32) -> Result<Vec<T>, i32> {
    use coreaudio_sys::{
        kAudioObjectPropertyElementMain, kAudioObjectPropertyScopeGlobal,
        AudioObjectGetPropertyData, AudioObjectGetPropertyDataSize, AudioObjectPropertyAddress,
    };
    use std::mem::size_of;
    use std::ptr::null;

    let address = AudioObjectPropertyAddress {
        mSelector: selector,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain,
    };
    let mut size = 0u32;
    let status = unsafe { AudioObjectGetPropertyDataSize(object, &address, 0, null(), &mut size) };
    if status != 0 {
        return Err(status);
    }

    let mut values = vec![T::default(); size as usize / size_of::<T>()];
    let mut size = (values.len() * size_of::<T>()) as u32;
    let status = unsafe {
        AudioObjectGetPropertyData(
            object,
            &address,
            0,
            null(),
            &mut size,
            values.as_mut_ptr().cast(),
        )
    };
    if status != 0 {
        return Err(status);
    }
    values.truncate(size as usize / size_of::<T>());
    Ok(values)
}

#[cfg(target_os = "macos")]
fn input_processes() -> Result<Vec<(i32, u32)>, i32> {
    use coreaudio_sys::{
        kAudioHardwarePropertyProcessObjectList, kAudioObjectSystemObject,
        kAudioProcessPropertyIsRunningInput, kAudioProcessPropertyPID,
    };

    let objects = read_property::<u32>(
        kAudioObjectSystemObject,
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
            Some((pid, running_input))
        })
        .collect())
}

#[cfg(not(target_os = "macos"))]
fn input_processes() -> Result<Vec<(i32, u32)>, i32> {
    Ok(Vec::new())
}

fn has_other_app_input(processes: &[(i32, u32)], own_pid: i32) -> bool {
    processes
        .iter()
        .any(|&(pid, running_input)| running_input != 0 && pid != own_pid)
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
                        eprintln!("[MicActivity] CoreAudio query failed: OSStatus {status}");
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

    #[test]
    fn ignores_own_process_running_input() {
        assert!(!has_other_app_input(&[(OWN_PID, 1)], OWN_PID));
    }

    #[test]
    fn detects_other_process_running_input() {
        assert!(has_other_app_input(&[(OTHER_PID, 1)], OWN_PID));
    }

    #[test]
    fn detects_other_process_alongside_own_recording() {
        assert!(has_other_app_input(
            &[(OWN_PID, 1), (OTHER_PID, 1)],
            OWN_PID
        ));
    }

    #[test]
    fn ignores_idle_processes() {
        assert!(!has_other_app_input(
            &[(OTHER_PID, 0), (OWN_PID, 0)],
            OWN_PID
        ));
    }

    #[test]
    fn reports_inactive_without_processes() {
        assert!(!has_other_app_input(&[], OWN_PID));
    }
}
