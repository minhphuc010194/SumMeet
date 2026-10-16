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
    apply_echo_suppression_gate, calculate_rms_level, detect_headphone_or_airpods,
    downmix_to_mono, resample_mono_pcm, system_audio_supported, TARGET_STT_SAMPLE_RATE,
};
#[cfg(target_os = "macos")]
use crate::audio::system_tap::SystemTap;
use crate::recordings::{
    recording_file, stt_wav_spec, track_paths, RecordingFile, RecordingsDir, TrackPaths,
};

type PcmWriter = hound::WavWriter<BufWriter<File>>;
#[cfg(not(target_os = "macos"))]
type SystemTap = ();

const MAX_TRACK_LAG: usize = TARGET_STT_SAMPLE_RATE as usize / 2;

#[derive(Clone, Copy)]
enum Source {
    Mic,
    System,
}

enum CaptureMsg {
    Samples(Source, Vec<f32>),
    Stop,
}

struct SampleSink {
    source: Source,
    tx: Sender<CaptureMsg>,
}

struct ActiveRecording {
    meeting_id: String,
    wav_path: PathBuf,
    started_at_ms: u64,
    started: Instant,
    level: Arc<AtomicU32>,
    system_level: Arc<AtomicU32>,
    has_system_audio: bool,
    tx: Sender<CaptureMsg>,
    thread: JoinHandle<Result<(), String>>,
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct RecordingOptions {
    input_device_id: Option<String>,
    include_system_audio: bool,
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
        let paths = track_paths(dir, &meeting_id)?;
        let wav_path = paths.mix.clone();
        let mut active = self.active();
        if active.is_some() {
            return Err("recording_active".to_string());
        }

        let (tx, rx) = channel();
        let (ready_tx, ready_rx) = channel();
        let level = Arc::new(AtomicU32::new(0));
        let system_level = Arc::new(AtomicU32::new(0));
        let include_system_audio = options.include_system_audio;
        let thread = {
            let session = CaptureSession {
                paths,
                tx: tx.clone(),
                rx,
                level: level.clone(),
                system_level: system_level.clone(),
                ready: ready_tx,
                options,
            };
            thread::spawn(move || capture_session(session))
        };
        let system_audio_error = ready_rx.recv().map_err(|e| e.to_string())??;
        let has_system_audio = include_system_audio && system_audio_error.is_none();

        let started_at_ms = chrono::Utc::now().timestamp_millis() as u64;
        let start = RecordingStart {
            meeting_id: meeting_id.clone(),
            wav_path: wav_path.to_string_lossy().into_owned(),
            started_at_ms,
            has_system_audio,
            system_audio_error,
        };
        *active = Some(ActiveRecording {
            meeting_id,
            wav_path,
            started_at_ms,
            started: Instant::now(),
            level,
            system_level,
            has_system_audio,
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
    has_system_audio: bool,
    system_audio_error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveRecordingStatus {
    meeting_id: String,
    wav_path: String,
    started_at_ms: u64,
    elapsed_sec: f64,
    level: f32,
    has_system_audio: bool,
    system_level: f32,
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

fn create_writer(path: &Path) -> Result<PcmWriter, String> {
    let mut writer = hound::WavWriter::create(path, stt_wav_spec()).map_err(|e| e.to_string())?;
    writer.flush().map_err(|e| e.to_string())?;
    Ok(writer)
}

fn mix_tracks(mic: &[f32], system: &[f32]) -> Vec<f32> {
    mic.iter()
        .zip(system)
        .map(|(mic, system)| (mic + system).clamp(-1.0, 1.0))
        .collect()
}

#[derive(Default)]
struct PendingTracks {
    mic: Vec<f32>,
    system: Vec<f32>,
}

impl PendingTracks {
    fn take_aligned(&mut self, max_lag: usize) -> (Vec<f32>, Vec<f32>) {
        let min_len = self.mic.len().max(self.system.len()).saturating_sub(max_lag);
        self.mic.resize(self.mic.len().max(min_len), 0.0);
        self.system.resize(self.system.len().max(min_len), 0.0);
        let aligned_len = self.mic.len().min(self.system.len());
        (
            self.mic.drain(..aligned_len).collect(),
            self.system.drain(..aligned_len).collect(),
        )
    }
}

struct SourceBlocks {
    channels: u16,
    sample_rate: u32,
    raw: Vec<f32>,
}

impl SourceBlocks {
    fn push(&mut self, interleaved: &[f32]) -> Vec<f32> {
        self.raw.extend(downmix_to_mono(interleaved, self.channels));
        let block_len = ((self.sample_rate / 10) as usize).max(1);
        let mut resampled = Vec::new();
        while self.raw.len() >= block_len {
            let block: Vec<f32> = self.raw.drain(..block_len).collect();
            resampled.extend(resample_mono_pcm(&block, self.sample_rate, TARGET_STT_SAMPLE_RATE));
        }
        resampled
    }

    fn finish(&mut self) -> Vec<f32> {
        let tail = std::mem::take(&mut self.raw);
        resample_mono_pcm(&tail, self.sample_rate, TARGET_STT_SAMPLE_RATE)
    }
}

struct TrackWriters {
    mix: PcmWriter,
    split: Option<(PcmWriter, PcmWriter)>,
    headphone_mode: bool,
    level: Arc<AtomicU32>,
    system_level: Arc<AtomicU32>,
}

impl TrackWriters {
    fn write(&mut self, (mic, system): (Vec<f32>, Vec<f32>)) -> Result<(), String> {
        if mic.is_empty() {
            return Ok(());
        }
        let mic = apply_echo_suppression_gate(&mic, &system, self.headphone_mode);
        let mix = mix_tracks(&mic, &system);
        write_block(&mut self.mix, &mix, TARGET_STT_SAMPLE_RATE)?;
        if let Some((mic_writer, system_writer)) = &mut self.split {
            write_block(mic_writer, &mic, TARGET_STT_SAMPLE_RATE)?;
            write_block(system_writer, &system, TARGET_STT_SAMPLE_RATE)?;
        }
        self.level
            .store(calculate_rms_level(&mic).to_bits(), Ordering::Relaxed);
        self.system_level
            .store(calculate_rms_level(&system).to_bits(), Ordering::Relaxed);
        Ok(())
    }

    fn finalize(self) -> Result<(), String> {
        self.mix.finalize().map_err(|e| e.to_string())?;
        if let Some((mic_writer, system_writer)) = self.split {
            mic_writer.finalize().map_err(|e| e.to_string())?;
            system_writer.finalize().map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

fn build_stream<T>(
    device: &cpal::Device,
    config: cpal::StreamConfig,
    sink: SampleSink,
) -> Result<cpal::Stream, cpal::Error>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    device.build_input_stream(
        config,
        move |data: &[T], _: &cpal::InputCallbackInfo| {
            let samples = data.iter().map(|&s| f32::from_sample(s)).collect();
            let _ = sink.tx.send(CaptureMsg::Samples(sink.source, samples));
        },
        |err| eprintln!("[MicRecorder] Stream failed: {err}"),
        None,
    )
}

fn device_name(device: &cpal::Device) -> String {
    device
        .description()
        .map(|description| description.name().to_string())
        .unwrap_or_default()
}

struct OpenedInput {
    _stream: cpal::Stream,
    device_name: String,
    blocks: SourceBlocks,
}

fn open_stream(device: &cpal::Device, sink: SampleSink) -> Result<OpenedInput, String> {
    // Windows loopback records a render endpoint, which only has an output config.
    let supported = if device.supports_input() {
        device.default_input_config()
    } else {
        device.default_output_config()
    }
    .map_err(|e| e.to_string())?;
    let config = supported.config();
    if config.sample_rate == 0 || config.channels == 0 {
        return Err("unsupported_stream_config".to_string());
    }
    let stream = match supported.sample_format() {
        SampleFormat::F32 => build_stream::<f32>(device, config, sink),
        SampleFormat::I16 => build_stream::<i16>(device, config, sink),
        SampleFormat::U16 => build_stream::<u16>(device, config, sink),
        other => return Err(format!("unsupported_sample_format: {other}")),
    }
    .map_err(|e| e.to_string())?;
    stream.play().map_err(|e| e.to_string())?;
    Ok(OpenedInput {
        _stream: stream,
        device_name: device_name(device),
        blocks: SourceBlocks {
            channels: config.channels,
            sample_rate: config.sample_rate,
            raw: Vec::new(),
        },
    })
}

fn open_input(tx: Sender<CaptureMsg>, options: &RecordingOptions) -> Result<OpenedInput, String> {
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
    open_stream(&device, SampleSink { source: Source::Mic, tx })
}

struct SystemSource {
    // The stream must drop before the tap, so keep this field order.
    input: OpenedInput,
    _tap: SystemTap,
}

#[cfg(target_os = "macos")]
fn open_system_source(tx: Sender<CaptureMsg>) -> Result<SystemSource, String> {
    let (tap, device) = SystemTap::create(&cpal::default_host())?;
    let input = open_stream(&device, SampleSink { source: Source::System, tx })?;
    Ok(SystemSource { input, _tap: tap })
}

#[cfg(not(target_os = "macos"))]
fn open_system_source(tx: Sender<CaptureMsg>) -> Result<SystemSource, String> {
    let device = cpal::default_host()
        .default_output_device()
        .ok_or("no_output_device")?;
    let input = open_stream(&device, SampleSink { source: Source::System, tx })?;
    Ok(SystemSource { input, _tap: () })
}

fn open_system_audio(tx: Sender<CaptureMsg>) -> Result<SystemSource, &'static str> {
    if !system_audio_supported() {
        return Err("system_audio_unsupported");
    }
    open_system_source(tx).map_err(|err| {
        eprintln!("[MicRecorder] System audio failed: {err}");
        "system_audio_failed"
    })
}

struct CaptureSession {
    paths: TrackPaths,
    tx: Sender<CaptureMsg>,
    rx: Receiver<CaptureMsg>,
    level: Arc<AtomicU32>,
    system_level: Arc<AtomicU32>,
    ready: Sender<Result<Option<String>, String>>,
    options: RecordingOptions,
}

struct Capture {
    mic: OpenedInput,
    system: Option<SystemSource>,
    system_error: Option<String>,
    writers: TrackWriters,
}

fn open_capture(session: &CaptureSession) -> Result<Capture, String> {
    let CaptureSession { paths, tx, level, system_level, options, .. } = session;
    let mic = open_input(tx.clone(), options)?;
    let mut system = None;
    let mut system_error = None;
    if options.include_system_audio {
        match open_system_audio(tx.clone()) {
            Ok(source) => system = Some(source),
            Err(code) => system_error = Some(code.to_string()),
        }
    }
    let split = if system.is_some() {
        Some((create_writer(&paths.mic)?, create_writer(&paths.system)?))
    } else {
        None
    };
    let output_name = cpal::default_host()
        .default_output_device()
        .map(|device| device_name(&device))
        .unwrap_or_default();
    let writers = TrackWriters {
        mix: create_writer(&paths.mix)?,
        split,
        headphone_mode: detect_headphone_or_airpods(&mic.device_name)
            || detect_headphone_or_airpods(&output_name),
        level: level.clone(),
        system_level: system_level.clone(),
    };
    Ok(Capture { mic, system, system_error, writers })
}

fn capture_session(session: CaptureSession) -> Result<(), String> {
    let mut capture = match open_capture(&session) {
        Ok(capture) => capture,
        Err(err) => {
            let _ = session.ready.send(Err(err.clone()));
            return Err(err);
        }
    };
    let _ = session.ready.send(Ok(capture.system_error.take()));

    let max_lag = if capture.system.is_some() { MAX_TRACK_LAG } else { 0 };
    let mut pending = PendingTracks::default();
    for msg in session.rx {
        match msg {
            CaptureMsg::Samples(Source::Mic, raw) => {
                pending.mic.extend(capture.mic.blocks.push(&raw));
            }
            CaptureMsg::Samples(Source::System, raw) => {
                if let Some(system) = &mut capture.system {
                    pending.system.extend(system.input.blocks.push(&raw));
                }
            }
            CaptureMsg::Stop => break,
        }
        capture.writers.write(pending.take_aligned(max_lag))?;
    }
    pending.mic.extend(capture.mic.blocks.finish());
    if let Some(system) = &mut capture.system {
        pending.system.extend(system.input.blocks.finish());
    }
    capture.writers.write(pending.take_aligned(0))?;
    capture.writers.finalize()
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
        has_system_audio: rec.has_system_audio,
        system_level: f32::from_bits(rec.system_level.load(Ordering::Relaxed)),
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
            system_level: Arc::new(AtomicU32::new(0)),
            has_system_audio: false,
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
    fn test_recording_options_read_include_system_audio_and_default_it_to_off() {
        let on: RecordingOptions =
            serde_json::from_str(r#"{"includeSystemAudio":true}"#).unwrap();
        let off: RecordingOptions =
            serde_json::from_str(r#"{"inputDeviceId":"x"}"#).unwrap();

        assert!(on.include_system_audio);
        assert!(!off.include_system_audio);
        assert!(!RecordingOptions::default().include_system_audio);
    }

    #[test]
    fn test_recording_start_serializes_camel_case_keys() {
        let start = RecordingStart {
            meeting_id: "mtg-1".to_string(),
            wav_path: "/tmp/mtg-1.wav".to_string(),
            started_at_ms: 7,
            has_system_audio: true,
            system_audio_error: None,
        };

        assert_eq!(
            serde_json::to_value(&start).unwrap(),
            serde_json::json!({
                "meetingId": "mtg-1",
                "wavPath": "/tmp/mtg-1.wav",
                "startedAtMs": 7,
                "hasSystemAudio": true,
                "systemAudioError": null,
            })
        );
    }

    #[test]
    fn test_recording_start_reports_the_system_audio_error_code() {
        let start = RecordingStart {
            meeting_id: "mtg-1".to_string(),
            wav_path: "/tmp/mtg-1.wav".to_string(),
            started_at_ms: 7,
            has_system_audio: false,
            system_audio_error: Some("system_audio_failed".to_string()),
        };

        let json = serde_json::to_value(&start).unwrap();

        assert_eq!(json["hasSystemAudio"], false);
        assert_eq!(json["systemAudioError"], "system_audio_failed");
    }

    #[test]
    fn test_active_recording_status_serializes_camel_case_keys() {
        let status = ActiveRecordingStatus {
            meeting_id: "mtg-1".to_string(),
            wav_path: "/tmp/mtg-1.wav".to_string(),
            started_at_ms: 7,
            elapsed_sec: 1.5,
            level: 0.25,
            has_system_audio: true,
            system_level: 0.5,
        };

        assert_eq!(
            serde_json::to_value(&status).unwrap(),
            serde_json::json!({
                "meetingId": "mtg-1",
                "wavPath": "/tmp/mtg-1.wav",
                "startedAtMs": 7,
                "elapsedSec": 1.5,
                "level": 0.25,
                "hasSystemAudio": true,
                "systemLevel": 0.5,
            })
        );
    }

    #[test]
    fn test_open_input_reports_unparsable_device_id_as_unavailable() {
        let (tx, _rx) = channel();
        let options = RecordingOptions {
            input_device_id: Some("not-a-device-id".to_string()),
            ..Default::default()
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
            ..Default::default()
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
            ..Default::default()
        };

        assert_eq!(
            open_input(tx, &options).err(),
            Some("input_device_unavailable".to_string())
        );
    }

    fn pcm(sample: f32) -> i16 {
        (sample * i16::MAX as f32) as i16
    }

    fn read_samples(path: &Path) -> Vec<i16> {
        hound::WavReader::open(path)
            .unwrap()
            .samples::<i16>()
            .map(Result::unwrap)
            .collect()
    }

    fn pending(mic: usize, system: usize) -> PendingTracks {
        PendingTracks {
            mic: vec![0.5; mic],
            system: vec![0.25; system],
        }
    }

    fn track_writers(dir: &Path, headphone_mode: bool) -> TrackWriters {
        let paths = track_paths(dir, "m1").unwrap();
        TrackWriters {
            mix: create_writer(&paths.mix).unwrap(),
            split: Some((
                create_writer(&paths.mic).unwrap(),
                create_writer(&paths.system).unwrap(),
            )),
            headphone_mode,
            level: Arc::new(AtomicU32::new(0)),
            system_level: Arc::new(AtomicU32::new(0)),
        }
    }

    #[test]
    fn test_alignment_pads_a_silent_system_source_and_never_exceeds_half_a_second_of_lag() {
        let mut tracks = PendingTracks::default();
        let mut written = 0;

        for _ in 0..100 {
            tracks.mic.extend(vec![0.5; 1_600]);
            let (mic, system) = tracks.take_aligned(MAX_TRACK_LAG);
            assert_eq!(mic.len(), system.len());
            assert!(system.iter().all(|&sample| sample == 0.0));
            assert!(tracks.mic.len() <= MAX_TRACK_LAG);
            written += mic.len();
        }

        assert_eq!(written, 160_000 - MAX_TRACK_LAG);
        assert!(tracks.system.is_empty());
    }

    #[test]
    fn test_alignment_pads_a_silent_mic_source_the_same_way() {
        let mut tracks = pending(0, 40_000);

        let (mic, system) = tracks.take_aligned(MAX_TRACK_LAG);

        assert_eq!(mic, vec![0.0; 32_000]);
        assert_eq!(system, vec![0.25; 32_000]);
        assert_eq!(tracks.system.len(), MAX_TRACK_LAG);
        assert!(tracks.mic.is_empty());
    }

    #[test]
    fn test_alignment_keeps_real_samples_when_the_lag_is_within_half_a_second() {
        let mut tracks = pending(5_000, 3_000);

        let (mic, system) = tracks.take_aligned(MAX_TRACK_LAG);

        assert_eq!(mic, vec![0.5; 3_000]);
        assert_eq!(system, vec![0.25; 3_000]);
        assert_eq!(tracks.mic.len(), 2_000);
        assert!(tracks.system.is_empty());
    }

    #[test]
    fn test_alternating_pushes_write_nothing_until_both_sources_have_arrived() {
        let mut tracks = PendingTracks::default();

        for _ in 0..3 {
            tracks.mic.extend(vec![0.5; 1_600]);
            let (mic, system) = tracks.take_aligned(MAX_TRACK_LAG);
            assert!(mic.is_empty() && system.is_empty());
            assert_eq!(tracks.mic.len(), 1_600);

            tracks.system.extend(vec![0.25; 1_600]);
            let (mic, system) = tracks.take_aligned(MAX_TRACK_LAG);
            assert_eq!(mic, vec![0.5; 1_600]);
            assert_eq!(system, vec![0.25; 1_600]);
            assert!(tracks.mic.is_empty() && tracks.system.is_empty());
        }
    }

    #[test]
    fn test_flush_alignment_pads_the_shorter_track_to_the_longer_one() {
        let mut tracks = pending(5_000, 3_000);

        let (mic, system) = tracks.take_aligned(0);

        assert_eq!(mic.len(), 5_000);
        assert_eq!(system[..3_000], vec![0.25; 3_000]);
        assert_eq!(system[3_000..], vec![0.0; 2_000]);
        assert!(tracks.mic.is_empty() && tracks.system.is_empty());
    }

    #[test]
    fn test_mix_adds_both_tracks_and_clamps_to_full_scale() {
        assert_eq!(
            mix_tracks(&[0.25, 0.9, -0.9], &[0.5, 0.9, -0.9]),
            vec![0.75, 1.0, -1.0]
        );
    }

    #[test]
    fn test_source_blocks_give_exact_16khz_lengths_for_common_device_rates() {
        for sample_rate in [16_000u32, 24_000, 44_100, 48_000] {
            let mut blocks = SourceBlocks {
                channels: 2,
                sample_rate,
                raw: Vec::new(),
            };
            let ten_ms_of_stereo = vec![0.1; (sample_rate / 100 * 2) as usize];
            let mut resampled = 0;

            for _ in 0..105 {
                resampled += blocks.push(&ten_ms_of_stereo).len();
            }

            assert_eq!(resampled, 16_000, "{sample_rate} Hz");
            assert_eq!(blocks.finish().len(), 800, "{sample_rate} Hz");
        }
    }

    #[test]
    fn test_echo_gate_attenuates_the_mic_tracks_only_in_speaker_mode() {
        let dir = temp_dir();
        let paths = track_paths(&dir, "m1").unwrap();
        for (headphone_mode, expected_mic) in [(false, pcm(0.05 * 0.08)), (true, pcm(0.05))] {
            let mut writers = track_writers(&dir, headphone_mode);

            writers.write((vec![0.05; 1_600], vec![0.6; 1_600])).unwrap();
            writers.finalize().unwrap();

            assert_eq!(read_samples(&paths.mic)[0], expected_mic);
            assert_eq!(read_samples(&paths.system)[0], pcm(0.6));
        }
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_levels_follow_the_written_chunks_so_a_padded_source_reads_zero() {
        let dir = temp_dir();
        let mut writers = track_writers(&dir, true);

        writers.write((vec![0.4; 1_600], vec![0.0; 1_600])).unwrap();

        assert!(f32::from_bits(writers.level.load(Ordering::Relaxed)) > 0.0);
        assert_eq!(f32::from_bits(writers.system_level.load(Ordering::Relaxed)), 0.0);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_all_three_tracks_are_readable_live_and_end_with_equal_frame_counts() {
        let dir = temp_dir();
        let paths = track_paths(&dir, "m1").unwrap();
        let mut writers = track_writers(&dir, true);
        let mut tracks = pending(20_000, 3_000);

        writers.write(tracks.take_aligned(MAX_TRACK_LAG)).unwrap();
        for path in [&paths.mix, &paths.mic, &paths.system] {
            assert_eq!(read_samples(path).len(), 12_000);
        }
        writers.write(tracks.take_aligned(0)).unwrap();
        writers.finalize().unwrap();

        for path in [&paths.mix, &paths.mic, &paths.system] {
            assert_eq!(read_samples(path).len(), 20_000);
        }
        assert_eq!(read_samples(&paths.system)[19_999], 0);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_mic_only_writers_put_the_mic_in_the_mix_and_create_no_track_files() {
        let dir = temp_dir();
        let paths = track_paths(&dir, "m1").unwrap();
        let mut writers = TrackWriters {
            mix: create_writer(&paths.mix).unwrap(),
            split: None,
            headphone_mode: false,
            level: Arc::new(AtomicU32::new(0)),
            system_level: Arc::new(AtomicU32::new(0)),
        };

        writers.write((vec![0.05; 1_600], vec![0.0; 1_600])).unwrap();
        writers.finalize().unwrap();

        assert_eq!(read_samples(&paths.mix), vec![pcm(0.05); 1_600]);
        assert!(!paths.mic.exists() && !paths.system.exists());
        fs::remove_dir_all(&dir).unwrap();
    }
}
