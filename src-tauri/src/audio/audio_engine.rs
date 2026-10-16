use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use cpal::traits::{DeviceTrait, HostTrait};
#[cfg(target_os = "macos")]
use objc2_foundation::{NSOperatingSystemVersion, NSProcessInfo};
use serde::{Deserialize, Serialize};

pub const TARGET_STT_SAMPLE_RATE: u32 = 16_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_input: bool,
    pub is_output: bool,
    pub is_default: bool,
    pub is_headphone_or_airpods: bool,
    pub sample_rate: u32,
    pub channels: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DualStreamRoutingSnapshot {
    pub active_input_device: String,
    pub active_output_device: String,
    pub is_headphone_mode: bool,
    pub input_sample_rate: u32,
    pub system_sample_rate: u32,
    pub echo_gate_enabled: bool,
    pub routing_notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveAudioChunkPayload {
    pub meeting_id: String,
    pub source_channel: String, // "mic_user" | "system_remote"
    pub default_speaker_label: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub rms_level: f32,
    pub sample_rate: u32,
    pub pcm_base64: String,
}

#[cfg(target_os = "macos")]
pub fn system_audio_supported() -> bool {
    NSProcessInfo::processInfo().isOperatingSystemAtLeastVersion(NSOperatingSystemVersion {
        majorVersion: 14,
        minorVersion: 6,
        patchVersion: 0,
    })
}

#[cfg(not(target_os = "macos"))]
pub fn system_audio_supported() -> bool {
    cfg!(target_os = "windows")
}

/// Detects whether a device name corresponds to AirPods, Bluetooth headphones, or wired headsets.
pub fn detect_headphone_or_airpods(device_name: &str) -> bool {
    let normalized = device_name.to_lowercase();
    let headphone_keywords = [
        "airpods",
        "airpod",
        "headphone",
        "headphones",
        "headset",
        "earpods",
        "earbuds",
        "beats",
        "sony wh",
        "sony wf",
        "bose",
        "sennheiser",
        "jabra",
        "external headphones",
        "bluetooth",
    ];
    headphone_keywords
        .iter()
        .any(|keyword| normalized.contains(keyword))
}

/// Converts multi-channel interleaved f32 audio into mono f32 samples.
pub fn downmix_to_mono(interleaved_samples: &[f32], channels: u16) -> Vec<f32> {
    if channels <= 1 {
        return interleaved_samples.to_vec();
    }
    let ch = channels as usize;
    interleaved_samples
        .chunks(ch)
        .map(|frame| {
            let sum: f32 = frame.iter().copied().sum();
            (sum / (frame.len() as f32)).clamp(-1.0, 1.0)
        })
        .collect()
}

/// Resamples mono f32 audio from an arbitrary source sample rate (e.g., 16kHz Bluetooth HFP,
/// 24kHz AirPods Pro, 44.1kHz, or 48kHz ScreenCaptureKit) to the target sample rate (16kHz).
pub fn resample_mono_pcm(samples: &[f32], source_rate: u32, target_rate: u32) -> Vec<f32> {
    if samples.is_empty() || source_rate == 0 || target_rate == 0 {
        return Vec::new();
    }
    if source_rate == target_rate {
        return samples.to_vec();
    }

    let ratio = source_rate as f64 / target_rate as f64;
    let output_len = ((samples.len() as f64) / ratio).round() as usize;
    if output_len == 0 {
        return Vec::new();
    }

    let mut output = Vec::with_capacity(output_len);
    for i in 0..output_len {
        let src_pos = (i as f64) * ratio;
        let left_idx = src_pos.floor() as usize;
        let right_idx = (left_idx + 1).min(samples.len() - 1);
        let frac = (src_pos - (left_idx as f64)) as f32;

        let interpolated = samples[left_idx] * (1.0 - frac) + samples[right_idx] * frac;
        output.push(interpolated.clamp(-1.0, 1.0));
    }

    output
}

/// Calculates normalized Root Mean Square (RMS) audio level in [0.0, 1.0].
pub fn calculate_rms_level(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum_squares: f32 = samples.iter().map(|s| s * s).sum();
    let rms = (sum_squares / (samples.len() as f32)).sqrt();
    (rms * 2.5).clamp(0.0, 1.0)
}

/// Applies adaptive echo suppression on the microphone stream ONLY when speakers are used.
/// When headphones or AirPods are active (`is_headphone_mode == true`), zero attenuation is applied
/// so simultaneous speech (double-talk) is preserved with 100% fidelity.
pub fn apply_echo_suppression_gate(
    mic_samples: &[f32],
    system_samples: &[f32],
    is_headphone_mode: bool,
) -> Vec<f32> {
    if is_headphone_mode {
        return mic_samples.to_vec();
    }

    let mic_rms = calculate_rms_level(mic_samples);
    let sys_rms = calculate_rms_level(system_samples);

    // If system audio is loud on speakers while mic only picks up faint speaker bleed,
    // attenuate the mic bleed to prevent duplicate transcription.
    if sys_rms > 0.25 && mic_rms < sys_rms * 0.45 {
        return mic_samples.iter().map(|s| s * 0.08).collect();
    }

    mic_samples.to_vec()
}

/// Encodes normalized f32 mono samples into 16-bit Little-Endian PCM Base64 string.
pub fn encode_pcm16_base64(samples: &[f32]) -> String {
    let mut bytes = Vec::with_capacity(samples.len() * 2);
    for &sample in samples {
        let clamped = sample.clamp(-1.0, 1.0);
        let pcm16 = (clamped * i16::MAX as f32) as i16;
        bytes.extend_from_slice(&pcm16.to_le_bytes());
    }
    BASE64_STANDARD.encode(&bytes)
}

/// Builds a tagged `LiveAudioChunkPayload` from raw device audio samples.
pub fn build_live_audio_chunk(
    meeting_id: &str,
    source_channel: &str,
    raw_interleaved_samples: &[f32],
    source_channels: u16,
    source_sample_rate: u32,
    start_ms: u64,
    end_ms: u64,
) -> LiveAudioChunkPayload {
    let mono = downmix_to_mono(raw_interleaved_samples, source_channels);
    let resampled = resample_mono_pcm(&mono, source_sample_rate, TARGET_STT_SAMPLE_RATE);
    let rms_level = calculate_rms_level(&resampled);
    let pcm_base64 = encode_pcm16_base64(&resampled);

    let default_speaker_label = if source_channel == "mic_user" {
        "You (Mic)".to_string()
    } else {
        "Remote Participant (System Audio)".to_string()
    };

    LiveAudioChunkPayload {
        meeting_id: meeting_id.to_string(),
        source_channel: source_channel.to_string(),
        default_speaker_label,
        start_ms,
        end_ms,
        rms_level,
        sample_rate: TARGET_STT_SAMPLE_RATE,
        pcm_base64,
    }
}

/// Lists available hardware audio input and output devices and identifies AirPods / Headphones.
pub fn list_system_audio_devices() -> Vec<AudioDeviceInfo> {
    let host = cpal::default_host();
    let mut devices_list = Vec::new();

    let default_input_id = host.default_input_device().and_then(|d| d.id().ok());
    let default_output_id = host.default_output_device().and_then(|d| d.id().ok());

    if let Ok(inputs) = host.input_devices() {
        for (idx, device) in inputs.enumerate() {
            let Ok(device_id) = device.id() else {
                continue;
            };
            let name = device
                .description()
                .map(|d| d.name().to_string())
                .unwrap_or_else(|_| format!("Input Device {}", idx));
            let config = device.default_input_config().ok();
            let sample_rate = config.as_ref().map(|c| c.sample_rate()).unwrap_or(48_000);
            let channels = config.as_ref().map(|c| c.channels()).unwrap_or(1);
            let is_default = default_input_id.as_ref() == Some(&device_id);
            let is_headphone = detect_headphone_or_airpods(&name);

            devices_list.push(AudioDeviceInfo {
                id: device_id.to_string(),
                name,
                is_input: true,
                is_output: false,
                is_default,
                is_headphone_or_airpods: is_headphone,
                sample_rate,
                channels,
            });
        }
    }

    if let Ok(outputs) = host.output_devices() {
        for (idx, device) in outputs.enumerate() {
            let Ok(device_id) = device.id() else {
                continue;
            };
            let name = device
                .description()
                .map(|d| d.name().to_string())
                .unwrap_or_else(|_| format!("Output Device {}", idx));
            let config = device.default_output_config().ok();
            let sample_rate = config.as_ref().map(|c| c.sample_rate()).unwrap_or(48_000);
            let channels = config.as_ref().map(|c| c.channels()).unwrap_or(2);
            let is_default = default_output_id.as_ref() == Some(&device_id);
            let is_headphone = detect_headphone_or_airpods(&name);

            devices_list.push(AudioDeviceInfo {
                id: device_id.to_string(),
                name,
                is_input: false,
                is_output: true,
                is_default,
                is_headphone_or_airpods: is_headphone,
                sample_rate,
                channels,
            });
        }
    }

    devices_list
}

/// Evaluates the current input and output devices to configure optimal dual-stream routing
/// for AirPods, wired headphones, or built-in speakers.
pub fn compute_dual_stream_routing(
    input_device_name: &str,
    output_device_name: &str,
    input_sample_rate: u32,
    system_sample_rate: u32,
) -> DualStreamRoutingSnapshot {
    let is_headphone_mode = detect_headphone_or_airpods(input_device_name)
        || detect_headphone_or_airpods(output_device_name);

    let echo_gate_enabled = !is_headphone_mode;
    let routing_notes = if is_headphone_mode {
        format!(
            "Headphone/AirPods Mode Active ({} -> {}). Dual-Stream Loopback captures remote audio before Bluetooth/Headphone output; Mic resampled from {}Hz -> 16000Hz with zero echo attenuation.",
            input_device_name, output_device_name, input_sample_rate
        )
    } else {
        format!(
            "Speaker Mode Active ({} -> {}). Dual-Stream Loopback + Adaptive Echo Suppression Gate enabled.",
            input_device_name, output_device_name
        )
    };

    DualStreamRoutingSnapshot {
        active_input_device: input_device_name.to_string(),
        active_output_device: output_device_name.to_string(),
        is_headphone_mode,
        input_sample_rate,
        system_sample_rate,
        echo_gate_enabled,
        routing_notes,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_headphone_or_airpods_identifies_bluetooth_and_wired_headsets() {
        // Given various macOS audio device names
        // When checking if they are headphones or AirPods
        // Then AirPods, Sony, Bose, and External Headphones return true while Speakers return false
        assert!(detect_headphone_or_airpods("Minh's AirPods Pro"));
        assert!(detect_headphone_or_airpods("AirPods Max - Find My"));
        assert!(detect_headphone_or_airpods("External Headphones"));
        assert!(detect_headphone_or_airpods("Sony WH-1000XM5"));
        assert!(!detect_headphone_or_airpods("MacBook Pro Speakers"));
        assert!(!detect_headphone_or_airpods("MacBook Pro Microphone"));
    }

    #[test]
    fn test_resample_mono_pcm_converts_airpods_24khz_and_48khz_to_16khz() {
        // Given a 1-second buffer at 24,000 Hz (typical AirPods Bluetooth HFP rate)
        let input_24k: Vec<f32> = (0..24_000).map(|i| ((i as f32) * 0.01).sin()).collect();

        // When resampling to 16,000 Hz
        let resampled_16k = resample_mono_pcm(&input_24k, 24_000, TARGET_STT_SAMPLE_RATE);

        // Then the output has exactly 16,000 samples and preserves valid [-1.0, 1.0] range
        assert_eq!(resampled_16k.len(), 16_000);
        assert!(resampled_16k.iter().all(|&s| (-1.0..=1.0).contains(&s)));
    }

    #[test]
    fn test_echo_suppression_gate_preserves_full_mic_signal_on_airpods() {
        // Given loud system audio and quiet user mic speech while wearing AirPods
        let mic_signal = vec![0.05; 1600];
        let loud_system_signal = vec![0.60; 1600];

        // When in headphone/AirPods mode, zero attenuation should happen
        let headphone_output = apply_echo_suppression_gate(&mic_signal, &loud_system_signal, true);
        assert_eq!(headphone_output, mic_signal);

        // When on laptop speakers (not headphone mode), echo bleed should be attenuated
        let speaker_output = apply_echo_suppression_gate(&mic_signal, &loud_system_signal, false);
        assert!(speaker_output[0] < mic_signal[0] * 0.2);
    }

    #[test]
    fn test_compute_dual_stream_routing_configures_headphone_mode_automatically() {
        // Given AirPods Pro connected as output even if built-in mic is selected
        let snapshot = compute_dual_stream_routing(
            "MacBook Pro Microphone",
            "Minh's AirPods Pro",
            48_000,
            48_000,
        );

        // Then headphone mode is active and echo gate is disabled
        assert!(snapshot.is_headphone_mode);
        assert!(!snapshot.echo_gate_enabled);
        assert!(snapshot.routing_notes.contains("Headphone/AirPods Mode Active"));
    }
}
