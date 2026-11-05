use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use tauri::State;

use crate::recordings::RecordingsDir;

const MAX_EXPORT_BYTES: usize = 64 * 1024 * 1024;
const MAX_EXPORT_BASE64_LEN: usize = MAX_EXPORT_BYTES.div_ceil(3) * 4;
const MAX_STEM_CHARS: usize = 120;
const MAX_COLLISION_ATTEMPTS: u32 = 1000;

pub struct DownloadsDir(pub Option<PathBuf>);

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExportedFile {
    pub file_name: String,
    pub saved_path: String,
    pub size_bytes: u64,
}

struct ExportTarget<'a> {
    dir: &'a Path,
    stem: &'a str,
    ext: &'a str,
}

struct SaveExportInput<'a> {
    file_name: &'a str,
    format: &'a str,
    content_base64: &'a str,
}

struct AudioExportDirs<'a> {
    recordings_dir: &'a Path,
    downloads_dir: Option<&'a Path>,
}

struct AudioExportInput<'a> {
    meeting_id: &'a str,
    suggested_stem: Option<&'a str>,
}

fn validate_export_format(format: &str) -> Result<&'static str, String> {
    match format {
        "md" => Ok("md"),
        "pdf" => Ok("pdf"),
        "wav" => Ok("wav"),
        "mp3" => Ok("mp3"),
        "aac" => Ok("aac"),
        "m4a" => Ok("m4a"),
        "ogg" => Ok("ogg"),
        "flac" => Ok("flac"),
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

fn create_unique_export_file(target: ExportTarget<'_>) -> Result<(fs::File, PathBuf), String> {
    fs::create_dir_all(target.dir).map_err(|e| e.to_string())?;
    for attempt in 0..MAX_COLLISION_ATTEMPTS {
        let file_name = if attempt == 0 {
            format!("{}.{}", target.stem, target.ext)
        } else {
            format!("{} ({attempt}).{}", target.stem, target.ext)
        };
        let candidate = target.dir.join(&file_name);
        if candidate.parent() != Some(target.dir) {
            return Err("invalid_file_name".to_string());
        }
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => return Ok((file, candidate)),
            Err(e) if e.kind() == ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.to_string()),
        }
    }
    Err("export_collision_limit".to_string())
}

fn save_export_in_dir(
    downloads_dir: Option<&Path>,
    input: SaveExportInput<'_>,
) -> Result<ExportedFile, String> {
    let ext = validate_export_format(input.format)?;
    let stem = sanitize_export_stem(input.file_name)?;
    let Some(dir) = downloads_dir else {
        return Err("downloads_unavailable".to_string());
    };
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

    let (mut file, saved_path) = create_unique_export_file(ExportTarget {
        dir,
        stem: &stem,
        ext,
    })?;
    if let Err(e) = file.write_all(&bytes).and_then(|_| file.flush()) {
        let _ = fs::remove_file(&saved_path);
        return Err(e.to_string());
    }

    Ok(ExportedFile {
        file_name: saved_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        saved_path: saved_path.to_string_lossy().into_owned(),
        size_bytes: bytes.len() as u64,
    })
}

fn export_recording_in_dirs(
    dirs: AudioExportDirs<'_>,
    input: AudioExportInput<'_>,
) -> Result<ExportedFile, String> {
    let source_path = crate::recordings::recording_path(dirs.recordings_dir, input.meeting_id)?;
    let mut source = fs::File::open(&source_path).map_err(|e| {
        if e.kind() == ErrorKind::NotFound {
            "recording_not_found".to_string()
        } else {
            e.to_string()
        }
    })?;
    let Some(downloads_dir) = dirs.downloads_dir else {
        return Err("downloads_unavailable".to_string());
    };
    let raw_stem = input.suggested_stem.unwrap_or(input.meeting_id);
    let stem = sanitize_export_stem(raw_stem)?;

    let (mut dest, saved_path) = create_unique_export_file(ExportTarget {
        dir: downloads_dir,
        stem: &stem,
        ext: "wav",
    })?;
    let size_bytes = match std::io::copy(&mut source, &mut dest).and_then(|n| {
        dest.flush()?;
        Ok(n)
    }) {
        Ok(n) => n,
        Err(e) => {
            let _ = fs::remove_file(&saved_path);
            return Err(e.to_string());
        }
    };

    Ok(ExportedFile {
        file_name: saved_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        saved_path: saved_path.to_string_lossy().into_owned(),
        size_bytes,
    })
}

#[tauri::command(async)]
pub fn save_export_file(
    file_name: String,
    format: String,
    content_base64: String,
    downloads: State<'_, DownloadsDir>,
) -> Result<ExportedFile, String> {
    save_export_in_dir(
        downloads.0.as_deref(),
        SaveExportInput {
            file_name: &file_name,
            format: &format,
            content_base64: &content_base64,
        },
    )
}

#[tauri::command(async)]
pub fn export_recording_audio(
    meeting_id: String,
    suggested_stem: Option<String>,
    recordings: State<'_, RecordingsDir>,
    downloads: State<'_, DownloadsDir>,
) -> Result<ExportedFile, String> {
    export_recording_in_dirs(
        AudioExportDirs {
            recordings_dir: &recordings.0,
            downloads_dir: downloads.0.as_deref(),
        },
        AudioExportInput {
            meeting_id: &meeting_id,
            suggested_stem: suggested_stem.as_deref(),
        },
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
    fn test_save_export_rejects_disallowed_formats_invalid_pdf_unavailable_downloads_and_oversized_payloads() {
        let dir = temp_dir();
        let valid_md = BASE64_STANDARD.encode(b"# Summary");

        for bad_format in ["exe", "sh", "html", "js", "bat", ".md", "MD", ""] {
            assert_eq!(
                save_export_in_dir(
                    Some(&dir),
                    SaveExportInput {
                        file_name: "notes",
                        format: bad_format,
                        content_base64: &valid_md,
                    },
                ),
                Err("invalid_export_format".to_string())
            );
        }

        assert_eq!(
            save_export_in_dir(
                None,
                SaveExportInput {
                    file_name: "notes",
                    format: "md",
                    content_base64: &valid_md,
                },
            ),
            Err("downloads_unavailable".to_string())
        );

        assert_eq!(
            save_export_in_dir(
                Some(&dir),
                SaveExportInput {
                    file_name: "report",
                    format: "pdf",
                    content_base64: &BASE64_STANDARD.encode(b"NOT-A-PDF"),
                },
            ),
            Err("invalid_pdf_data".to_string())
        );

        let oversized_b64 = "A".repeat(MAX_EXPORT_BASE64_LEN + 4);
        assert_eq!(
            save_export_in_dir(
                Some(&dir),
                SaveExportInput {
                    file_name: "huge",
                    format: "md",
                    content_base64: &oversized_b64,
                },
            ),
            Err("export_too_large".to_string())
        );

        let unpadded_over_max = BASE64_STANDARD.encode(vec![0u8; MAX_EXPORT_BYTES + 1]);
        assert_eq!(unpadded_over_max.len(), MAX_EXPORT_BASE64_LEN);
        assert_eq!(
            save_export_in_dir(
                Some(&dir),
                SaveExportInput {
                    file_name: "huge-decoded",
                    format: "wav",
                    content_base64: &unpadded_over_max,
                },
            ),
            Err("export_too_large".to_string())
        );

        assert!(fs::read_dir(&dir).unwrap().next().is_none());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_save_export_creates_non_overwriting_collision_suffixes_and_validates_pdf() {
        let dir = temp_dir();
        let first = save_export_in_dir(
            Some(&dir),
            SaveExportInput {
                file_name: "Biên bản họp_2026-11-05_14-00",
                format: "md",
                content_base64: &BASE64_STANDARD.encode("Nội dung 1".as_bytes()),
            },
        )
        .unwrap();
        let second = save_export_in_dir(
            Some(&dir),
            SaveExportInput {
                file_name: "Biên bản họp_2026-11-05_14-00",
                format: "md",
                content_base64: &BASE64_STANDARD.encode("Nội dung 22".as_bytes()),
            },
        )
        .unwrap();
        let third = save_export_in_dir(
            Some(&dir),
            SaveExportInput {
                file_name: "Biên bản họp_2026-11-05_14-00",
                format: "md",
                content_base64: &BASE64_STANDARD.encode("Nội dung 333".as_bytes()),
            },
        )
        .unwrap();

        assert_eq!(first.file_name, "Biên bản họp_2026-11-05_14-00.md");
        assert_eq!(second.file_name, "Biên bản họp_2026-11-05_14-00 (1).md");
        assert_eq!(third.file_name, "Biên bản họp_2026-11-05_14-00 (2).md");
        assert_eq!(
            fs::read_to_string(&first.saved_path).unwrap(),
            "Nội dung 1"
        );
        assert_eq!(
            fs::read_to_string(&second.saved_path).unwrap(),
            "Nội dung 22"
        );
        assert_eq!(
            fs::read_to_string(&third.saved_path).unwrap(),
            "Nội dung 333"
        );

        let pdf_bytes = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF";
        let pdf = save_export_in_dir(
            Some(&dir),
            SaveExportInput {
                file_name: "Summary",
                format: "pdf",
                content_base64: &BASE64_STANDARD.encode(pdf_bytes),
            },
        )
        .unwrap();
        assert_eq!(pdf.file_name, "Summary.pdf");
        assert_eq!(pdf.size_bytes, pdf_bytes.len() as u64);
        assert_eq!(fs::read(&pdf.saved_path).unwrap(), pdf_bytes);

        for audio_ext in ["wav", "mp3", "aac", "m4a", "ogg", "flac"] {
            let exported = save_export_in_dir(
                Some(&dir),
                SaveExportInput {
                    file_name: "upload",
                    format: audio_ext,
                    content_base64: &BASE64_STANDARD.encode(b"audio-bytes"),
                },
            )
            .unwrap();
            assert_eq!(exported.file_name, format!("upload.{audio_ext}"));
        }

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_create_unique_export_file_stops_after_max_collision_attempts() {
        let dir = temp_dir();
        for attempt in 0..MAX_COLLISION_ATTEMPTS {
            let name = if attempt == 0 {
                "dup.md".to_string()
            } else {
                format!("dup ({attempt}).md")
            };
            fs::write(dir.join(name), b"x").unwrap();
        }

        let err = create_unique_export_file(ExportTarget {
            dir: &dir,
            stem: "dup",
            ext: "md",
        });
        assert_eq!(err.unwrap_err(), "export_collision_limit");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_export_recording_audio_copies_bytes_handles_collisions_and_maps_errors() {
        let recordings_dir = temp_dir();
        let downloads_dir = temp_dir();
        let wav_bytes: Vec<u8> = (0..=255).cycle().take(4096).collect();
        let source_wav =
            crate::recordings::recording_path(&recordings_dir, "mtg-2026-11-05_12-00-00-123")
                .unwrap();
        fs::write(&source_wav, &wav_bytes).unwrap();

        let exported = export_recording_in_dirs(
            AudioExportDirs {
                recordings_dir: &recordings_dir,
                downloads_dir: Some(&downloads_dir),
            },
            AudioExportInput {
                meeting_id: "mtg-2026-11-05_12-00-00-123",
                suggested_stem: Some("Họp Sprint_2026-11-05_12-00"),
            },
        )
        .unwrap();
        assert_eq!(exported.file_name, "Họp Sprint_2026-11-05_12-00.wav");
        assert_eq!(exported.size_bytes, wav_bytes.len() as u64);
        assert_eq!(fs::read(&exported.saved_path).unwrap(), wav_bytes);

        let fallback_stem = export_recording_in_dirs(
            AudioExportDirs {
                recordings_dir: &recordings_dir,
                downloads_dir: Some(&downloads_dir),
            },
            AudioExportInput {
                meeting_id: "mtg-2026-11-05_12-00-00-123",
                suggested_stem: None,
            },
        )
        .unwrap();
        assert_eq!(fallback_stem.file_name, "mtg-2026-11-05_12-00-00-123.wav");

        let duplicate = export_recording_in_dirs(
            AudioExportDirs {
                recordings_dir: &recordings_dir,
                downloads_dir: Some(&downloads_dir),
            },
            AudioExportInput {
                meeting_id: "mtg-2026-11-05_12-00-00-123",
                suggested_stem: Some("Họp Sprint_2026-11-05_12-00"),
            },
        )
        .unwrap();
        assert_eq!(duplicate.file_name, "Họp Sprint_2026-11-05_12-00 (1).wav");

        assert_eq!(
            export_recording_in_dirs(
                AudioExportDirs {
                    recordings_dir: &recordings_dir,
                    downloads_dir: Some(&downloads_dir),
                },
                AudioExportInput {
                    meeting_id: "",
                    suggested_stem: None,
                },
            ),
            Err("invalid_meeting_id".to_string())
        );

        assert_eq!(
            export_recording_in_dirs(
                AudioExportDirs {
                    recordings_dir: &recordings_dir,
                    downloads_dir: Some(&downloads_dir),
                },
                AudioExportInput {
                    meeting_id: "../../outside",
                    suggested_stem: None,
                },
            ),
            Err("recording_not_found".to_string())
        );

        assert_eq!(
            export_recording_in_dirs(
                AudioExportDirs {
                    recordings_dir: &recordings_dir,
                    downloads_dir: None,
                },
                AudioExportInput {
                    meeting_id: "mtg-2026-11-05_12-00-00-123",
                    suggested_stem: None,
                },
            ),
            Err("downloads_unavailable".to_string())
        );

        assert_eq!(
            export_recording_in_dirs(
                AudioExportDirs {
                    recordings_dir: &recordings_dir,
                    downloads_dir: Some(&downloads_dir),
                },
                AudioExportInput {
                    meeting_id: "mtg-2026-11-05_12-00-00-123",
                    suggested_stem: Some("..."),
                },
            ),
            Err("invalid_file_name".to_string())
        );

        fs::remove_dir_all(&recordings_dir).unwrap();
        fs::remove_dir_all(&downloads_dir).unwrap();
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
