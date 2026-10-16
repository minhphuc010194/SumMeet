"use client";

import React, { useState } from "react";
import {
  Calendar,
  Check,
  Copy,
  Download,
  FileText,
  Printer,
  Video,
} from "lucide-react";
import { ModalDialog } from "@/components/common/ModalDialog";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Meeting } from "@/types/meeting";
import { generateMeetingMarkdown } from "@/services/export/export-service";
import { useMeetingStore } from "@/store/meeting-store";

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

  const markdownContent = generateMeetingMarkdown(meeting);

  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(markdownContent);
      setCopiedMd(true);
      onToast(dict.exportModal.copied);
      setTimeout(() => setCopiedMd(false), 2000);
    } catch (error) {
      console.error("[CalendarAndExportModal] Clipboard write failed:", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleDownloadMarkdown = () => {
    const blob = new Blob([markdownContent], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${meeting.title.replace(/\s+/g, "-")}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onToast(dict.exportModal.downloaded);
  };

  const handlePrintPdf = () => {
    window.print();
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
                className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
              />
              <button
                type="submit"
                className="rounded-xl bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-500"
              >
                {dict.calendar.syncButton}
              </button>
            </div>
          </form>

          <div className="space-y-2.5 pt-2">
            {calendarEvents.map((evt) => (
              <div
                key={evt.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5"
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
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
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
      isOpen={mode === "export"}
      onClose={onClose}
      title={dict.exportModal.title}
      subtitle={meeting.title}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopyMarkdown}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700"
          >
            {copiedMd ? (
              <Check className="h-4 w-4 text-emerald-400" />
            ) : (
              <Copy className="h-4 w-4 text-orange-400" />
            )}
            {copiedMd ? dict.exportModal.copied : dict.exportModal.copyMarkdown}
          </button>

          <button
            type="button"
            onClick={handleDownloadMarkdown}
            className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-orange-500"
          >
            <Download className="h-4 w-4" />
            {dict.exportModal.downloadMarkdown}
          </button>

          <button
            type="button"
            onClick={handlePrintPdf}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700"
          >
            <Printer className="h-4 w-4 text-orange-400" />
            {dict.exportModal.printPdfButton}
          </button>
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
