use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SampleFormat, SizedSample};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread::{self, JoinHandle};
use std::time::Instant;
use tauri::State;

use crate::audio::audio_engine::{
    calculate_rms_level, downmix_to_mono, resample_mono_pcm, TARGET_STT_SAMPLE_RATE,
};
use crate::recordings::{recording_file, recording_path, stt_wav_spec, RecordingFile, RecordingsDir};

type PcmWriter = hound::WavWriter<BufWriter<File>>;

enum CaptureMsg {
    Samples(Vec<f32>),
    Stop,
}

struct ActiveRecording {
    meeting_id: String,
    wav_path: PathBuf,
    started_at_ms: u64,
    started: Instant,
    level: Arc<AtomicU32>,
    tx: Sender<CaptureMsg>,
    thread: JoinHandle<Result<(), String>>,
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct RecordingOptions {
    input_device_id: Option<String>,
}

struct StartRequest<'a> {
    meeting_id: String,
    dir: &'a Path,
    options: RecordingOptions,
}

#[derive(Default)]
pub struct MicRecorder(Mutex<Option<ActiveRecording>>);

impl MicRecorder {
    fn active(&self) -> MutexGuard<'_, Option<ActiveRecording>> {
        self.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn active_wav_path(&self) -> Option<PathBuf> {
        self.active().as_ref().map(|rec| rec.wav_path.clone())
    }

    fn start(&self, request: StartRequest<'_>) -> Result<RecordingStart, String> {
        let StartRequest { meeting_id, dir, options } = request;
        let wav_path = recording_path(dir, &meeting_id)?;
        let mut active = self.active();
        if active.is_some() {
            return Err("recording_active".to_string());
        }

        let (tx, rx) = channel();
        let (ready_tx, ready_rx) = channel();
        let level = Arc::new(AtomicU32::new(0));
        let thread = {
            let (wav_path, callback_tx, level) = (wav_path.clone(), tx.clone(), level.clone());
            thread::spawn(move || {
                capture_session(&wav_path, callback_tx, rx, &level, ready_tx, &options)
            })
        };
        ready_rx.recv().map_err(|e| e.to_string())??;

        let started_at_ms = chrono::Utc::now().timestamp_millis() as u64;
        let start = RecordingStart {
            meeting_id: meeting_id.clone(),
            wav_path: wav_path.to_string_lossy().into_owned(),
            started_at_ms,
        };
        *active = Some(ActiveRecording {
            meeting_id,
            wav_path,
            started_at_ms,
            started: Instant::now(),
            level,
            tx,
            thread,
        });
        Ok(start)
    }

    fn stop(&self) -> Result<RecordingFile, String> {
        let mut active = self.active();
        let rec = active.take().ok_or("no_active_recording")?;
        let _ = rec.tx.send(CaptureMsg::Stop);
        rec.thread
            .join()
            .map_err(|_| "capture_thread_panicked".to_string())??;
        recording_file(&rec.wav_path)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingStart {
    meeting_id: String,
    wav_path: String,
    started_at_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveRecordingStatus {
    meeting_id: String,
    wav_path: String,
    started_at_ms: u64,
    elapsed_sec: f64,
    level: f32,
}

#[derive(Serialize)]
pub struct RecordingStatus {
    active: Option<ActiveRecordingStatus>,
}

pub fn write_block(
    writer: &mut PcmWriter,
    mono: &[f32],
    source_rate: u32,
) -> Result<(), String> {
    for sample in resample_mono_pcm(mono, source_rate, TARGET_STT_SAMPLE_RATE) {
        writer
            .write_sample((sample * i16::MAX as f32) as i16)
            .map_err(|e| e.to_string())?;
    }
    writer.flush().map_err(|e| e.to_string())
}

fn build_stream<T>(
    device: &cpal::Device,
    config: cpal::StreamConfig,
    tx: Sender<CaptureMsg>,
) -> Result<cpal::Stream, cpal::Error>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    device.build_input_stream(
        config,
        move |data: &[T], _: &cpal::InputCallbackInfo| {
            let samples = data.iter().map(|&s| f32::from_sample(s)).collect();
            let _ = tx.send(CaptureMsg::Samples(samples));
        },
        |err| eprintln!("[MicRecorder] Stream failed: {err}"),
        None,
    )
}

fn open_input(
    tx: Sender<CaptureMsg>,
    options: &RecordingOptions,
) -> Result<(cpal::Stream, u16, u32), String> {
    let host = cpal::default_host();
    let device = match options.input_device_id.as_deref() {
        None => host.default_input_device().ok_or("no_input_device")?,
        Some(id) => id
            .parse::<cpal::DeviceId>()
            .ok()
            .and_then(|parsed| host.device_by_id(&parsed))
            .filter(|device| device.supports_input())
            .ok_or("input_device_unavailable")?,
    };
    let supported = device.default_input_config().map_err(|e| e.to_string())?;
    let config = supported.config();
    if config.sample_rate == 0 || config.channels == 0 {
        return Err("unsupported_stream_config".to_string());
    }
    let stream = match supported.sample_format() {
        SampleFormat::F32 => build_stream::<f32>(&device, config, tx),
        SampleFormat::I16 => build_stream::<i16>(&device, config, tx),
        SampleFormat::U16 => build_stream::<u16>(&device, config, tx),
        other => return Err(format!("unsupported_sample_format: {other}")),
    }
    .map_err(|e| e.to_string())?;
    stream.play().map_err(|e| e.to_string())?;
    Ok((stream, config.channels, config.sample_rate))
}

fn capture_session(
    wav_path: &Path,
    callback_tx: Sender<CaptureMsg>,
    rx: Receiver<CaptureMsg>,
    level: &AtomicU32,
    ready: Sender<Result<(), String>>,
    options: &RecordingOptions,
) -> Result<(), String> {
    let setup = open_input(callback_tx, options).and_then(|input| {
        let mut writer =
            hound::WavWriter::create(wav_path, stt_wav_spec()).map_err(|e| e.to_string())?;
        writer.flush().map_err(|e| e.to_string())?;
        Ok((input, writer))
    });
    let ((stream, channels, source_rate), mut writer) = match setup {
        Ok(parts) => parts,
        Err(err) => {
            let _ = ready.send(Err(err.clone()));
            return Err(err);
        }
    };
    let _ = ready.send(Ok(()));

    let block_len = source_rate as usize;
    let mut pending: Vec<f32> = Vec::new();
    for msg in rx {
        let CaptureMsg::Samples(raw) = msg else {
            break;
        };
        let mono = downmix_to_mono(&raw, channels);
        level.store(calculate_rms_level(&mono).to_bits(), Ordering::Relaxed);
        pending.extend(mono);
        while pending.len() >= block_len {
            let block: Vec<f32> = pending.drain(..block_len).collect();
            write_block(&mut writer, &block, source_rate)?;
        }
    }
    drop(stream);
    write_block(&mut writer, &pending, source_rate)?;
    writer.finalize().map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub fn start_mic_recording(
    meeting_id: String,
    options: Option<RecordingOptions>,
    recorder: State<'_, MicRecorder>,
    dir: State<'_, RecordingsDir>,
) -> Result<RecordingStart, String> {
    recorder.start(StartRequest {
        meeting_id,
        dir: &dir.0,
        options: options.unwrap_or_default(),
    })
}

#[tauri::command(async)]
pub fn get_recording_status(recorder: State<'_, MicRecorder>) -> Result<RecordingStatus, String> {
    let active = recorder.active().as_ref().map(|rec| ActiveRecordingStatus {
        meeting_id: rec.meeting_id.clone(),
        wav_path: rec.wav_path.to_string_lossy().into_owned(),
        started_at_ms: rec.started_at_ms,
        elapsed_sec: rec.started.elapsed().as_secs_f64(),
        level: f32::from_bits(rec.level.load(Ordering::Relaxed)),
    });
    Ok(RecordingStatus { active })
}

#[tauri::command(async)]
pub fn stop_mic_recording(recorder: State<'_, MicRecorder>) -> Result<RecordingFile, String> {
    recorder.stop()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::Duration;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("summeet-mic-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn recorder_with_active(
        wav_path: PathBuf,
        capture: impl FnOnce() -> Result<(), String> + Send + 'static,
    ) -> (MicRecorder, Receiver<()>) {
        let (tx, rx) = channel();
        let (stopped_tx, stopped_rx) = channel();
        let thread = thread::spawn(move || {
            for msg in rx {
                if matches!(msg, CaptureMsg::Stop) {
                    break;
                }
            }
            let _ = stopped_tx.send(());
            capture()
        });
        let recorder = MicRecorder::default();
        *recorder.active() = Some(ActiveRecording {
            meeting_id: "mtg-1".to_string(),
            wav_path,
            started_at_ms: 0,
            started: Instant::now(),
            level: Arc::new(AtomicU32::new(0)),
            tx,
            thread,
        });
        (recorder, stopped_rx)
    }

    fn write_one_second_wav(path: &Path) {
        let mut writer = hound::WavWriter::create(path, stt_wav_spec()).unwrap();
        for _ in 0..TARGET_STT_SAMPLE_RATE {
            writer.write_sample(0i16).unwrap();
        }
        writer.finalize().unwrap();
    }

    #[test]
    fn test_remainder_block_and_finalize_give_exact_duration() {
        let dir = temp_dir();
        for source_rate in [48_000u32, 44_100] {
            let path = dir.join(format!("tail-{source_rate}.wav"));
            let tone: Vec<f32> = (0..source_rate).map(|i| ((i as f32) * 0.05).sin() * 0.5).collect();
            let mut writer = hound::WavWriter::create(&path, stt_wav_spec()).unwrap();

            write_block(&mut writer, &tone, source_rate).unwrap();
            write_block(&mut writer, &tone[..(source_rate / 2) as usize], source_rate).unwrap();
            write_block(&mut writer, &[], source_rate).unwrap();
            writer.finalize().unwrap();

            let file = recording_file(&path).unwrap();
            assert_eq!(file.duration_sec, 1.5);
            assert_eq!(file.size_bytes, 44 + 24_000 * 2);
        }
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_start_is_rejected_while_a_recording_is_active() {
        let dir = temp_dir();
        let active_path = dir.join("mtg-1.wav");
        let (recorder, _stopped) = recorder_with_active(active_path.clone(), || Ok(()));

        let request = |meeting_id: &str| StartRequest {
            meeting_id: meeting_id.to_string(),
            dir: &dir,
            options: RecordingOptions::default(),
        };

        assert_eq!(
            recorder.start(request("mtg-2")).err(),
            Some("recording_active".to_string())
        );
        assert_eq!(
            recorder.start(request("")).err(),
            Some("invalid_meeting_id".to_string())
        );
        assert_eq!(recorder.active_wav_path(), Some(active_path));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_state_stays_locked_until_the_capture_thread_has_finalized() {
        let dir = temp_dir();
        let wav_path = dir.join("mtg-1.wav");
        write_one_second_wav(&wav_path);
        let (release_tx, release_rx) = channel::<()>();
        let (recorder, stopped) = recorder_with_active(wav_path, move || {
            release_rx.recv().map_err(|e| e.to_string())
        });
        let recorder = Arc::new(recorder);

        let stopping = {
            let recorder = recorder.clone();
            thread::spawn(move || recorder.stop())
        };
        stopped.recv().unwrap();
        let next_start_gate = {
            let recorder = recorder.clone();
            thread::spawn(move || recorder.active_wav_path())
        };

        thread::sleep(Duration::from_millis(100));
        assert!(!next_start_gate.is_finished());

        release_tx.send(()).unwrap();
        assert_eq!(stopping.join().unwrap().unwrap().meeting_id, "mtg-1");
        assert_eq!(next_start_gate.join().unwrap(), None);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_stop_without_active_recording_fails() {
        let recorder = MicRecorder::default();

        assert_eq!(
            recorder.stop().err(),
            Some("no_active_recording".to_string())
        );
        assert_eq!(recorder.active_wav_path(), None);
    }

    #[test]
    fn test_stop_ends_capture_returns_file_and_clears_state() {
        let dir = temp_dir();
        let wav_path = dir.join("mtg-1.wav");
        write_one_second_wav(&wav_path);
        let (recorder, stopped) = recorder_with_active(wav_path.clone(), || Ok(()));

        let file = recorder.stop().unwrap();

        assert!(stopped.try_recv().is_ok());
        assert_eq!(file.meeting_id, "mtg-1");
        assert_eq!(file.duration_sec, 1.0);
        assert_eq!(recorder.active_wav_path(), None);
        assert_eq!(
            recorder.stop().err(),
            Some("no_active_recording".to_string())
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_stop_surfaces_capture_failures_and_still_clears_state() {
        let dir = temp_dir();
        let wav_path = dir.join("mtg-1.wav");
        write_one_second_wav(&wav_path);

        let (failing, _) = recorder_with_active(wav_path.clone(), || Err("disk_full".to_string()));
        assert_eq!(failing.stop().err(), Some("disk_full".to_string()));
        assert_eq!(failing.active_wav_path(), None);

        let (panicking, _) = recorder_with_active(wav_path, || panic!("capture crashed"));
        assert_eq!(
            panicking.stop().err(),
            Some("capture_thread_panicked".to_string())
        );
        assert_eq!(panicking.active_wav_path(), None);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_recording_options_read_camel_case_device_id_and_ignore_unknown_keys() {
        let options: RecordingOptions =
            serde_json::from_str(r#"{"inputDeviceId":"x","includeSystemAudio":true}"#).unwrap();

        assert_eq!(options.input_device_id, Some("x".to_string()));
    }

    #[test]
    fn test_recording_options_default_to_no_device_when_empty() {
        let options: RecordingOptions = serde_json::from_str("{}").unwrap();

        assert_eq!(options.input_device_id, None);
    }

    #[test]
    fn test_recording_start_serializes_camel_case_keys() {
        let start = RecordingStart {
            meeting_id: "mtg-1".to_string(),
            wav_path: "/tmp/mtg-1.wav".to_string(),
            started_at_ms: 7,
        };

        assert_eq!(
            serde_json::to_value(&start).unwrap(),
            serde_json::json!({
                "meetingId": "mtg-1",
                "wavPath": "/tmp/mtg-1.wav",
                "startedAtMs": 7,
            })
        );
    }

    #[test]
    fn test_open_input_reports_unparsable_device_id_as_unavailable() {
        let (tx, _rx) = channel();
        let options = RecordingOptions {
            input_device_id: Some("not-a-device-id".to_string()),
        };

        assert_eq!(
            open_input(tx, &options).err(),
            Some("input_device_unavailable".to_string())
        );
    }

    #[test]
    fn test_open_input_reports_unknown_well_formed_device_id_as_unavailable() {
        let (tx, _rx) = channel();
        let options = RecordingOptions {
            input_device_id: Some(format!("{}:no-such-device", cpal::default_host().id())),
        };

        assert_eq!(
            open_input(tx, &options).err(),
            Some("input_device_unavailable".to_string())
        );
    }

    #[test]
    fn test_open_input_rejects_output_only_device_id_as_unavailable() {
        let Some(output) = cpal::default_host().default_output_device() else {
            return;
        };
        let Ok(output_id) = output.id() else {
            return;
        };
        if output.supports_input() {
            return;
        }
        let (tx, _rx) = channel();
        let options = RecordingOptions {
            input_device_id: Some(output_id.to_string()),
        };

        assert_eq!(
            open_input(tx, &options).err(),
            Some("input_device_unavailable".to_string())
        );
    }
}
