use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use serde::Serialize;
use std::fs;
use std::io::{Cursor, ErrorKind};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::State;

use crate::audio::audio_engine::TARGET_STT_SAMPLE_RATE;
use crate::mic::MicRecorder;

const MAX_SLICE_SEC: f64 = 180.0;

pub struct RecordingsDir(pub PathBuf);

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecordingFile {
    pub meeting_id: String,
    pub file_name: String,
    pub wav_path: String,
    pub size_bytes: u64,
    pub created_at_ms: u64,
    pub duration_sec: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingsListing {
    recordings_dir: String,
    files: Vec<RecordingFile>,
}

pub fn stt_wav_spec() -> hound::WavSpec {
    hound::WavSpec {
        channels: 1,
        sample_rate: TARGET_STT_SAMPLE_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    }
}

pub fn recording_path(dir: &Path, meeting_id: &str) -> Result<PathBuf, String> {
    if meeting_id.is_empty() {
        return Err("invalid_meeting_id".to_string());
    }
    let safe_id: String = meeting_id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    Ok(dir.join(format!("{safe_id}.wav")))
}

#[derive(Debug, PartialEq)]
pub struct TrackPaths {
    pub mix: PathBuf,
    pub mic: PathBuf,
    pub system: PathBuf,
}

impl TrackPaths {
    fn select(&self, track: Option<&str>) -> Result<&Path, String> {
        match track {
            None => Ok(&self.mix),
            Some("mic") => Ok(&self.mic),
            Some("system") => Ok(&self.system),
            Some(_) => Err("invalid_track".to_string()),
        }
    }
}

pub fn track_paths(dir: &Path, meeting_id: &str) -> Result<TrackPaths, String> {
    let mix = recording_path(dir, meeting_id)?;
    Ok(TrackPaths {
        mic: mix.with_extension("mic.wav"),
        system: mix.with_extension("system.wav"),
        mix,
    })
}

fn wav_paths(dir: &Path) -> Result<Vec<PathBuf>, String> {
    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
    Ok(entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "wav") && path.is_file())
        .collect())
}

pub fn recording_file(path: &Path) -> Result<RecordingFile, String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    let created_at_ms = metadata
        .created()
        .or_else(|_| metadata.modified())
        .map(|t| t.duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64)
        .unwrap_or_default();
    let duration_sec = hound::WavReader::open(path)
        .map(|reader| reader.duration() as f64 / reader.spec().sample_rate as f64)
        .unwrap_or_default();

    Ok(RecordingFile {
        meeting_id: path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        file_name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        wav_path: path.to_string_lossy().into_owned(),
        size_bytes: metadata.len(),
        created_at_ms,
        duration_sec,
    })
}

fn list_wav_recordings(dir: &Path) -> Result<Vec<RecordingFile>, String> {
    let mut files: Vec<RecordingFile> = wav_paths(dir)?
        .iter()
        .filter(|path| !path.file_stem().is_some_and(|stem| stem.to_string_lossy().contains('.')))
        .filter_map(|path| recording_file(path).ok())
        .collect();
    files.sort_by(|a, b| b.created_at_ms.cmp(&a.created_at_ms));
    Ok(files)
}

fn slice_wav_base64(path: &Path, start_sec: f64, max_sec: f64) -> Result<String, String> {
    let has_invalid_range =
        !start_sec.is_finite() || !max_sec.is_finite() || start_sec < 0.0 || max_sec < 0.0;
    if has_invalid_range {
        return Err("invalid_range".to_string());
    }

    let mut reader = hound::WavReader::open(path).map_err(|e| e.to_string())?;
    if reader.spec() != stt_wav_spec() {
        return Err("unsupported_wav_format".to_string());
    }

    let rate = TARGET_STT_SAMPLE_RATE as f64;
    let total_frames = reader.duration() as u64;
    let start_frame = (start_sec * rate) as u64;
    let frame_count =
        ((max_sec.min(MAX_SLICE_SEC) * rate) as u64).min(total_frames.saturating_sub(start_frame));
    if frame_count == 0 {
        return Ok(String::new());
    }

    reader.seek(start_frame as u32).map_err(|e| e.to_string())?;
    let mut cursor = Cursor::new(Vec::new());
    let mut writer =
        hound::WavWriter::new(&mut cursor, stt_wav_spec()).map_err(|e| e.to_string())?;
    for sample in reader
        .samples::<i16>()
        .take(frame_count as usize)
        .map_while(Result::ok)
    {
        writer.write_sample(sample).map_err(|e| e.to_string())?;
    }
    writer.finalize().map_err(|e| e.to_string())?;

    Ok(BASE64_STANDARD.encode(cursor.into_inner()))
}

fn remove_wav(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Err(e) if e.kind() != ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

fn remove_recording(paths: &TrackPaths, active_wav: Option<PathBuf>) -> Result<(), String> {
    if active_wav.as_deref() == Some(paths.mix.as_path()) {
        return Err("recording_active".to_string());
    }
    [&paths.mix, &paths.mic, &paths.system]
        .into_iter()
        .try_for_each(|path| remove_wav(path))
}

fn remove_all_wavs(dir: &Path) -> Result<(), String> {
    wav_paths(dir)?.iter().try_for_each(|path| remove_wav(path))
}

#[tauri::command(async)]
pub fn read_recording_slice(
    meeting_id: String,
    start_sec: f64,
    max_sec: f64,
    track: Option<String>,
    dir: State<'_, RecordingsDir>,
) -> Result<String, String> {
    let paths = track_paths(&dir.0, &meeting_id)?;
    slice_wav_base64(paths.select(track.as_deref())?, start_sec, max_sec)
}

#[tauri::command(async)]
pub fn list_recordings(dir: State<'_, RecordingsDir>) -> Result<RecordingsListing, String> {
    Ok(RecordingsListing {
        recordings_dir: dir.0.to_string_lossy().into_owned(),
        files: list_wav_recordings(&dir.0)?,
    })
}

#[tauri::command(async)]
pub fn delete_recording(
    meeting_id: String,
    dir: State<'_, RecordingsDir>,
    recorder: State<'_, MicRecorder>,
) -> Result<(), String> {
    remove_recording(
        &track_paths(&dir.0, &meeting_id)?,
        recorder.active_wav_path(),
    )
}

#[tauri::command(async)]
pub fn delete_all_recordings(
    dir: State<'_, RecordingsDir>,
    recorder: State<'_, MicRecorder>,
) -> Result<(), String> {
    if recorder.active_wav_path().is_some() {
        return Err("recording_active".to_string());
    }
    remove_all_wavs(&dir.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mic::write_block;
    use std::thread::sleep;
    use std::time::Duration;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("summeet-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_wav(path: &Path, samples: &[i16]) {
        let mut writer = hound::WavWriter::create(path, stt_wav_spec()).unwrap();
        for &sample in samples {
            writer.write_sample(sample).unwrap();
        }
        writer.finalize().unwrap();
    }

    fn decode_slice(encoded: &str) -> (hound::WavSpec, Vec<i16>) {
        let bytes = BASE64_STANDARD.decode(encoded).unwrap();
        let mut reader = hound::WavReader::new(Cursor::new(bytes)).unwrap();
        let samples = reader.samples::<i16>().map(Result::unwrap).collect();
        (reader.spec(), samples)
    }

    #[test]
    fn test_recording_path_replaces_unsafe_characters_and_stays_in_dir() {
        let dir = Path::new("/data/recordings");

        let traversal = recording_path(dir, "../../etc/passwd").unwrap();
        assert_eq!(traversal, dir.join("______etc_passwd.wav"));
        assert_eq!(traversal.parent(), Some(dir));

        let mixed = recording_path(dir, "meeting 1/..\\x").unwrap();
        assert_eq!(mixed.file_name().unwrap(), "meeting_1____x.wav");
        assert_eq!(mixed.parent(), Some(dir));

        assert_eq!(
            recording_path(dir, "m-1_A\u{1ecd}").unwrap(),
            dir.join("m-1_A_.wav")
        );
        assert_eq!(
            recording_path(dir, ""),
            Err("invalid_meeting_id".to_string())
        );
    }

    #[test]
    fn test_track_paths_are_sanitized_and_stay_in_dir() {
        let dir = Path::new("/data/recordings");

        let traversal = track_paths(dir, "../../etc/passwd").unwrap();
        assert_eq!(traversal.mix, dir.join("______etc_passwd.wav"));
        assert_eq!(traversal.mic, dir.join("______etc_passwd.mic.wav"));
        assert_eq!(traversal.system, dir.join("______etc_passwd.system.wav"));
        for path in [&traversal.mix, &traversal.mic, &traversal.system] {
            assert_eq!(path.parent(), Some(dir));
        }

        let mixed = track_paths(dir, "meeting 1/..\\x").unwrap();
        assert_eq!(mixed.mic.file_name().unwrap(), "meeting_1____x.mic.wav");
        assert_eq!(mixed.system.file_name().unwrap(), "meeting_1____x.system.wav");
        assert_eq!(mixed.mic.parent(), Some(dir));
        assert_eq!(mixed.system.parent(), Some(dir));

        assert_eq!(track_paths(dir, ""), Err("invalid_meeting_id".to_string()));
    }

    #[test]
    fn test_select_maps_track_names_and_rejects_unknown_tracks() {
        let dir = Path::new("/data/recordings");
        let paths = track_paths(dir, "m1").unwrap();

        assert_eq!(paths.select(None).unwrap(), dir.join("m1.wav"));
        assert_eq!(paths.select(Some("mic")).unwrap(), dir.join("m1.mic.wav"));
        assert_eq!(paths.select(Some("system")).unwrap(), dir.join("m1.system.wav"));
        for track in ["", "MIC", "mix", "mic.wav", "../m1"] {
            assert_eq!(paths.select(Some(track)), Err("invalid_track".to_string()));
        }
    }

    #[test]
    fn test_system_track_slice_is_capped_and_checked_like_the_main_file() {
        let dir = temp_dir();
        let paths = track_paths(&dir, "m1").unwrap();
        write_wav(&paths.system, &vec![7; 200 * 16_000]);

        let system = paths.select(Some("system")).unwrap();
        let (spec, huge) = decode_slice(&slice_wav_base64(system, 0.0, 1e9).unwrap());
        assert_eq!(spec, stt_wav_spec());
        assert_eq!(huge.len(), 180 * 16_000);
        let (_, rest) = decode_slice(&slice_wav_base64(system, 180.0, 1e9).unwrap());
        assert_eq!(rest.len(), 20 * 16_000);
        assert_eq!(
            slice_wav_base64(system, -1.0, 1.0),
            Err("invalid_range".to_string())
        );

        let stereo = hound::WavSpec {
            channels: 2,
            sample_rate: 44_100,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(&paths.mic, stereo).unwrap();
        writer.write_sample(1i16).unwrap();
        writer.write_sample(2i16).unwrap();
        writer.finalize().unwrap();
        assert_eq!(
            slice_wav_base64(paths.select(Some("mic")).unwrap(), 0.0, 1.0),
            Err("unsupported_wav_format".to_string())
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_list_skips_track_files_and_keeps_the_mix() {
        let dir = temp_dir();
        let paths = track_paths(&dir, "m1").unwrap();
        write_wav(&paths.mix, &[0; 16]);
        write_wav(&paths.mic, &[0; 16]);
        write_wav(&paths.system, &[0; 16]);

        let files = list_wav_recordings(&dir).unwrap();

        assert_eq!(files.len(), 1);
        assert_eq!(files[0].meeting_id, "m1");
        assert_eq!(files[0].file_name, "m1.wav");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_remove_recording_deletes_all_tracks_and_refuses_while_active() {
        let dir = temp_dir();
        let paths = track_paths(&dir, "m1").unwrap();
        let other = track_paths(&dir, "m2").unwrap();
        for path in [&paths.mix, &paths.mic, &paths.system, &other.mix] {
            write_wav(path, &[0; 16]);
        }

        assert_eq!(
            remove_recording(&paths, Some(paths.mix.clone())),
            Err("recording_active".to_string())
        );
        assert!(paths.mix.exists() && paths.mic.exists() && paths.system.exists());

        remove_recording(&paths, Some(other.mix.clone())).unwrap();

        assert!(!paths.mix.exists() && !paths.mic.exists() && !paths.system.exists());
        assert!(other.mix.exists());
        remove_recording(&paths, None).unwrap();
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_slice_returns_valid_wav_while_writer_is_still_open() {
        let dir = temp_dir();
        let path = dir.join("live.wav");
        let mut writer = hound::WavWriter::create(&path, stt_wav_spec()).unwrap();
        writer.flush().unwrap();
        assert_eq!(slice_wav_base64(&path, 0.0, 5.0), Ok(String::new()));

        let tone: Vec<f32> = (0..48_000).map(|i| ((i as f32) * 0.05).sin() * 0.5).collect();
        write_block(&mut writer, &tone, 48_000).unwrap();
        write_block(&mut writer, &tone[..24_000], 48_000).unwrap();

        let first_second = slice_wav_base64(&path, 0.0, 1.0).unwrap();
        let (spec, samples) = decode_slice(&first_second);
        assert_eq!(spec, stt_wav_spec());
        assert_eq!(samples.len(), 16_000);
        assert!(samples.iter().any(|&s| s != 0));
        let bytes = BASE64_STANDARD.decode(&first_second).unwrap();
        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(&bytes[8..12], b"WAVE");
        assert_eq!(&bytes[36..40], b"data");
        assert_eq!(bytes.len(), 44 + 16_000 * 2);

        let (_, tail) = decode_slice(&slice_wav_base64(&path, 1.0, 180.0).unwrap());
        assert_eq!(tail.len(), 8_000);

        let (_, middle) = decode_slice(&slice_wav_base64(&path, 0.5, 0.25).unwrap());
        assert_eq!(middle.len(), 4_000);

        assert_eq!(slice_wav_base64(&path, 1.5, 1.0), Ok(String::new()));
        assert_eq!(slice_wav_base64(&path, 30.0, 1.0), Ok(String::new()));
        assert_eq!(slice_wav_base64(&path, 0.0, 0.0), Ok(String::new()));

        writer.finalize().unwrap();
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_slice_caps_oversized_requests_at_180_seconds() {
        let dir = temp_dir();
        let path = dir.join("long.wav");
        write_wav(&path, &vec![7; 200 * 16_000]);

        let (_, huge) = decode_slice(&slice_wav_base64(&path, 0.0, 1e9).unwrap());
        let (_, exact) = decode_slice(&slice_wav_base64(&path, 0.0, 180.0).unwrap());
        let (_, rest) = decode_slice(&slice_wav_base64(&path, 180.0, 1e9).unwrap());

        assert_eq!(huge.len(), 180 * 16_000);
        assert_eq!(exact.len(), 180 * 16_000);
        assert_eq!(rest.len(), 20 * 16_000);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_slice_matches_source_samples_at_offset() {
        let dir = temp_dir();
        let path = dir.join("ramp.wav");
        let ramp: Vec<i16> = (0..32_000).map(|i| (i % 30_000) as i16).collect();
        write_wav(&path, &ramp);

        let (_, samples) = decode_slice(&slice_wav_base64(&path, 0.5, 0.1).unwrap());

        assert_eq!(samples, ramp[8_000..9_600]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_slice_rejects_invalid_range_and_unsupported_format() {
        let dir = temp_dir();
        let path = dir.join("ok.wav");
        write_wav(&path, &[1, 2, 3]);

        for (start, max) in [(-1.0, 1.0), (0.0, -1.0), (f64::NAN, 1.0), (0.0, f64::INFINITY)] {
            assert_eq!(
                slice_wav_base64(&path, start, max),
                Err("invalid_range".to_string())
            );
        }

        let stereo = dir.join("stereo.wav");
        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: 44_100,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(&stereo, spec).unwrap();
        writer.write_sample(1i16).unwrap();
        writer.write_sample(2i16).unwrap();
        writer.finalize().unwrap();
        assert_eq!(
            slice_wav_base64(&stereo, 0.0, 1.0),
            Err("unsupported_wav_format".to_string())
        );

        assert!(slice_wav_base64(&dir.join("missing.wav"), 0.0, 1.0).is_err());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_list_returns_only_wav_files_newest_first_with_duration() {
        let dir = temp_dir();
        write_wav(&dir.join("older.wav"), &vec![0; 16_000]);
        sleep(Duration::from_millis(30));
        write_wav(&dir.join("newer.wav"), &vec![0; 32_000]);
        fs::write(dir.join("notes.txt"), "keep").unwrap();
        fs::write(dir.join("audio.wav.bak"), "keep").unwrap();
        fs::create_dir(dir.join("folder.wav")).unwrap();

        let files = list_wav_recordings(&dir).unwrap();

        assert_eq!(
            files.iter().map(|f| f.meeting_id.as_str()).collect::<Vec<_>>(),
            ["newer", "older"]
        );
        assert_eq!(files[0].file_name, "newer.wav");
        assert_eq!(files[0].wav_path, dir.join("newer.wav").to_string_lossy());
        assert_eq!(files[0].duration_sec, 2.0);
        assert_eq!(files[1].duration_sec, 1.0);
        assert_eq!(files[0].size_bytes, 44 + 64_000);
        assert!(files[0].created_at_ms >= files[1].created_at_ms);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_recording_file_serializes_camel_case_keys() {
        let dir = temp_dir();
        write_wav(&dir.join("a.wav"), &[0; 16]);

        let json = serde_json::to_value(recording_file(&dir.join("a.wav")).unwrap()).unwrap();

        let mut keys: Vec<&str> = json.as_object().unwrap().keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(
            keys,
            ["createdAtMs", "durationSec", "fileName", "meetingId", "sizeBytes", "wavPath"]
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_remove_wav_and_delete_all_touch_only_wav_files() {
        let dir = temp_dir();
        write_wav(&dir.join("a.wav"), &[0; 16]);
        write_wav(&dir.join("b.wav"), &[0; 16]);
        fs::write(dir.join("keep.txt"), "keep").unwrap();
        fs::create_dir(dir.join("folder.wav")).unwrap();

        remove_wav(&recording_path(&dir, "a").unwrap()).unwrap();
        remove_wav(&recording_path(&dir, "never-existed").unwrap()).unwrap();
        assert!(!dir.join("a.wav").exists());
        assert!(dir.join("b.wav").exists());

        remove_all_wavs(&dir).unwrap();

        assert!(!dir.join("b.wav").exists());
        assert!(dir.join("keep.txt").exists());
        assert!(dir.join("folder.wav").is_dir());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_remove_all_wavs_removes_mix_mic_and_system_track_files() {
        let dir = temp_dir();
        let paths = track_paths(&dir, "m1").unwrap();
        for path in [&paths.mix, &paths.mic, &paths.system] {
            write_wav(path, &[0; 16]);
        }
        fs::write(dir.join("keep.txt"), "keep").unwrap();

        remove_all_wavs(&dir).unwrap();

        assert!(wav_paths(&dir).unwrap().is_empty());
        assert!(dir.join("keep.txt").exists());
        fs::remove_dir_all(&dir).unwrap();
    }
}
