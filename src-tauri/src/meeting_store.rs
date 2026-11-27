use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::State;

const MAX_STORE_BYTES: usize = 256 * 1024 * 1024;

pub struct MeetingStoreFile {
    path: PathBuf,
    lock: Mutex<()>,
}

fn non_empty_parent(path: &Path) -> Option<&Path> {
    let parent = path.parent()?;
    if parent.as_os_str().is_empty() {
        return None;
    }
    Some(parent)
}

impl MeetingStoreFile {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            lock: Mutex::new(()),
        }
    }

    pub fn read(&self) -> Result<Option<String>, String> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        match fs::read_to_string(&self.path) {
            Ok(content) => Ok(Some(content)),
            Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn write(&self, payload: &str) -> Result<(), String> {
        self.write_with_limit(payload, MAX_STORE_BYTES)
    }

    fn write_with_limit(&self, payload: &str, max_bytes: usize) -> Result<(), String> {
        if payload.len() > max_bytes {
            return Err("store_too_large".to_string());
        }
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let Some(parent) = non_empty_parent(&self.path) else {
            return Err("invalid_store_path".to_string());
        };
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        let temp_path = parent.join(format!(".meeting-store-{}.tmp", uuid::Uuid::new_v4()));
        let mut temp_file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
            .map_err(|e| e.to_string())?;
        if let Err(e) = temp_file
            .write_all(payload.as_bytes())
            .and_then(|_| temp_file.flush())
        {
            drop(temp_file);
            let _ = fs::remove_file(&temp_path);
            return Err(e.to_string());
        }
        drop(temp_file);
        if let Err(e) = fs::rename(&temp_path, &self.path) {
            let _ = fs::remove_file(&temp_path);
            return Err(e.to_string());
        }
        Ok(())
    }

    pub fn clear(&self) -> Result<(), String> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        match fs::remove_file(&self.path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

#[tauri::command(async)]
pub fn read_meeting_store(store: State<'_, MeetingStoreFile>) -> Result<Option<String>, String> {
    store.read()
}

#[tauri::command(async)]
pub fn write_meeting_store(
    payload: String,
    store: State<'_, MeetingStoreFile>,
) -> Result<(), String> {
    store.write(&payload)
}

#[tauri::command(async)]
pub fn clear_meeting_store(store: State<'_, MeetingStoreFile>) -> Result<(), String> {
    store.clear()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("summeet-store-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn test_read_returns_none_when_missing() {
        let dir = temp_dir();
        let store = MeetingStoreFile::new(dir.join("meeting-store.json"));

        assert_eq!(store.read().unwrap(), None);

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_write_read_overwrite_handles_large_utf8_payload_without_temp_leftovers() {
        let dir = temp_dir();
        let store_path = dir.join("nested").join("meeting-store.json");
        let store = MeetingStoreFile::new(store_path.clone());

        let chunk = "Cuộc họp tổng kết quý 4 — dữ liệu phiên âm tiếng Việt đầy đủ dấu.\n";
        let repeat_count = (6 * 1024 * 1024) / chunk.len() + 1;
        let large_payload = chunk.repeat(repeat_count);
        assert!(large_payload.len() > 5 * 1024 * 1024);

        store.write(&large_payload).unwrap();
        assert_eq!(store.read().unwrap().as_deref(), Some(large_payload.as_str()));

        let second_payload = r#"{"state":{"meetings":[{"id":"mtg-2"}]},"version":3}"#;
        store.write(second_payload).unwrap();
        assert_eq!(store.read().unwrap().as_deref(), Some(second_payload));

        let entries: Vec<String> = fs::read_dir(store_path.parent().unwrap())
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(entries, vec!["meeting-store.json".to_string()]);

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_clear_deletes_store_and_is_idempotent() {
        let dir = temp_dir();
        let store = MeetingStoreFile::new(dir.join("meeting-store.json"));

        store.clear().unwrap();
        store.write(r#"{"meetings":[]}"#).unwrap();
        assert!(store.read().unwrap().is_some());

        store.clear().unwrap();
        assert_eq!(store.read().unwrap(), None);

        store.clear().unwrap();
        assert_eq!(store.read().unwrap(), None);

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_write_rejects_oversized_payload_without_overwriting_existing_file() {
        let dir = temp_dir();
        let store = MeetingStoreFile::new(dir.join("meeting-store.json"));

        store.write("initial").unwrap();
        let oversized = "x".repeat(64);
        assert_eq!(
            store.write_with_limit(&oversized, 32),
            Err("store_too_large".to_string())
        );
        assert_eq!(store.read().unwrap().as_deref(), Some("initial"));

        fs::remove_dir_all(&dir).unwrap();
    }
}
