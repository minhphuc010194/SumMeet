"use client";

import React, { useMemo, useState } from "react";
import {
  Check,
  Clock,
  Edit3,
  Headphones,
  Mic,
  Plus,
  Search,
  UserCheck,
  Volume2,
} from "lucide-react";
import type { Dictionary } from "@/i18n/dictionaries";
import type {
  AudioSourceChannel,
  Meeting,
  TranscriptSegment,
} from "@/types/meeting";
import { formatTimestampMmSs } from "@/services/export/export-service";
import { useMeetingStore } from "@/store/meeting-store";

interface TranscriptViewerProps {
  meeting: Meeting;
  dict: Dictionary;
  onToast: (message: string) => void;
}

const SPEAKER_COLORS = [
  "bg-orange-500/20 text-orange-300 border-orange-500/40",
  "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  "bg-amber-500/20 text-amber-300 border-amber-500/40",
  "bg-sky-500/20 text-sky-300 border-sky-500/40",
  "bg-rose-500/20 text-rose-300 border-rose-500/40",
];

export function TranscriptViewer({
  meeting,
  dict,
  onToast,
}: TranscriptViewerProps) {
  const {
    currentAudioTimeMs,
    setCurrentAudioTimeMs,
    renameSpeaker,
    appendTranscriptSegment,
  } = useMeetingStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSpeaker, setSelectedSpeaker] = useState("ALL");
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [newSpeakerName, setNewSpeakerName] = useState("");
  const [liveNoteText, setLiveNoteText] = useState("");
  const [liveNoteChannel, setLiveNoteChannel] =
    useState<AudioSourceChannel>("mic_user");

  const uniqueSpeakers = useMemo(() => {
    const map = new Map<string, string>();
    for (const seg of meeting.segments) {
      map.set(seg.speakerId, seg.speakerName);
    }
    return Array.from(map.entries());
  }, [meeting.segments]);

  const filteredSegments = useMemo(() => {
    return meeting.segments.filter((segment) => {
      const matchesSpeaker =
        selectedSpeaker === "ALL" || segment.speakerId === selectedSpeaker;
      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        segment.text.toLowerCase().includes(q) ||
        segment.speakerName.toLowerCase().includes(q);
      return matchesSpeaker && matchesQuery;
    });
  }, [meeting.segments, selectedSpeaker, searchQuery]);

  const handleStartRename = (speakerId: string, currentName: string) => {
    setEditingSpeakerId(speakerId);
    setNewSpeakerName(currentName);
  };

  const handleCommitRename = (speakerId: string) => {
    if (newSpeakerName.trim()) {
      renameSpeaker(meeting.id, speakerId, newSpeakerName.trim());
      onToast(`Đã cập nhật tên người nói thành "${newSpeakerName.trim()}"`);
    }
    setEditingSpeakerId(null);
  };

  const handleAddSegment = (event: React.FormEvent) => {
    event.preventDefault();
    const cleaned = liveNoteText.trim();
    if (!cleaned) return;

    const lastEndMs =
      meeting.segments.length > 0
        ? meeting.segments[meeting.segments.length - 1].endMs
        : 0;

    const newSegment: TranscriptSegment = {
      id: `seg-manual-${Date.now()}`,
      meetingId: meeting.id,
      speakerId:
        liveNoteChannel === "mic_user" ? "spk_user_me" : "spk_remote_1",
      speakerName:
        liveNoteChannel === "mic_user"
          ? "Bạn (Minh Phúc)"
          : "Speaker 1 (System Audio)",
      channel: liveNoteChannel,
      text: cleaned,
      startMs: lastEndMs + 1000,
      endMs: lastEndMs + 7000,
      confidence: 1.0,
    };

    appendTranscriptSegment(meeting.id, newSegment);
    setLiveNoteText("");
  };

  const getSpeakerColor = (speakerId: string) => {
    let hash = 0;
    for (let i = 0; i < speakerId.length; i++) {
      hash = speakerId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return SPEAKER_COLORS[Math.abs(hash) % SPEAKER_COLORS.length];
  };

  const maxTimelineMs =
    meeting.segments.length > 0
      ? Math.max(
          meeting.durationSeconds * 1000,
          meeting.segments[meeting.segments.length - 1].endMs
        )
      : 60000;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      {/* Top Filter & Audio Scrubber Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={dict.transcript.searchPlaceholder}
            aria-label={dict.transcript.searchPlaceholder}
            className="w-full rounded-xl border border-slate-700/80 bg-slate-950 py-2 pr-3 pl-9 text-xs text-slate-100 placeholder-slate-500 focus:border-orange-500 focus:outline-none"
          />
        </div>

        <select
          value={selectedSpeaker}
          onChange={(e) => setSelectedSpeaker(e.target.value)}
          aria-label={dict.transcript.allSpeakers}
          className="rounded-xl border border-slate-700/80 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-orange-500 focus:outline-none"
        >
          <option value="ALL">{dict.transcript.allSpeakers}</option>
          {uniqueSpeakers.map(([spkId, spkName]) => (
            <option key={spkId} value={spkId}>
              {spkName}
            </option>
          ))}
        </select>
      </div>

      {/* Synchronized Audio Timeline Bar */}
      <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-800/90 bg-slate-950/80 px-3.5 py-2">
        <Volume2 className="h-4 w-4 text-orange-400" />
        <span className="font-mono text-xs text-orange-300">
          {formatTimestampMmSs(currentAudioTimeMs)}
        </span>
        <input
          type="range"
          min={0}
          max={maxTimelineMs}
          step={1000}
          value={Math.min(currentAudioTimeMs, maxTimelineMs)}
          onChange={(e) => setCurrentAudioTimeMs(Number(e.target.value))}
          aria-label="Audio timeline scrubber"
          className="h-1.5 flex-1 cursor-pointer accent-orange-500"
        />
        <span className="font-mono text-xs text-slate-400">
          {formatTimestampMmSs(maxTimelineMs)}
        </span>
      </div>

      {/* Diarized Transcript Segments List */}
      <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
        {filteredSegments.length === 0 ? (
          <div className="flex h-44 items-center justify-center text-xs text-slate-500">
            {dict.transcript.emptyState}
          </div>
        ) : (
          filteredSegments.map((segment) => {
            const isActive =
              currentAudioTimeMs >= segment.startMs &&
              currentAudioTimeMs <= segment.endMs;
            const colorClass = getSpeakerColor(segment.speakerId);

            return (
              <div
                key={segment.id}
                className={`group rounded-xl border p-3.5 transition ${
                  isActive
                    ? "border-orange-500/60 bg-orange-950/30"
                    : "border-slate-800/80 bg-slate-950/50 hover:border-slate-700"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold ${colorClass}`}
                    >
                      {segment.speakerName.slice(0, 1).toUpperCase()}
                    </span>

                    {editingSpeakerId === segment.speakerId ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={newSpeakerName}
                          onChange={(e) => setNewSpeakerName(e.target.value)}
                          aria-label={dict.transcript.renameSpeakerPrompt}
                          className="rounded-lg border border-orange-500 bg-slate-900 px-2 py-0.5 text-xs text-slate-50 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleCommitRename(segment.speakerId)}
                          className="rounded-md bg-emerald-600 p-1 text-white hover:bg-emerald-500"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          handleStartRename(
                            segment.speakerId,
                            segment.speakerName
                          )
                        }
                        title={dict.transcript.renameSpeakerTooltip}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-50 hover:text-orange-300"
                      >
                        {segment.speakerName}
                        <Edit3 className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
                      </button>
                    )}

                    {/* Channel Origin Pill (Mic vs System Loopback) */}
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium ${
                        segment.channel === "mic_user"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-orange-500/15 text-orange-300"
                      }`}
                    >
                      {segment.channel === "mic_user" ? (
                        <>
                          <Mic className="h-2.5 w-2.5" />
                          {dict.transcript.channelMicTag}
                        </>
                      ) : (
                        <>
                          <Headphones className="h-2.5 w-2.5" />
                          {dict.transcript.channelSystemTag}
                        </>
                      )}
                    </span>
                  </div>

                  {/* Clickable Timestamp */}
                  <button
                    type="button"
                    onClick={() => setCurrentAudioTimeMs(segment.startMs)}
                    title={dict.transcript.clickToSeek}
                    className="inline-flex items-center gap-1 rounded-md bg-slate-800/80 px-2 py-0.5 font-mono text-[11px] text-slate-300 transition hover:bg-orange-600 hover:text-white"
                  >
                    <Clock className="h-3 w-3" />
                    {formatTimestampMmSs(segment.startMs)}
                  </button>
                </div>

                <p className="mt-2 text-sm leading-relaxed text-slate-200">
                  {segment.text}
                </p>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Quick Live Utterance / Note Bar */}
      <form
        onSubmit={handleAddSegment}
        className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3"
      >
        <select
          value={liveNoteChannel}
          onChange={(e) =>
            setLiveNoteChannel(e.target.value as AudioSourceChannel)
          }
          aria-label="Audio channel selector"
          className="rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-200"
        >
          <option value="mic_user">🎙️ {dict.transcript.channelMicTag}</option>
          <option value="system_remote">
            🎧 {dict.transcript.channelSystemTag}
          </option>
        </select>

        <input
          type="text"
          value={liveNoteText}
          onChange={(e) => setLiveNoteText(e.target.value)}
          placeholder={dict.transcript.addLiveNotePlaceholder}
          className="min-w-[200px] flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-orange-500 focus:outline-none"
        />

        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-orange-600"
        >
          <Plus className="h-3.5 w-3.5" />
          {dict.transcript.addLiveNoteButton}
        </button>
      </form>
    </div>
  );
}
