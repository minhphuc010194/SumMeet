use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::recordings::RecordingsDir;

const MAX_EXPORT_BYTES: usize = 64 * 1024 * 1024;
const MAX_EXPORT_BASE64_LEN: usize = MAX_EXPORT_BYTES.div_ceil(3) * 4;
const MAX_STEM_CHARS: usize = 120;
const MAX_COLLISION_ATTEMPTS: u32 = 1000;

pub struct DownloadsDir(pub Option<PathBuf>);

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportPrefsFile {
    last_export_dir: Option<String>,
}

pub struct ExportPrefsStore {
    prefs_path: PathBuf,
    last_export_dir: Mutex<Option<PathBuf>>,
}

impl ExportPrefsStore {
    pub fn new(prefs_path: PathBuf) -> Self {
        let initial = read_saved_export_dir(&prefs_path);
        Self {
            prefs_path,
            last_export_dir: Mutex::new(initial),
        }
    }

    pub fn resolve_initial_dir(&self, downloads_dir: Option<&Path>) -> Option<PathBuf> {
        let saved = self
            .last_export_dir
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        if let Some(dir) = saved {
            if dir.is_dir() {
                return Some(dir);
            }
        }
        if let Some(dl) = downloads_dir {
            if dl.is_dir() {
                return Some(dl.to_path_buf());
            }
        }
        None
    }

    pub fn record_saved_dir(&self, dir: &Path) {
        if !dir.is_dir() {
            return;
        }
        let dir_buf = dir.to_path_buf();
        let mut guard = self
            .last_export_dir
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        *guard = Some(dir_buf.clone());
        let payload = match serde_json::to_vec(&ExportPrefsFile {
            last_export_dir: Some(dir_buf.to_string_lossy().into_owned()),
        }) {
            Ok(bytes) => bytes,
            Err(e) => {
                eprintln!("[ExportPrefs] Persist failed: {e}");
                return;
            }
        };
        if let Err(e) = write_bytes_atomic(&self.prefs_path, &payload) {
            eprintln!("[ExportPrefs] Persist failed: {e}");
        }
    }
}

fn read_saved_export_dir(prefs_path: &Path) -> Option<PathBuf> {
    let raw = match fs::read_to_string(prefs_path) {
        Ok(content) => content,
        Err(e) if e.kind() == ErrorKind::NotFound => return None,
        Err(e) => {
            eprintln!("[ExportPrefs] Read failed: {e}");
            return None;
        }
    };
    let parsed: ExportPrefsFile = match serde_json::from_str(&raw) {
        Ok(data) => data,
        Err(e) => {
            eprintln!("[ExportPrefs] Parse failed: {e}");
            return None;
        }
    };
    let dir_str = parsed.last_export_dir?;
    if dir_str.trim().is_empty() {
        return None;
    }
    Some(PathBuf::from(dir_str))
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExportedFile {
    pub file_name: String,
    pub saved_path: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SaveDialogRequest {
    pub initial_dir: Option<PathBuf>,
    pub default_file_name: String,
    pub filter_label: &'static str,
    pub ext: &'static str,
}

#[derive(Clone, Copy)]
struct ExportDialogContext<'a> {
    downloads_dir: Option<&'a Path>,
    prefs: &'a ExportPrefsStore,
}

struct SaveExportInput<'a> {
    ctx: ExportDialogContext<'a>,
    file_name: &'a str,
    format: &'a str,
    content_base64: &'a str,
}

struct AudioExportInput<'a> {
    ctx: ExportDialogContext<'a>,
    recordings_dir: &'a Path,
    meeting_id: &'a str,
    suggested_stem: Option<&'a str>,
}

fn validate_export_format(format: &str) -> Result<(&'static str, &'static str), String> {
    match format {
        "md" => Ok(("md", "Markdown")),
        "pdf" => Ok(("pdf", "PDF")),
        "wav" => Ok(("wav", "WAV Audio")),
        "mp3" => Ok(("mp3", "MP3 Audio")),
        "aac" => Ok(("aac", "AAC Audio")),
        "m4a" => Ok(("m4a", "M4A Audio")),
        "ogg" => Ok(("ogg", "OGG Audio")),
        "flac" => Ok(("flac", "FLAC Audio")),
        _ => Err("invalid_export_format".to_string()),
    }
}

fn is_windows_reserved_name(stem: &str) -> bool {
    let upper = stem.to_ascii_uppercase();
    matches!(
        upper.as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    )
}

pub fn sanitize_export_stem(raw: &str) -> Result<String, String> {
    let mut mapped = String::with_capacity(raw.len());
    let mut can_attach_mark = false;
    for c in raw.chars() {
        let is_combining_mark = ('\u{0300}'..='\u{036F}').contains(&c);
        let is_attached_mark = is_combining_mark && can_attach_mark;
        if c.is_alphanumeric() || is_attached_mark {
            mapped.push(c);
            can_attach_mark = true;
        } else if matches!(c, ' ' | '_' | '-') {
            mapped.push(c);
            can_attach_mark = false;
        } else {
            mapped.push('_');
            can_attach_mark = false;
        }
    }
    let trimmed = mapped.trim_matches(|c| matches!(c, ' ' | '_'));
    let capped: String = trimmed.chars().take(MAX_STEM_CHARS).collect();
    let stem = capped.trim_matches(|c| matches!(c, ' ' | '_')).to_string();
    if stem.is_empty() {
        return Err("invalid_file_name".to_string());
    }
    if is_windows_reserved_name(&stem) {
        return Ok(format!("_{stem}"));
    }
    Ok(stem)
}

fn non_empty_parent(path: &Path) -> Option<&Path> {
    let parent = path.parent()?;
    if parent.as_os_str().is_empty() {
        return None;
    }
    Some(parent)
}

fn create_sibling_temp_file(parent: &Path) -> Result<(fs::File, PathBuf), String> {
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temp_path = parent.join(format!(".summeet-export-{}.tmp", uuid::Uuid::new_v4()));
    let file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp_path)
        .map_err(|e| e.to_string())?;
    Ok((file, temp_path))
}

fn write_bytes_atomic(target_path: &Path, bytes: &[u8]) -> Result<u64, String> {
    let Some(parent) = non_empty_parent(target_path) else {
        return Err("invalid_file_name".to_string());
    };
    let (mut temp_file, temp_path) = create_sibling_temp_file(parent)?;
    if let Err(e) = temp_file.write_all(bytes).and_then(|_| temp_file.flush()) {
        drop(temp_file);
        let _ = fs::remove_file(&temp_path);
        return Err(e.to_string());
    }
    drop(temp_file);
    if let Err(e) = fs::rename(&temp_path, target_path) {
        let _ = fs::remove_file(&temp_path);
        return Err(e.to_string());
    }
    Ok(bytes.len() as u64)
}

fn copy_reader_atomic(target_path: &Path, mut source: fs::File) -> Result<u64, String> {
    let Some(parent) = non_empty_parent(target_path) else {
        return Err("invalid_file_name".to_string());
    };
    let (mut temp_file, temp_path) = create_sibling_temp_file(parent)?;
    let size_bytes = match std::io::copy(&mut source, &mut temp_file).and_then(|n| {
        temp_file.flush()?;
        Ok(n)
    }) {
        Ok(n) => n,
        Err(e) => {
            drop(temp_file);
            let _ = fs::remove_file(&temp_path);
            return Err(e.to_string());
        }
    };
    drop(source);
    drop(temp_file);
    if let Err(e) = fs::rename(&temp_path, target_path) {
        let _ = fs::remove_file(&temp_path);
        return Err(e.to_string());
    }
    Ok(size_bytes)
}

fn resolve_dialog_target_path(chosen_path: PathBuf, ext: &str) -> Result<PathBuf, String> {
    if chosen_path.as_os_str().is_empty() {
        return Err("invalid_file_name".to_string());
    }
    let path_str = chosen_path.to_string_lossy();
    let has_trailing_sep = path_str.ends_with('/') || path_str.ends_with('\\');
    let ends_with_dot_dir = path_str.ends_with("/.") || path_str.ends_with("\\.");
    let is_directory_target = has_trailing_sep || ends_with_dot_dir || chosen_path.is_dir();
    if is_directory_target {
        return Err("invalid_file_name".to_string());
    }
    let Some(parent) = non_empty_parent(&chosen_path) else {
        return Err("invalid_file_name".to_string());
    };
    let Some(raw_name) = chosen_path.file_name() else {
        return Err("invalid_file_name".to_string());
    };
    let file_name_lossy = raw_name.to_string_lossy();
    if file_name_lossy.trim().is_empty() {
        return Err("invalid_file_name".to_string());
    }

    let has_matching_ext = chosen_path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case(ext));
    if has_matching_ext {
        return Ok(chosen_path);
    }

    for attempt in 0..MAX_COLLISION_ATTEMPTS {
        let candidate_name = if attempt == 0 {
            format!("{file_name_lossy}.{ext}")
        } else {
            format!("{file_name_lossy} ({attempt}).{ext}")
        };
        let candidate = parent.join(candidate_name);
        if candidate.is_dir() {
            continue;
        }
        match fs::symlink_metadata(&candidate) {
            Ok(_) => continue,
            Err(e) if e.kind() == ErrorKind::NotFound => return Ok(candidate),
            Err(e) => return Err(e.to_string()),
        }
    }
    Err("export_collision_limit".to_string())
}

fn build_exported_file(target_path: &Path, size_bytes: u64) -> ExportedFile {
    ExportedFile {
        file_name: target_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        saved_path: target_path.to_string_lossy().into_owned(),
        size_bytes,
    }
}

fn prompt_save_dialog(
    app: &AppHandle,
    request: SaveDialogRequest,
) -> Result<Option<PathBuf>, String> {
    let mut dialog = app
        .dialog()
        .file()
        .set_file_name(&request.default_file_name)
        .add_filter(request.filter_label, &[request.ext]);
    if let Some(ref dir) = request.initial_dir {
        dialog = dialog.set_directory(dir);
    }
    #[cfg(desktop)]
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }
    match dialog.blocking_save_file() {
        Some(fp) => Ok(Some(fp.into_path().map_err(|e| e.to_string())?)),
        None => Ok(None),
    }
}

fn save_export_with_picker<F>(
    input: SaveExportInput<'_>,
    picker: F,
) -> Result<Option<ExportedFile>, String>
where
    F: FnOnce(SaveDialogRequest) -> Result<Option<PathBuf>, String>,
{
    let (ext, filter_label) = validate_export_format(input.format)?;
    let stem = sanitize_export_stem(input.file_name)?;
    if input.content_base64.len() > MAX_EXPORT_BASE64_LEN {
        return Err("export_too_large".to_string());
    }
    let bytes = BASE64_STANDARD
        .decode(input.content_base64)
        .map_err(|e| e.to_string())?;
    if bytes.len() > MAX_EXPORT_BYTES {
        return Err("export_too_large".to_string());
    }
    if ext == "pdf" && !bytes.starts_with(b"%PDF-") {
        return Err("invalid_pdf_data".to_string());
    }

    let request = SaveDialogRequest {
        initial_dir: input.ctx.prefs.resolve_initial_dir(input.ctx.downloads_dir),
        default_file_name: format!("{stem}.{ext}"),
        filter_label,
        ext,
    };
    let Some(chosen_path) = picker(request)? else {
        return Ok(None);
    };
    let target_path = resolve_dialog_target_path(chosen_path, ext)?;
    if target_path.is_dir() {
        return Err("invalid_file_name".to_string());
    }
    let size_bytes = write_bytes_atomic(&target_path, &bytes)?;
    if let Some(parent) = non_empty_parent(&target_path) {
        input.ctx.prefs.record_saved_dir(parent);
    }
    Ok(Some(build_exported_file(&target_path, size_bytes)))
}

fn export_recording_with_picker<F>(
    input: AudioExportInput<'_>,
    picker: F,
) -> Result<Option<ExportedFile>, String>
where
    F: FnOnce(SaveDialogRequest) -> Result<Option<PathBuf>, String>,
{
    let source_path = crate::recordings::recording_path(input.recordings_dir, input.meeting_id)?;
    let source = fs::File::open(&source_path).map_err(|e| {
        if e.kind() == ErrorKind::NotFound {
            "recording_not_found".to_string()
        } else {
            e.to_string()
        }
    })?;
    let raw_stem = input.suggested_stem.unwrap_or(input.meeting_id);
    let stem = sanitize_export_stem(raw_stem)?;
    let (ext, filter_label) = validate_export_format("wav")?;

    let request = SaveDialogRequest {
        initial_dir: input.ctx.prefs.resolve_initial_dir(input.ctx.downloads_dir),
        default_file_name: format!("{stem}.{ext}"),
        filter_label,
        ext,
    };
    let Some(chosen_path) = picker(request)? else {
        return Ok(None);
    };
    let target_path = resolve_dialog_target_path(chosen_path, ext)?;
    if target_path.is_dir() {
        return Err("invalid_file_name".to_string());
    }
    let size_bytes = copy_reader_atomic(&target_path, source)?;
    if let Some(parent) = non_empty_parent(&target_path) {
        input.ctx.prefs.record_saved_dir(parent);
    }
    Ok(Some(build_exported_file(&target_path, size_bytes)))
}

#[tauri::command(async)]
pub fn save_export_file(
    app: AppHandle,
    file_name: String,
    format: String,
    content_base64: String,
    downloads: State<'_, DownloadsDir>,
    prefs: State<'_, ExportPrefsStore>,
) -> Result<Option<ExportedFile>, String> {
    save_export_with_picker(
        SaveExportInput {
            ctx: ExportDialogContext {
                downloads_dir: downloads.0.as_deref(),
                prefs: &prefs,
            },
            file_name: &file_name,
            format: &format,
            content_base64: &content_base64,
        },
        |request| prompt_save_dialog(&app, request),
    )
}

#[tauri::command(async)]
pub fn export_recording_audio(
    app: AppHandle,
    meeting_id: String,
    suggested_stem: Option<String>,
    recordings: State<'_, RecordingsDir>,
    downloads: State<'_, DownloadsDir>,
    prefs: State<'_, ExportPrefsStore>,
) -> Result<Option<ExportedFile>, String> {
    export_recording_with_picker(
        AudioExportInput {
            ctx: ExportDialogContext {
                downloads_dir: downloads.0.as_deref(),
                prefs: &prefs,
            },
            recordings_dir: &recordings.0,
            meeting_id: &meeting_id,
            suggested_stem: suggested_stem.as_deref(),
        },
        |request| prompt_save_dialog(&app, request),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("summeet-export-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn test_sanitize_export_stem_blocks_traversal_dotfiles_control_chars_and_preserves_vietnamese() {
        assert_eq!(
            sanitize_export_stem("../../etc/passwd").unwrap(),
            "etc_passwd"
        );
        assert_eq!(sanitize_export_stem(".bashrc").unwrap(), "bashrc");
        assert_eq!(
            sanitize_export_stem("C:\\Users\\admin:secret\0\nfile").unwrap(),
            "C__Users_admin_secret__file"
        );
        assert_eq!(
            sanitize_export_stem("  __Họp Quý 4 - Tổng kết Đề án 2026__  ").unwrap(),
            "Họp Quý 4 - Tổng kết Đề án 2026"
        );

        for invalid in ["", "   ", "...", "///", "\\\\", "\0\r\n"] {
            assert_eq!(
                sanitize_export_stem(invalid),
                Err("invalid_file_name".to_string())
            );
        }

        let long_vn = "Đánh_giá_".repeat(30);
        let capped = sanitize_export_stem(&long_vn).unwrap();
        assert!(capped.chars().count() <= MAX_STEM_CHARS);
        assert!(!capped.ends_with('_'));
    }

    #[test]
    fn test_sanitize_export_stem_prefixes_windows_reserved_device_names() {
        for reserved in [
            "CON", "con", "PRN", "Aux", "nul", "COM1", "com9", "LPT1", "lpt9", "  con  ",
        ] {
            let sanitized = sanitize_export_stem(reserved).unwrap();
            assert!(sanitized.starts_with('_'));
        }
        assert_eq!(sanitize_export_stem("CONSOLE").unwrap(), "CONSOLE");
        assert_eq!(sanitize_export_stem("COM10").unwrap(), "COM10");
    }

    #[test]
    fn test_sanitize_export_stem_preserves_nfd_vietnamese_and_blocks_leading_combining_marks() {
        assert_eq!(
            sanitize_export_stem("Ba\u{0301}o ca\u{0301}o ky\u{0303} thua\u{0323}\u{0302}t")
                .unwrap(),
            "Ba\u{0301}o ca\u{0301}o ky\u{0303} thua\u{0323}\u{0302}t"
        );
        assert_eq!(
            sanitize_export_stem("\u{0301}\u{0302}Ba\u{0301}o ca\u{0301}o").unwrap(),
            "Ba\u{0301}o ca\u{0301}o"
        );
        assert_eq!(
            sanitize_export_stem("   _\u{0301}Hop_\u{0300}tuan").unwrap(),
            "Hop__tuan"
        );
        assert_eq!(
            sanitize_export_stem("\u{0301}\u{0302}\u{0323}"),
            Err("invalid_file_name".to_string())
        );
    }

    #[test]
    fn test_export_prefs_defaults_to_downloads_persists_across_restarts_and_falls_back_when_deleted() {
        let app_data_dir = temp_dir();
        let downloads_dir = temp_dir();
        let custom_dir = temp_dir();
        let prefs_path = app_data_dir.join("export_prefs.json");

        let store = ExportPrefsStore::new(prefs_path.clone());
        assert_eq!(
            store.resolve_initial_dir(Some(&downloads_dir)),
            Some(downloads_dir.clone())
        );
        assert_eq!(store.resolve_initial_dir(None), None);

        let ctx = ExportDialogContext {
            downloads_dir: Some(&downloads_dir),
            prefs: &store,
        };
        let mut seen_requests = Vec::new();
        let first = save_export_with_picker(
            SaveExportInput {
                ctx,
                file_name: "Biên bản họp_2026-11-05_14-00",
                format: "md",
                content_base64: &BASE64_STANDARD.encode("Nội dung 1".as_bytes()),
            },
            |req| {
                seen_requests.push(req);
                Ok(Some(custom_dir.join("Custom Notes.md")))
            },
        )
        .unwrap()
        .unwrap();

        assert_eq!(
            seen_requests[0],
            SaveDialogRequest {
                initial_dir: Some(downloads_dir.clone()),
                default_file_name: "Biên bản họp_2026-11-05_14-00.md".to_string(),
                filter_label: "Markdown",
                ext: "md",
            }
        );
        assert_eq!(first.file_name, "Custom Notes.md");
        assert_eq!(
            first.saved_path,
            custom_dir.join("Custom Notes.md").to_string_lossy()
        );
        assert_eq!(
            fs::read_to_string(&first.saved_path).unwrap(),
            "Nội dung 1"
        );

        let persisted: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&prefs_path).unwrap()).unwrap();
        assert_eq!(
            persisted["lastExportDir"].as_str(),
            Some(custom_dir.to_string_lossy().as_ref())
        );

        let second = save_export_with_picker(
            SaveExportInput {
                ctx,
                file_name: "Next",
                format: "md",
                content_base64: &BASE64_STANDARD.encode(b"# Next"),
            },
            |req| {
                seen_requests.push(req);
                Ok(None)
            },
        )
        .unwrap();
        assert!(second.is_none());
        assert_eq!(seen_requests[1].initial_dir, Some(custom_dir.clone()));

        let reloaded = ExportPrefsStore::new(prefs_path.clone());
        assert_eq!(
            reloaded.resolve_initial_dir(Some(&downloads_dir)),
            Some(custom_dir.clone())
        );

        fs::remove_dir_all(&custom_dir).unwrap();
        assert_eq!(
            reloaded.resolve_initial_dir(Some(&downloads_dir)),
            Some(downloads_dir.clone())
        );
        assert_eq!(reloaded.resolve_initial_dir(None), None);

        fs::write(&prefs_path, b"{malformed-json").unwrap();
        let malformed_store = ExportPrefsStore::new(prefs_path.clone());
        assert_eq!(
            malformed_store.resolve_initial_dir(Some(&downloads_dir)),
            Some(downloads_dir.clone())
        );

        fs::write(&prefs_path, br#"{"lastExportDir":"   "}"#).unwrap();
        let empty_store = ExportPrefsStore::new(prefs_path);
        assert_eq!(
            empty_store.resolve_initial_dir(Some(&downloads_dir)),
            Some(downloads_dir.clone())
        );

        fs::remove_dir_all(&app_data_dir).unwrap();
        fs::remove_dir_all(&downloads_dir).unwrap();
    }

    #[test]
    fn test_cancel_in_save_and_audio_dialogs_writes_no_files_and_preserves_last_export_dir() {
        let app_data_dir = temp_dir();
        let downloads_dir = temp_dir();
        let saved_dir = temp_dir();
        let untouched_dir = temp_dir();
        let recordings_dir = temp_dir();
        let prefs_path = app_data_dir.join("export_prefs.json");
        let store = ExportPrefsStore::new(prefs_path.clone());
        store.record_saved_dir(&saved_dir);

        let source_wav =
            crate::recordings::recording_path(&recordings_dir, "mtg-2026-11-05_12-00-00-123")
                .unwrap();
        fs::write(&source_wav, b"RIFF-wav-bytes").unwrap();

        let ctx = ExportDialogContext {
            downloads_dir: Some(&downloads_dir),
            prefs: &store,
        };
        let md_cancelled = save_export_with_picker(
            SaveExportInput {
                ctx,
                file_name: "Summary",
                format: "md",
                content_base64: &BASE64_STANDARD.encode(b"# Cancelled"),
            },
            |req| {
                assert_eq!(req.initial_dir, Some(saved_dir.clone()));
                Ok(None)
            },
        )
        .unwrap();
        assert_eq!(md_cancelled, None);

        let audio_cancelled = export_recording_with_picker(
            AudioExportInput {
                ctx,
                recordings_dir: &recordings_dir,
                meeting_id: "mtg-2026-11-05_12-00-00-123",
                suggested_stem: Some("Họp Sprint"),
            },
            |req| {
                assert_eq!(req.initial_dir, Some(saved_dir.clone()));
                assert_eq!(req.default_file_name, "Họp Sprint.wav");
                assert_eq!(req.filter_label, "WAV Audio");
                assert_eq!(req.ext, "wav");
                Ok(None)
            },
        )
        .unwrap();
        assert_eq!(audio_cancelled, None);

        assert!(fs::read_dir(&untouched_dir).unwrap().next().is_none());
        assert!(fs::read_dir(&saved_dir).unwrap().next().is_none());
        assert_eq!(
            store.resolve_initial_dir(Some(&downloads_dir)),
            Some(saved_dir.clone())
        );

        fs::remove_dir_all(&app_data_dir).unwrap();
        fs::remove_dir_all(&downloads_dir).unwrap();
        fs::remove_dir_all(&saved_dir).unwrap();
        fs::remove_dir_all(&untouched_dir).unwrap();
        fs::remove_dir_all(&recordings_dir).unwrap();
    }

    #[test]
    fn test_extension_enforcement_appends_missing_ext_guards_unconfirmed_collision_and_replaces_exact_path() {
        let app_data_dir = temp_dir();
        let custom_dir = temp_dir();
        let recordings_dir = temp_dir();
        let store = ExportPrefsStore::new(app_data_dir.join("export_prefs.json"));
        let ctx = ExportDialogContext {
            downloads_dir: None,
            prefs: &store,
        };

        let pdf_v1 = b"%PDF-1.4\nv1\n%%EOF";
        let pdf_v2 = b"%PDF-1.4\nv2-non-overwriting\n%%EOF";
        let pdf_v3 = b"%PDF-1.4\nv3-confirmed-replace\n%%EOF";

        let first_pdf = save_export_with_picker(
            SaveExportInput {
                ctx,
                file_name: "Summary",
                format: "pdf",
                content_base64: &BASE64_STANDARD.encode(pdf_v1),
            },
            |req| {
                assert_eq!(req.filter_label, "PDF");
                assert_eq!(req.ext, "pdf");
                Ok(Some(custom_dir.join("Report")))
            },
        )
        .unwrap()
        .unwrap();
        assert_eq!(first_pdf.file_name, "Report.pdf");
        assert_eq!(fs::read(custom_dir.join("Report.pdf")).unwrap(), pdf_v1);

        let collided_pdf = save_export_with_picker(
            SaveExportInput {
                ctx,
                file_name: "Summary",
                format: "pdf",
                content_base64: &BASE64_STANDARD.encode(pdf_v2),
            },
            |_| Ok(Some(custom_dir.join("Report"))),
        )
        .unwrap()
        .unwrap();
        assert_eq!(collided_pdf.file_name, "Report (1).pdf");
        assert_eq!(fs::read(custom_dir.join("Report.pdf")).unwrap(), pdf_v1);
        assert_eq!(fs::read(custom_dir.join("Report (1).pdf")).unwrap(), pdf_v2);

        let replaced_pdf = save_export_with_picker(
            SaveExportInput {
                ctx,
                file_name: "Summary",
                format: "pdf",
                content_base64: &BASE64_STANDARD.encode(pdf_v3),
            },
            |_| Ok(Some(custom_dir.join("Report.pdf"))),
        )
        .unwrap()
        .unwrap();
        assert_eq!(replaced_pdf.file_name, "Report.pdf");
        assert_eq!(replaced_pdf.size_bytes, pdf_v3.len() as u64);
        assert_eq!(fs::read(custom_dir.join("Report.pdf")).unwrap(), pdf_v3);

        let upper_ext = save_export_with_picker(
            SaveExportInput {
                ctx,
                file_name: "Summary",
                format: "md",
                content_base64: &BASE64_STANDARD.encode(b"# Upper"),
            },
            |_| Ok(Some(custom_dir.join("Notes.MD"))),
        )
        .unwrap()
        .unwrap();
        assert_eq!(upper_ext.file_name, "Notes.MD");

        let stripped_md = save_export_with_picker(
            SaveExportInput {
                ctx,
                file_name: "Summary",
                format: "md",
                content_base64: &BASE64_STANDARD.encode(b"# Stripped"),
            },
            |_| Ok(Some(custom_dir.join("NotesPlain"))),
        )
        .unwrap()
        .unwrap();
        assert_eq!(stripped_md.file_name, "NotesPlain.md");

        for (audio_ext, expected_label) in [
            ("wav", "WAV Audio"),
            ("mp3", "MP3 Audio"),
            ("aac", "AAC Audio"),
            ("m4a", "M4A Audio"),
            ("ogg", "OGG Audio"),
            ("flac", "FLAC Audio"),
        ] {
            let exported = save_export_with_picker(
                SaveExportInput {
                    ctx,
                    file_name: "upload",
                    format: audio_ext,
                    content_base64: &BASE64_STANDARD.encode(b"audio-bytes"),
                },
                |req| {
                    assert_eq!(req.filter_label, expected_label);
                    Ok(Some(custom_dir.join(format!("clip-{audio_ext}"))))
                },
            )
            .unwrap()
            .unwrap();
            assert_eq!(exported.file_name, format!("clip-{audio_ext}.{audio_ext}"));
        }

        let wav_bytes: Vec<u8> = (0..=255).cycle().take(4096).collect();
        let source_wav =
            crate::recordings::recording_path(&recordings_dir, "mtg-2026-11-05_12-00-00-123")
                .unwrap();
        fs::write(&source_wav, &wav_bytes).unwrap();

        let exported_wav = export_recording_with_picker(
            AudioExportInput {
                ctx,
                recordings_dir: &recordings_dir,
                meeting_id: "mtg-2026-11-05_12-00-00-123",
                suggested_stem: None,
            },
            |req| {
                assert_eq!(req.default_file_name, "mtg-2026-11-05_12-00-00-123.wav");
                Ok(Some(custom_dir.join("StrippedAudio")))
            },
        )
        .unwrap()
        .unwrap();
        assert_eq!(exported_wav.file_name, "StrippedAudio.wav");
        assert_eq!(exported_wav.size_bytes, wav_bytes.len() as u64);
        assert_eq!(fs::read(&exported_wav.saved_path).unwrap(), wav_bytes);

        for bad_chosen in [
            PathBuf::new(),
            PathBuf::from("relative.md"),
            custom_dir.clone(),
            PathBuf::from(format!("{}/", custom_dir.to_string_lossy())),
        ] {
            assert_eq!(
                resolve_dialog_target_path(bad_chosen, "md"),
                Err("invalid_file_name".to_string())
            );
        }

        let leftover_temps = fs::read_dir(&custom_dir)
            .unwrap()
            .filter_map(Result::ok)
            .any(|e| e.file_name().to_string_lossy().starts_with(".summeet-export-"));
        assert!(!leftover_temps);

        fs::remove_dir_all(&app_data_dir).unwrap();
        fs::remove_dir_all(&custom_dir).unwrap();
        fs::remove_dir_all(&recordings_dir).unwrap();
    }

    #[test]
    fn test_resolve_dialog_target_path_stops_after_max_collision_attempts() {
        let dir = temp_dir();
        for attempt in 0..MAX_COLLISION_ATTEMPTS {
            let name = if attempt == 0 {
                "dup.md".to_string()
            } else {
                format!("dup ({attempt}).md")
            };
            fs::write(dir.join(name), b"x").unwrap();
        }

        let err = resolve_dialog_target_path(dir.join("dup"), "md");
        assert_eq!(err, Err("export_collision_limit".to_string()));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_pre_dialog_validation_rejects_invalid_inputs_without_opening_picker() {
        let app_data_dir = temp_dir();
        let downloads_dir = temp_dir();
        let recordings_dir = temp_dir();
        let store = ExportPrefsStore::new(app_data_dir.join("export_prefs.json"));
        let ctx = ExportDialogContext {
            downloads_dir: Some(&downloads_dir),
            prefs: &store,
        };
        let valid_md = BASE64_STANDARD.encode(b"# Summary");
        let picker_calls = std::cell::Cell::new(0usize);

        for bad_format in ["exe", "sh", "html", "js", "bat", ".md", "MD", ""] {
            assert_eq!(
                save_export_with_picker(
                    SaveExportInput {
                        ctx,
                        file_name: "notes",
                        format: bad_format,
                        content_base64: &valid_md,
                    },
                    |_| {
                        picker_calls.set(picker_calls.get() + 1);
                        Ok(None)
                    },
                ),
                Err("invalid_export_format".to_string())
            );
        }

        for bad_stem in ["", "   ", "...", "///"] {
            assert_eq!(
                save_export_with_picker(
                    SaveExportInput {
                        ctx,
                        file_name: bad_stem,
                        format: "md",
                        content_base64: &valid_md,
                    },
                    |_| {
                        picker_calls.set(picker_calls.get() + 1);
                        Ok(None)
                    },
                ),
                Err("invalid_file_name".to_string())
            );
        }

        let oversized_b64 = "A".repeat(MAX_EXPORT_BASE64_LEN + 4);
        assert_eq!(
            save_export_with_picker(
                SaveExportInput {
                    ctx,
                    file_name: "huge",
                    format: "md",
                    content_base64: &oversized_b64,
                },
                |_| {
                    picker_calls.set(picker_calls.get() + 1);
                    Ok(None)
                },
            ),
            Err("export_too_large".to_string())
        );

        let unpadded_over_max = BASE64_STANDARD.encode(vec![0u8; MAX_EXPORT_BYTES + 1]);
        assert_eq!(unpadded_over_max.len(), MAX_EXPORT_BASE64_LEN);
        assert_eq!(
            save_export_with_picker(
                SaveExportInput {
                    ctx,
                    file_name: "huge-decoded",
                    format: "wav",
                    content_base64: &unpadded_over_max,
                },
                |_| {
                    picker_calls.set(picker_calls.get() + 1);
                    Ok(None)
                },
            ),
            Err("export_too_large".to_string())
        );

        assert!(save_export_with_picker(
            SaveExportInput {
                ctx,
                file_name: "bad-b64",
                format: "md",
                content_base64: "%%%not-base64%%%",
            },
            |_| {
                picker_calls.set(picker_calls.get() + 1);
                Ok(None)
            },
        )
        .is_err());

        assert_eq!(
            save_export_with_picker(
                SaveExportInput {
                    ctx,
                    file_name: "report",
                    format: "pdf",
                    content_base64: &BASE64_STANDARD.encode(b"NOT-A-PDF"),
                },
                |_| {
                    picker_calls.set(picker_calls.get() + 1);
                    Ok(None)
                },
            ),
            Err("invalid_pdf_data".to_string())
        );

        assert_eq!(
            export_recording_with_picker(
                AudioExportInput {
                    ctx,
                    recordings_dir: &recordings_dir,
                    meeting_id: "",
                    suggested_stem: None,
                },
                |_| {
                    picker_calls.set(picker_calls.get() + 1);
                    Ok(None)
                },
            ),
            Err("invalid_meeting_id".to_string())
        );

        for missing_id in ["../../outside", "mtg-uploaded-without-disk-wav"] {
            assert_eq!(
                export_recording_with_picker(
                    AudioExportInput {
                        ctx,
                        recordings_dir: &recordings_dir,
                        meeting_id: missing_id,
                        suggested_stem: Some("Uploaded Clip"),
                    },
                    |_| {
                        picker_calls.set(picker_calls.get() + 1);
                        Ok(None)
                    },
                ),
                Err("recording_not_found".to_string())
            );
        }

        let valid_wav =
            crate::recordings::recording_path(&recordings_dir, "mtg-2026-11-05_12-00-00-123")
                .unwrap();
        fs::write(&valid_wav, b"RIFF-wav").unwrap();
        assert_eq!(
            export_recording_with_picker(
                AudioExportInput {
                    ctx,
                    recordings_dir: &recordings_dir,
                    meeting_id: "mtg-2026-11-05_12-00-00-123",
                    suggested_stem: Some("..."),
                },
                |_| {
                    picker_calls.set(picker_calls.get() + 1);
                    Ok(None)
                },
            ),
            Err("invalid_file_name".to_string())
        );

        assert_eq!(picker_calls.get(), 0);

        fs::remove_dir_all(&app_data_dir).unwrap();
        fs::remove_dir_all(&downloads_dir).unwrap();
        fs::remove_dir_all(&recordings_dir).unwrap();
    }

    #[test]
    fn test_exported_file_serializes_camel_case_keys() {
        let value = serde_json::to_value(ExportedFile {
            file_name: "summary.pdf".to_string(),
            saved_path: "/Downloads/summary.pdf".to_string(),
            size_bytes: 128,
        })
        .unwrap();

        let mut keys: Vec<&str> = value.as_object().unwrap().keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(keys, ["fileName", "savedPath", "sizeBytes"]);
    }
}
