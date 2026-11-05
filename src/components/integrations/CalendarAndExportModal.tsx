"use client";

import React, { useState } from "react";
import {
  Check,
  Copy,
  Download,
  FileAudio,
  FileDown,
  FileText,
  Loader2,
  Video,
} from "lucide-react";
import { ModalDialog } from "@/components/common/ModalDialog";
import type { Dictionary } from "@/i18n/dictionaries";
import {
  downloadMeetingAudio,
  exportMeetingMarkdown,
  exportMeetingPdf,
  formatRecordingDateShort,
  formatRecordingDateTime,
  generateMeetingMarkdown,
} from "@/services/export/export-service";
import { useMeetingStore } from "@/store/meeting-store";
import type { Meeting } from "@/types/meeting";

interface CalendarAndExportModalProps {
  mode: "calendar" | "export" | null;
  onClose: () => void;
  meeting: Meeting;
  dict: Dictionary;
  onToast: (message: string) => void;
}

export function CalendarAndExportModal({
  mode,
  onClose,
  meeting,
  dict,
  onToast,
}: CalendarAndExportModalProps) {
  const { calendarEvents, createMeetingSession, addCalendarEvent } =
    useMeetingStore();

  const [icalUrl, setIcalUrl] = useState(
    "https://calendar.google.com/calendar/ical/team%40company.com/basic.ics"
  );
  const [copiedMd, setCopiedMd] = useState(false);
  const [includeTranscript, setIncludeTranscript] = useState(false);
  const [busyAction, setBusyAction] = useState<"md" | "pdf" | "audio" | null>(
    null
  );

  if (!mode) {
    return null;
  }

  const isExportBusy = busyAction !== null;
  const markdownContent = generateMeetingMarkdown(meeting, {
    locale: dict.locale,
    includeTranscript,
  });

  const formattedDateTime = formatRecordingDateTime(
    meeting.createdAt,
    dict.locale
  );
  const shortDate = formatRecordingDateShort(meeting.createdAt, dict.locale);
  const parsedDate = new Date(meeting.createdAt);
  const isoDate = Number.isNaN(parsedDate.getTime())
    ? ""
    : `${String(parsedDate.getFullYear()).padStart(4, "0")}-${String(
        parsedDate.getMonth() + 1
      ).padStart(2, "0")}-${String(parsedDate.getDate()).padStart(2, "0")}`;
  const hasShortDate = Boolean(shortDate) && meeting.title.includes(shortDate);
  const hasIsoDate = Boolean(isoDate) && meeting.title.includes(isoDate);
  const hasDateInTitle = hasShortDate || hasIsoDate;
  const exportSubtitle = hasDateInTitle
    ? meeting.title
    : `${meeting.title} • ${formattedDateTime}`;

  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(markdownContent);
      setCopiedMd(true);
      onToast(dict.exportModal.copied);
      setTimeout(() => setCopiedMd(false), 2000);
    } catch (error) {
      console.error("[CalendarAndExportModal] Operation failed:", {
        context: "copyMarkdown",
        error: error instanceof Error ? error.message : String(error),
      });
      onToast(dict.errors.exportFailed);
    }
  };

  const handleDownloadMarkdown = async () => {
    setBusyAction("md");
    try {
      const result = await exportMeetingMarkdown({
        meeting,
        locale: dict.locale,
        includeTranscript,
      });
      if (!result.success) {
        onToast(result.error ?? dict.errors.exportFailed);
      } else if (result.data !== null && result.data !== undefined) {
        onToast(
          dict.exportModal.savedToPath.replace("{path}", result.data.savedPath)
        );
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownloadPdf = async () => {
    setBusyAction("pdf");
    try {
      const result = await exportMeetingPdf({
        meeting,
        locale: dict.locale,
        includeTranscript,
      });
      if (!result.success) {
        onToast(result.error ?? dict.errors.exportFailed);
      } else if (result.data !== null && result.data !== undefined) {
        onToast(
          dict.exportModal.savedToPath.replace("{path}", result.data.savedPath)
        );
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownloadAudio = async () => {
    setBusyAction("audio");
    try {
      const result = await downloadMeetingAudio({
        meeting,
        locale: dict.locale,
      });
      if (!result.success) {
        onToast(result.error ?? dict.errors.audioFileNotFound);
      } else if (result.data !== null && result.data !== undefined) {
        onToast(
          dict.exportModal.savedToPath.replace("{path}", result.data.savedPath)
        );
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleSyncCalendarFeed = (e: React.FormEvent) => {
    e.preventDefault();
    if (!icalUrl.trim()) return;
    addCalendarEvent({
      id: `cal-sync-${Date.now()}`,
      title: dict.calendar.syncedEventTitle,
      startTime: dict.calendar.syncedEventStart,
      endTime: "18:15",
      platform: "Google Meet",
      meetingUrl: "https://meet.google.com/xyz-uvwx-rst",
      participants: dict.calendar.syncedEventParticipants,
    });
    onToast(dict.calendar.syncedToast);
  };

  if (mode === "calendar") {
    return (
      <ModalDialog
        isOpen={true}
        onClose={onClose}
        title={dict.calendar.modalTitle}
        subtitle={dict.calendar.upcomingTitle}
      >
        <div className="space-y-4">
          <form onSubmit={handleSyncCalendarFeed} className="space-y-2">
            <label className="block text-xs font-medium text-slate-300">
              {dict.calendar.syncIcalLabel}
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={icalUrl}
                onChange={(e) => setIcalUrl(e.target.value)}
                className="h-8 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100"
              />
              <button
                type="submit"
                className="h-8 rounded-lg bg-orange-600 px-3 text-xs font-semibold text-white hover:bg-orange-500"
              >
                {dict.calendar.syncButton}
              </button>
            </div>
          </form>

          <div className="space-y-2 pt-1">
            {calendarEvents.map((evt) => (
              <div
                key={evt.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-orange-500/20 px-2 py-0.5 text-[11px] font-semibold text-orange-300">
                      {evt.platform}
                    </span>
                    <h4 className="text-sm font-semibold text-slate-50">
                      {evt.title}
                    </h4>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    🕒 {evt.startTime} - {evt.endTime} • 👥{" "}
                    {evt.participants.join(", ")}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    createMeetingSession({
                      title: evt.title,
                      audioDeviceUsed: dict.calendar.sessionDevice,
                      isHeadphoneSession: true,
                      locale: dict.locale,
                      participants: evt.participants,
                      calendarEventId: evt.id,
                    });
                    onClose();
                    onToast(
                      dict.calendar.sessionCreatedToast.replace(
                        "{title}",
                        evt.title
                      )
                    );
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  <Video className="h-3.5 w-3.5" />
                  {dict.calendar.recordThisMeeting}
                </button>
              </div>
            ))}
          </div>
        </div>
      </ModalDialog>
    );
  }

  return (
    <ModalDialog
      isOpen={true}
      onClose={onClose}
      title={dict.exportModal.title}
      subtitle={exportSubtitle}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isExportBusy}
              onClick={handleCopyMarkdown}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-50"
            >
              {copiedMd ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-orange-400" />
              )}
              {copiedMd ? dict.exportModal.copied : dict.exportModal.copyMarkdown}
            </button>

            <button
              type="button"
              disabled={isExportBusy}
              aria-busy={busyAction === "md"}
              onClick={handleDownloadMarkdown}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-orange-600 px-3 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
            >
              {busyAction === "md" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {dict.exportModal.downloadMarkdown}
            </button>

            <button
              type="button"
              disabled={isExportBusy}
              aria-busy={busyAction === "pdf"}
              onClick={handleDownloadPdf}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-50"
            >
              {busyAction === "pdf" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-400" />
              ) : (
                <FileDown className="h-3.5 w-3.5 text-orange-400" />
              )}
              {dict.exportModal.downloadPdf}
            </button>

            <button
              type="button"
              disabled={isExportBusy}
              aria-busy={busyAction === "audio"}
              onClick={handleDownloadAudio}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-50"
            >
              {busyAction === "audio" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
              ) : (
                <FileAudio className="h-3.5 w-3.5 text-emerald-400" />
              )}
              {dict.exportModal.downloadAudio}
            </button>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-xs font-medium text-slate-200 select-none">
            <input
              type="checkbox"
              checked={includeTranscript}
              disabled={isExportBusy}
              onChange={(e) => setIncludeTranscript(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-600 accent-orange-600"
            />
            <span>{dict.exportModal.includeTranscript}</span>
          </label>
        </div>

        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <FileText className="h-3.5 w-3.5 text-orange-400" />
            {dict.exportModal.markdownPreview}
          </label>
          <pre className="max-h-72 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-3.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-slate-300">
            {markdownContent}
          </pre>
        </div>
      </div>
    </ModalDialog>
  );
}
