use std::ffi::CStr;
use std::ptr::NonNull;
use std::sync::atomic::{AtomicU32, Ordering};

use cpal::traits::HostTrait;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::AnyThread;
use objc2_core_audio::{
    kAudioAggregateDeviceIsPrivateKey, kAudioAggregateDeviceNameKey,
    kAudioAggregateDeviceTapAutoStartKey, kAudioAggregateDeviceTapListKey,
    kAudioAggregateDeviceUIDKey, kAudioSubTapDriftCompensationKey, kAudioSubTapUIDKey,
    AudioHardwareCreateAggregateDevice, AudioHardwareCreateProcessTap,
    AudioHardwareDestroyAggregateDevice, AudioHardwareDestroyProcessTap, AudioObjectID,
    CATapDescription, CATapMuteBehavior,
};
use objc2_core_foundation::CFDictionary;
use objc2_foundation::{NSArray, NSDictionary, NSNumber, NSString};

static AGGREGATE_COUNTER: AtomicU32 = AtomicU32::new(0);

pub struct SystemTap {
    tap_id: AudioObjectID,
    aggregate_id: AudioObjectID,
}

fn check_status(status: i32, call: &str) -> Result<(), String> {
    if status == 0 {
        return Ok(());
    }
    Err(format!("{call} failed with OSStatus {status}"))
}

impl SystemTap {
    pub fn create(host: &cpal::Host) -> Result<(Self, cpal::Device), String> {
        let description = unsafe {
            CATapDescription::initMonoGlobalTapButExcludeProcesses(
                CATapDescription::alloc(),
                &NSArray::new(),
            )
        };
        let mut tap_id: AudioObjectID = 0;
        let status = unsafe {
            description.setMuteBehavior(CATapMuteBehavior::Unmuted);
            description.setPrivate(true);
            AudioHardwareCreateProcessTap(Some(&*description), &mut tap_id)
        };
        check_status(status, "AudioHardwareCreateProcessTap")?;

        let uid = format!(
            "ai.summarizebot.desktop.system-audio.{}.{}",
            std::process::id(),
            AGGREGATE_COUNTER.fetch_add(1, Ordering::Relaxed)
        );
        let ns_key = |key: &CStr| NSString::from_str(&key.to_string_lossy());
        let enabled = NSNumber::numberWithBool(true);
        let tap_uuid = unsafe { description.UUID() }.UUIDString();
        let tap_entry: Retained<NSDictionary<NSString, AnyObject>> = NSDictionary::from_slices(
            &[
                &*ns_key(kAudioSubTapUIDKey),
                &*ns_key(kAudioSubTapDriftCompensationKey),
            ],
            &[&*tap_uuid, &*enabled],
        );
        let taps = NSArray::from_retained_slice(&[tap_entry]);
        let properties: Retained<NSDictionary<NSString, AnyObject>> = NSDictionary::from_slices(
            &[
                &*ns_key(kAudioAggregateDeviceNameKey),
                &*ns_key(kAudioAggregateDeviceUIDKey),
                &*ns_key(kAudioAggregateDeviceIsPrivateKey),
                &*ns_key(kAudioAggregateDeviceTapListKey),
                &*ns_key(kAudioAggregateDeviceTapAutoStartKey),
            ],
            &[
                &*NSString::from_str("SumMeet system audio"),
                &*NSString::from_str(&uid),
                &*enabled,
                &*taps,
                &*enabled,
            ],
        );
        let mut aggregate_id: AudioObjectID = 0;
        let status = unsafe {
            AudioHardwareCreateAggregateDevice(
                &*Retained::as_ptr(&properties).cast::<CFDictionary>(),
                NonNull::from(&mut aggregate_id),
            )
        };
        if let Err(err) = check_status(status, "AudioHardwareCreateAggregateDevice") {
            unsafe { AudioHardwareDestroyProcessTap(tap_id) };
            return Err(err);
        }

        let tap = Self { tap_id, aggregate_id };
        let device = host
            .device_by_id(&cpal::DeviceId::new(cpal::platform::HostId::CoreAudio, &uid))
            .ok_or("system_audio_device_not_found")?;
        Ok((tap, device))
    }
}

impl Drop for SystemTap {
    fn drop(&mut self) {
        unsafe {
            AudioHardwareDestroyAggregateDevice(self.aggregate_id);
            AudioHardwareDestroyProcessTap(self.tap_id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::audio_engine::system_audio_supported;
    use cpal::traits::DeviceTrait;

    #[test]
    fn test_private_aggregate_with_global_tap_is_found_through_cpal_device_by_id() {
        if !system_audio_supported() {
            return;
        }
        let host = cpal::default_host();

        let (_tap, device) = SystemTap::create(&host).unwrap();

        let id = device.id().unwrap();
        assert!(id.to_string().contains("ai.summarizebot.desktop.system-audio."));
        assert!(device.supports_input());
        assert!(host.device_by_id(&id).is_some());
    }
}
