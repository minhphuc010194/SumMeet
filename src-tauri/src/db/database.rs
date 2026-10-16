use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MeetingRecord {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub duration_seconds: u64,
    pub audio_path: Option<String>,
    pub status: String, // "recording" | "processing" | "completed"
    pub audio_device_used: String,
    pub is_headphone_session: bool,
    pub calendar_event_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TranscriptSegmentRecord {
    pub id: String,
    pub meeting_id: String,
    pub speaker_id: String,
    pub speaker_name: String,
    pub channel: String, // "mic_user" | "system_remote"
    pub text: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SummaryRecord {
    pub meeting_id: String,
    pub template_id: String,
    pub overview: String,
    pub action_items_json: String,
    pub key_decisions_json: String,
    pub outline_json: String,
    pub provider_used: String,
    pub updated_at: String,
}

pub struct LocalDatabase {
    conn: Connection,
}

impl LocalDatabase {
    pub fn open(db_path: &Path) -> SqlResult<Self> {
        let conn = Connection::open(db_path)?;
        let db = Self { conn };
        db.initialize_schema()?;
        Ok(db)
    }

    pub fn open_in_memory() -> SqlResult<Self> {
        let conn = Connection::open_in_memory()?;
        let db = Self { conn };
        db.initialize_schema()?;
        Ok(db)
    }

    fn initialize_schema(&self) -> SqlResult<()> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS meetings (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                duration_seconds INTEGER NOT NULL DEFAULT 0,
                audio_path TEXT,
                status TEXT NOT NULL,
                audio_device_used TEXT NOT NULL,
                is_headphone_session INTEGER NOT NULL DEFAULT 0,
                calendar_event_id TEXT
            );

            CREATE TABLE IF NOT EXISTS transcript_segments (
                id TEXT PRIMARY KEY,
                meeting_id TEXT NOT NULL,
                speaker_id TEXT NOT NULL,
                speaker_name TEXT NOT NULL,
                channel TEXT NOT NULL,
                text TEXT NOT NULL,
                start_ms INTEGER NOT NULL,
                end_ms INTEGER NOT NULL,
                confidence REAL NOT NULL DEFAULT 0.98,
                FOREIGN KEY(meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS summaries (
                meeting_id TEXT PRIMARY KEY,
                template_id TEXT NOT NULL,
                overview TEXT NOT NULL,
                action_items_json TEXT NOT NULL,
                key_decisions_json TEXT NOT NULL,
                outline_json TEXT NOT NULL,
                provider_used TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
            );
            ",
        )
    }

    pub fn upsert_meeting(&self, meeting: &MeetingRecord) -> SqlResult<()> {
        self.conn.execute(
            "
            INSERT INTO meetings (
                id, title, created_at, duration_seconds, audio_path,
                status, audio_device_used, is_headphone_session, calendar_event_id
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                duration_seconds = excluded.duration_seconds,
                audio_path = excluded.audio_path,
                status = excluded.status,
                audio_device_used = excluded.audio_device_used,
                is_headphone_session = excluded.is_headphone_session,
                calendar_event_id = excluded.calendar_event_id
            ",
            params![
                meeting.id,
                meeting.title,
                meeting.created_at,
                meeting.duration_seconds as i64,
                meeting.audio_path,
                meeting.status,
                meeting.audio_device_used,
                if meeting.is_headphone_session { 1 } else { 0 },
                meeting.calendar_event_id
            ],
        )?;
        Ok(())
    }

    pub fn list_meetings(&self) -> SqlResult<Vec<MeetingRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, created_at, duration_seconds, audio_path, status, audio_device_used, is_headphone_session, calendar_event_id
             FROM meetings ORDER BY created_at DESC",
        )?;

        let rows = stmt.query_map([], |row| {
            let duration: i64 = row.get(3)?;
            let is_headphone: i64 = row.get(7)?;
            Ok(MeetingRecord {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: row.get(2)?,
                duration_seconds: duration.max(0) as u64,
                audio_path: row.get(4)?,
                status: row.get(5)?,
                audio_device_used: row.get(6)?,
                is_headphone_session: is_headphone != 0,
                calendar_event_id: row.get(8)?,
            })
        })?;

        rows.collect()
    }

    pub fn insert_transcript_segment(&self, segment: &TranscriptSegmentRecord) -> SqlResult<()> {
        self.conn.execute(
            "
            INSERT OR REPLACE INTO transcript_segments (
                id, meeting_id, speaker_id, speaker_name, channel, text, start_ms, end_ms, confidence
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ",
            params![
                segment.id,
                segment.meeting_id,
                segment.speaker_id,
                segment.speaker_name,
                segment.channel,
                segment.text,
                segment.start_ms as i64,
                segment.end_ms as i64,
                segment.confidence,
            ],
        )?;
        Ok(())
    }

    pub fn list_transcript_segments(
        &self,
        meeting_id: &str,
    ) -> SqlResult<Vec<TranscriptSegmentRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, meeting_id, speaker_id, speaker_name, channel, text, start_ms, end_ms, confidence
             FROM transcript_segments WHERE meeting_id = ?1 ORDER BY start_ms ASC",
        )?;

        let rows = stmt.query_map(params![meeting_id], |row| {
            let start_ms: i64 = row.get(6)?;
            let end_ms: i64 = row.get(7)?;
            Ok(TranscriptSegmentRecord {
                id: row.get(0)?,
                meeting_id: row.get(1)?,
                speaker_id: row.get(2)?,
                speaker_name: row.get(3)?,
                channel: row.get(4)?,
                text: row.get(5)?,
                start_ms: start_ms.max(0) as u64,
                end_ms: end_ms.max(0) as u64,
                confidence: row.get(8)?,
            })
        })?;

        rows.collect()
    }

    pub fn rename_speaker_in_meeting(
        &self,
        meeting_id: &str,
        speaker_id: &str,
        new_speaker_name: &str,
    ) -> SqlResult<usize> {
        let updated = self.conn.execute(
            "UPDATE transcript_segments SET speaker_name = ?1 WHERE meeting_id = ?2 AND speaker_id = ?3",
            params![new_speaker_name, meeting_id, speaker_id],
        )?;
        Ok(updated)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sqlite_persists_meeting_and_speaker_rename() {
        // Given an in-memory SQLite database and a headphone recording session
        let db = LocalDatabase::open_in_memory().expect("Should initialize in-memory DB");
        let meeting = MeetingRecord {
            id: "mtg-001".to_string(),
            title: "Product Architecture Sync".to_string(),
            created_at: "2026-10-15T10:00:00Z".to_string(),
            duration_seconds: 1800,
            audio_path: Some("/tmp/mtg-001.wav".to_string()),
            status: "completed".to_string(),
            audio_device_used: "AirPods Pro (Dual-Stream)".to_string(),
            is_headphone_session: true,
            calendar_event_id: Some("cal-123".to_string()),
        };

        // When saving the meeting and two dual-channel transcript segments
        db.upsert_meeting(&meeting).unwrap();
        db.insert_transcript_segment(&TranscriptSegmentRecord {
            id: "seg-1".to_string(),
            meeting_id: "mtg-001".to_string(),
            speaker_id: "spk_remote_1".to_string(),
            speaker_name: "Speaker 1".to_string(),
            channel: "system_remote".to_string(),
            text: "Let's finalize the Q4 release timeline.".to_string(),
            start_ms: 1000,
            end_ms: 4500,
            confidence: 0.99,
        })
        .unwrap();

        db.rename_speaker_in_meeting("mtg-001", "spk_remote_1", "Alex Rivera")
            .unwrap();

        // Then the meeting and renamed speaker segment are accurately retrieved
        let meetings = db.list_meetings().unwrap();
        assert_eq!(meetings.len(), 1);
        assert!(meetings[0].is_headphone_session);

        let segments = db.list_transcript_segments("mtg-001").unwrap();
        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].speaker_name, "Alex Rivera");
    }
}
