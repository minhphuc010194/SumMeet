import { invoke } from "@tauri-apps/api/core";
import { DICTIONARIES, getDictionary } from "@/i18n/dictionaries";
import { bytesToBase64 } from "@/services/audio/wav";
import { renderMeetingSummaryPdfBytes } from "@/services/export/pdf-export";
import type {
  ApiResponse,
  Meeting,
  OpenRouterAudioFormat,
  SupportedLocale,
} from "@/types/meeting";

const MAX_UPLOAD_CACHE_BYTES = 64 * 1024 * 1024;
const EXPORTABLE_AUDIO_FORMATS: OpenRouterAudioFormat[] = [
  "wav",
  "mp3",
  "aac",
  "m4a",
  "ogg",
  "flac",
];
const MIME_TO_AUDIO_FORMAT: Record<string, OpenRouterAudioFormat> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/aac": "aac",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
};

export interface ExportedFile {
  fileName: string;
  savedPath: string;
  sizeBytes: number;
}

const uploadedAudioCache = new Map<
  string,
  { bytes: Uint8Array; format: OpenRouterAudioFormat }
>();

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatTimestampMmSs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = pad2(Math.floor(totalSec / 60));
  const secs = pad2(totalSec % 60);
  return `${mins}:${secs}`;
}

export function formatRecordingDateTime(
  input: string | number | Date,
  locale: SupportedLocale
): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return String(input);
  }
  const intlLocale = locale === "vi" ? "vi-VN" : "en-US";
  return new Intl.DateTimeFormat(intlLocale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function formatRecordingDateShort(
  input: string | number | Date,
  locale: SupportedLocale
): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return String(input);
  }
  const intlLocale = locale === "vi" ? "vi-VN" : "en-US";
  return new Intl.DateTimeFormat(intlLocale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function buildDatedMeetingId(now: Date = new Date()): string {
  const safeDate = Number.isNaN(now.getTime()) ? new Date() : now;
  const yyyy = String(safeDate.getFullYear()).padStart(4, "0");
  const mm = pad2(safeDate.getMonth() + 1);
  const dd = pad2(safeDate.getDate());
  const hh = pad2(safeDate.getHours());
  const min = pad2(safeDate.getMinutes());
  const ss = pad2(safeDate.getSeconds());
  const ms = String(safeDate.getMilliseconds()).padStart(3, "0");
  return `mtg-${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}-${ms}`;
}

export function buildExportFileStem(meeting: Meeting): string {
  const rawBase = meeting.title
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} _-]+/gu, "_")
    .replace(/^[ _]+|[ _]+$/g, "");
  const baseTitle = rawBase || "SumMeet";
  const createdDate = new Date(meeting.createdAt);
  if (Number.isNaN(createdDate.getTime())) {
    return Array.from(baseTitle)
      .slice(0, 120)
      .join("")
      .replace(/[ _]+$/g, "")
      .normalize("NFC");
  }

  const yyyy = String(createdDate.getFullYear()).padStart(4, "0");
  const mm = pad2(createdDate.getMonth() + 1);
  const dd = pad2(createdDate.getDate());
  const hh = pad2(createdDate.getHours());
  const min = pad2(createdDate.getMinutes());
  const isoDate = `${yyyy}-${mm}-${dd}`;

  if (baseTitle.includes(isoDate)) {
    return Array.from(baseTitle)
      .slice(0, 120)
      .join("")
      .replace(/[ _]+$/g, "")
      .normalize("NFC");
  }

  const trimmedTitle = Array.from(baseTitle)
    .slice(0, 100)
    .join("")
    .replace(/[ _]+$/g, "");
  const prefix = trimmedTitle || "SumMeet";
  return `${prefix}_${isoDate}_${hh}-${min}`.normalize("NFC");
}

export function resolveSummaryOverviewText(
  meeting: Meeting,
  locale: SupportedLocale
): string {
  const dict = getDictionary(locale);
  const hasNoSegments = meeting.segments.length === 0;
  const isCompletedEmpty = meeting.status === "completed" && hasNoSegments;
  const isLivePlaceholder =
    meeting.summary.overview === DICTIONARIES.vi.session.liveOverview ||
    meeting.summary.overview === DICTIONARIES.en.session.liveOverview;
  const isStaleLiveOverview = isCompletedEmpty && isLivePlaceholder;
  return isStaleLiveOverview
    ? dict.errors.noTranscript
    : meeting.summary.overview;
}

export function generateMeetingMarkdown(
  meeting: Meeting,
  options?: { locale?: SupportedLocale; includeTranscript?: boolean }
): string {
  const includeTranscript = options ? Boolean(options.includeTranscript) : true;
  const durationMins = Math.max(1, Math.round(meeting.durationSeconds / 60));

  if (!options?.locale) {
    const dateStr = new Date(meeting.createdAt).toLocaleString("vi-VN");
    const fallbackLocale: SupportedLocale =
      meeting.summary.overview === DICTIONARIES.vi.session.liveOverview
        ? "vi"
        : "en";
    const overviewText = resolveSummaryOverviewText(meeting, fallbackLocale);

    const actionLines =
      meeting.summary.actionItems.length > 0
        ? meeting.summary.actionItems
            .map((item) => {
              const timePrefix =
                typeof item.timestampMs === "number"
                  ? `[${formatTimestampMmSs(item.timestampMs)}] `
                  : "";
              return `- [${item.completed ? "x" : " "}] ${timePrefix}**@${item.assignee}**: ${item.task} *(Due: ${item.dueDate})*`;
            })
            .join("\n")
        : "- None recorded";

    const decisionLines =
      meeting.summary.keyDecisions.length > 0
        ? meeting.summary.keyDecisions.map((d) => `- ${d}`).join("\n")
        : "- None recorded";

    const outlineLines =
      meeting.summary.outline.length > 0
        ? meeting.summary.outline
            .map((sec) => {
              const bullets = sec.bullets.map((b) => `  - ${b}`).join("\n");
              return bullets
                ? `### [${formatTimestampMmSs(sec.timestampMs)}] ${sec.title}\n${bullets}`
                : `### [${formatTimestampMmSs(sec.timestampMs)}] ${sec.title}`;
            })
            .join("\n\n")
        : "- None recorded";

    const keywordLines =
      meeting.summary.keywords
        .map((kw) => kw.replace(/^#+/, "").trim())
        .filter(Boolean)
        .map((kw) => `- #${kw}`)
        .join("\n") || "- None recorded";

    const lines = [
      `# ${meeting.title}`,
      "",
      `- **Date**: ${dateStr}`,
      `- **Duration**: ${durationMins} mins`,
      `- **Audio Device**: ${meeting.audioDeviceUsed} (${meeting.isHeadphoneSession ? "Headphone/AirPods Dual-Stream" : "Speaker Mode"})`,
      `- **Participants**: ${meeting.participants.join(", ")}`,
      `- **AI Model**: ${meeting.summary.providerUsed}`,
      "",
      "---",
      "",
      "## Executive Summary",
      overviewText,
      "",
      "## Action Items",
      actionLines,
      "",
      "## Key Decisions",
      decisionLines,
      "",
      "## Topic Outline",
      outlineLines,
      "",
      "## Keywords",
      keywordLines,
    ];

    if (includeTranscript) {
      const transcriptLines = meeting.segments
        .map((seg) => {
          const channelBadge =
            seg.channel === "mic_user" ? "🎙️ Mic" : "🎧 System Audio";
          return `- **[${formatTimestampMmSs(seg.startMs)}]** **${seg.speakerName}** *(${channelBadge})*: ${seg.text}`;
        })
        .join("\n");
      lines.push("", "---", "", "## Full Diarized Transcript", transcriptLines);
    }

    return lines.join("\n");
  }

  const locale = options.locale;
  const dict = getDictionary(locale);
  const dateStr = formatRecordingDateTime(meeting.createdAt, locale);
  const overviewText = resolveSummaryOverviewText(meeting, locale);
  const emptyLine = `- ${dict.exportModal.emptyItems}`;
  const modeLabel = meeting.isHeadphoneSession
    ? dict.exportModal.headphoneMode
    : dict.exportModal.speakerMode;
  const participantsText =
    meeting.participants.join(", ") || dict.exportModal.emptyItems;

  const actionLines =
    meeting.summary.actionItems.length > 0
      ? meeting.summary.actionItems
          .map((item) => {
            const timePrefix =
              typeof item.timestampMs === "number"
                ? `[${formatTimestampMmSs(item.timestampMs)}] `
                : "";
            return `- [${item.completed ? "x" : " "}] ${timePrefix}**@${item.assignee}**: ${item.task} *(${dict.exportModal.dueLabel}: ${item.dueDate})*`;
          })
          .join("\n")
      : emptyLine;

  const decisionLines =
    meeting.summary.keyDecisions.length > 0
      ? meeting.summary.keyDecisions.map((d) => `- ${d}`).join("\n")
      : emptyLine;

  const outlineLines =
    meeting.summary.outline.length > 0
      ? meeting.summary.outline
          .map((sec) => {
            const bullets = sec.bullets.map((b) => `  - ${b}`).join("\n");
            return bullets
              ? `### [${formatTimestampMmSs(sec.timestampMs)}] ${sec.title}\n${bullets}`
              : `### [${formatTimestampMmSs(sec.timestampMs)}] ${sec.title}`;
          })
          .join("\n\n")
      : emptyLine;

  const keywordLines =
    meeting.summary.keywords
      .map((kw) => kw.replace(/^#+/, "").trim())
      .filter(Boolean)
      .map((kw) => `- #${kw}`)
      .join("\n") || emptyLine;

  const lines = [
    `# ${meeting.title}`,
    "",
    `- **${dict.exportModal.metaDate}**: ${dateStr}`,
    `- **${dict.exportModal.metaDuration}**: ${durationMins} ${dict.exportModal.durationMinutesUnit}`,
    `- **${dict.exportModal.metaDevice}**: ${meeting.audioDeviceUsed} (${modeLabel})`,
    `- **${dict.exportModal.metaParticipants}**: ${participantsText}`,
    `- **${dict.exportModal.metaModel}**: ${meeting.summary.providerUsed}`,
    "",
    "---",
    "",
    `## ${dict.summary.overviewTitle}`,
    overviewText,
    "",
    `## ${dict.summary.actionItemsTitle}`,
    actionLines,
    "",
    `## ${dict.summary.keyDecisionsTitle}`,
    decisionLines,
    "",
    `## ${dict.summary.outlineTitle}`,
    outlineLines,
    "",
    `## ${dict.summary.keywordsTitle}`,
    keywordLines,
  ];

  if (includeTranscript) {
    const transcriptLines =
      meeting.segments.length > 0
        ? meeting.segments
            .map((seg) => {
              const channelBadge =
                seg.channel === "mic_user"
                  ? `🎙️ ${dict.transcript.channelMicTag}`
                  : `🎧 ${dict.transcript.channelSystemTag}`;
              return `- **[${formatTimestampMmSs(seg.startMs)}]** **${seg.speakerName}** *(${channelBadge})*: ${seg.text}`;
            })
            .join("\n")
        : `- ${dict.errors.noTranscript}`;

    lines.push(
      "",
      "---",
      "",
      `## ${dict.exportModal.transcriptHeading}`,
      transcriptLines
    );
  }

  return lines.join("\n");
}

function mapExportError(params: {
  code: string;
  locale: SupportedLocale;
}): string {
  const { errors } = getDictionary(params.locale);
  const isMissingAudio =
    params.code === "recording_not_found" ||
    params.code === "invalid_meeting_id";
  if (isMissingAudio) {
    return errors.audioFileNotFound;
  }
  if (params.code === "export_too_large") {
    return errors.exportTooLarge;
  }
  if (params.code === "downloads_unavailable") {
    return errors.downloadsUnavailable;
  }
  return errors.exportFailed;
}

export async function cacheUploadedMeetingAudio(params: {
  meetingId: string;
  file: File;
}): Promise<void> {
  const ext = params.file.name.includes(".")
    ? (params.file.name.split(".").pop()?.toLowerCase() ?? "")
    : "";
  const matchedExt = EXPORTABLE_AUDIO_FORMATS.find((item) => item === ext);
  const format =
    matchedExt ?? MIME_TO_AUDIO_FORMAT[params.file.type.toLowerCase()];
  const isUnsupportedOrOversized =
    !format || params.file.size > MAX_UPLOAD_CACHE_BYTES;
  if (isUnsupportedOrOversized) {
    return;
  }

  try {
    const buffer =
      typeof params.file.arrayBuffer === "function"
        ? await params.file.arrayBuffer()
        : await new Promise<ArrayBuffer>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              resolve(
                reader.result instanceof ArrayBuffer
                  ? reader.result
                  : new ArrayBuffer(0)
              );
            };
            reader.onerror = () => {
              reject(reader.error ?? new Error("file_read_failed"));
            };
            reader.readAsArrayBuffer(params.file);
          });
    if (buffer.byteLength <= MAX_UPLOAD_CACHE_BYTES) {
      uploadedAudioCache.set(params.meetingId, {
        bytes: new Uint8Array(buffer),
        format,
      });
    }
  } catch (error) {
    console.error("[ExportService] Operation failed:", {
      context: "cacheUploadedMeetingAudio",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function removeCachedMeetingAudio(meetingId: string): void {
  uploadedAudioCache.delete(meetingId);
}

export function clearCachedMeetingAudio(): void {
  uploadedAudioCache.clear();
}

export async function exportMeetingMarkdown(params: {
  meeting: Meeting;
  locale: SupportedLocale;
  includeTranscript?: boolean;
}): Promise<ApiResponse<ExportedFile>> {
  try {
    const markdown = generateMeetingMarkdown(params.meeting, {
      locale: params.locale,
      includeTranscript: Boolean(params.includeTranscript),
    });
    const contentBase64 = bytesToBase64(new TextEncoder().encode(markdown));
    const data = await invoke<ExportedFile>("save_export_file", {
      fileName: buildExportFileStem(params.meeting),
      format: "md",
      contentBase64,
    });
    return { success: true, data };
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    console.error("[ExportService] Operation failed:", {
      context: "exportMeetingMarkdown",
      error: code,
    });
    return {
      success: false,
      error: mapExportError({ code, locale: params.locale }),
    };
  }
}

export async function exportMeetingPdf(params: {
  meeting: Meeting;
  locale: SupportedLocale;
  includeTranscript?: boolean;
}): Promise<ApiResponse<ExportedFile>> {
  try {
    const pdfBytes = await renderMeetingSummaryPdfBytes({
      meeting: params.meeting,
      locale: params.locale,
      includeTranscript: Boolean(params.includeTranscript),
    });
    const contentBase64 = bytesToBase64(pdfBytes);
    const data = await invoke<ExportedFile>("save_export_file", {
      fileName: buildExportFileStem(params.meeting),
      format: "pdf",
      contentBase64,
    });
    return { success: true, data };
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    console.error("[ExportService] Operation failed:", {
      context: "exportMeetingPdf",
      error: code,
    });
    return {
      success: false,
      error: mapExportError({ code, locale: params.locale }),
    };
  }
}

export async function downloadMeetingAudio(params: {
  meeting: Meeting;
  locale: SupportedLocale;
}): Promise<ApiResponse<ExportedFile>> {
  const stem = buildExportFileStem(params.meeting);
  const isBlobUpload = Boolean(params.meeting.audioDataUrl?.startsWith("blob:"));

  if (!isBlobUpload) {
    try {
      const data = await invoke<ExportedFile>("export_recording_audio", {
        meetingId: params.meeting.id,
        suggestedStem: stem,
      });
      return { success: true, data };
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error);
      const hasCachedFallback =
        code === "recording_not_found" &&
        uploadedAudioCache.has(params.meeting.id);
      if (!hasCachedFallback) {
        console.error("[ExportService] Operation failed:", {
          context: "downloadMeetingAudio:disk",
          error: code,
        });
        return {
          success: false,
          error: mapExportError({ code, locale: params.locale }),
        };
      }
    }
  }

  const cached = uploadedAudioCache.get(params.meeting.id);
  if (!cached) {
    return {
      success: false,
      error: getDictionary(params.locale).errors.audioFileNotFound,
    };
  }

  try {
    const data = await invoke<ExportedFile>("save_export_file", {
      fileName: stem,
      format: cached.format,
      contentBase64: bytesToBase64(cached.bytes),
    });
    return { success: true, data };
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    console.error("[ExportService] Operation failed:", {
      context: "downloadMeetingAudio:cache",
      error: code,
    });
    return {
      success: false,
      error: mapExportError({ code, locale: params.locale }),
    };
  }
}
