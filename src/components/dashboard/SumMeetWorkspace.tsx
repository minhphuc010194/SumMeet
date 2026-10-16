"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Bot,
  CheckCircle2,
  Clock,
  FileAudio,
  FileText,
  FolderOpen,
  Globe,
  GripHorizontal,
  GripVertical,
  Maximize2,
  Mic,
  Minimize2,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Settings,
  Share2,
  Sun,
  Trash2,
} from "lucide-react";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { CalendarAndExportModal } from "@/components/integrations/CalendarAndExportModal";
import { AskFredChatPanel } from "@/components/meeting/AskFredChatPanel";
import { SmartSummaryPanel } from "@/components/meeting/SmartSummaryPanel";
import { TranscriptViewer } from "@/components/meeting/TranscriptViewer";
import { RecordingControlBar } from "@/components/recorder/RecordingControlBar";
import { AIProviderSettingsModal } from "@/components/settings/AIProviderSettingsModal";
import { UpdateDialog } from "@/components/update/UpdateDialog";
import {
  UpdateButton,
  UpdateCheckPanel,
  UpdateMenu,
} from "@/components/update/UpdateEntryPoints";
import { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/types/meeting";
import {
  deleteAllRecordings,
  deleteRecording,
  listRecordings,
  type RecordingFile,
} from "@/services/audio/recording-commands";
import { useMeetingStore } from "@/store/meeting-store";
import {
  applyTheme,
  DARK_MEDIA_QUERY,
  useThemeStore,
  type ThemePreference,
} from "@/store/theme-store";

const NEXT_THEME: Record<ThemePreference, ThemePreference> = {
  system: "light",
  light: "dark",
  dark: "system",
};

const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon };

interface SumMeetWorkspaceProps {
  locale: SupportedLocale;
}

export function SumMeetWorkspace({ locale }: SumMeetWorkspaceProps) {
  const dict = getDictionary(locale);
  const {
    meetings,
    selectedMeetingId,
    selectMeeting,
    deleteMeeting,
    clearAllMeetings,
  } = useMeetingStore();
  const { theme, setTheme } = useThemeStore();
  const ThemeIcon = THEME_ICONS[theme];
  const themeLabel = `${dict.theme.label}: ${dict.theme[theme]}`;
  const showSidebarLabel = `${dict.nav.showSidebar} (${meetings.length})`;
  const themeToggle = (
    <button
      type="button"
      onClick={() => setTheme(NEXT_THEME[theme])}
      title={themeLabel}
      aria-label={themeLabel}
      className="rounded-lg border border-slate-800 bg-slate-950 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-50"
    >
      <ThemeIcon className="h-4 w-4" />
    </button>
  );

  useEffect(() => {
    void useThemeStore.persist.rehydrate();
    const media = window.matchMedia(DARK_MEDIA_QUERY);
    const syncWithSystem = () => applyTheme(useThemeStore.getState().theme);
    media.addEventListener("change", syncWithSystem);
    return () => media.removeEventListener("change", syncWithSystem);
  }, []);

  const [rightTab, setRightTab] = useState<"summary" | "askFred">("summary");
  const [modalMode, setModalMode] = useState<"calendar" | "export" | null>(
    null
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [mainSplitRatio, setMainSplitRatio] = useState<number>(54);
  const [mainPaneHeight, setMainPaneHeight] = useState<number>(640);
  const mainSplitContainerRef = useRef<HTMLDivElement | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [diskFiles, setDiskFiles] = useState<RecordingFile[]>([]);
  const [recordingsDir, setRecordingsDir] = useState("");

  const triggerToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage((prev) => (prev === message ? null : prev));
    }, 3500);
  }, []);

  const refreshDiskFiles = useCallback(async () => {
    const listing = await listRecordings(locale);
    if (listing.success && listing.data) {
      setDiskFiles(listing.data.files);
      setRecordingsDir(listing.data.recordingsDir);
    }
  }, [locale]);

  useEffect(() => {
    void refreshDiskFiles();
  }, [refreshDiskFiles, meetings.length]);

  const handleDeleteSingleRecording = async (
    meetingId: string,
    title?: string
  ) => {
    const deleted = await deleteRecording({ meetingId, locale });
    if (!deleted.success) {
      triggerToast(deleted.error ?? dict.errors.recordingFailed);
      return;
    }
    deleteMeeting(meetingId);
    await refreshDiskFiles();
    triggerToast(
      dict.workspace.recordingDeleted.replace("{name}", title ?? meetingId)
    );
  };

  const handleClearAllRecordings = async () => {
    const cleared = await deleteAllRecordings(locale);
    if (!cleared.success) {
      triggerToast(cleared.error ?? dict.errors.recordingFailed);
      return;
    }
    clearAllMeetings();
    await refreshDiskFiles();
    triggerToast(dict.workspace.allCleared);
  };

  const handleStartMainHorizontalResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = mainSplitContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    const onMouseMove = (moveEvent: MouseEvent) => {
      const relativeX = moveEvent.clientX - rect.left;
      const pct = Math.min(78, Math.max(22, (relativeX / rect.width) * 100));
      setMainSplitRatio(Math.round(pct));
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleStartMainVerticalResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = mainPaneHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const nextHeight = Math.min(1200, Math.max(360, startHeight + deltaY));
      setMainPaneHeight(nextHeight);
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const activeMeeting =
    meetings.find((m) => m.id === selectedMeetingId) ?? meetings[0];

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 lg:h-screen lg:flex-row lg:overflow-hidden">
      {/* Left Navigation & Recording Manager Sidebar */}
      {!isSidebarCollapsed && (
        <aside className="flex w-full shrink-0 flex-col border-b border-slate-800/90 bg-slate-900/90 lg:w-80 lg:border-r lg:border-b-0">
          {/* Brand Header */}
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <Image
                src="/logo-mark.png"
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 rounded-xl shadow-md shadow-orange-600/20"
              />
              <div>
                <h1 className="text-sm font-bold tracking-tight text-slate-50">
                  {dict.appName}
                </h1>
                <p className="text-[10px] text-orange-300">
                  {dict.workspace.brandSubtitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Locale Switcher */}
              <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-[11px]">
                <Globe className="ml-1.5 h-3 w-3 text-slate-400" />
                <Link
                  href="/vi"
                  className={`rounded-md px-2 py-0.5 font-semibold transition ${
                    locale === "vi"
                      ? "bg-orange-600 text-white"
                      : "text-slate-400 hover:text-slate-50"
                  }`}
                >
                  VI
                </Link>
                <Link
                  href="/en"
                  className={`rounded-md px-2 py-0.5 font-semibold transition ${
                    locale === "en"
                      ? "bg-orange-600 text-white"
                      : "text-slate-400 hover:text-slate-50"
                  }`}
                >
                  EN
                </Link>
              </div>

              {themeToggle}

              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(true)}
                title={dict.workspace.collapseSidebar}
                className="hidden rounded-lg border border-slate-800 bg-slate-950 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-50 lg:inline-flex"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Recording Sessions & Disk File Manager */}
          <div className="flex-1 space-y-4 overflow-y-auto p-3">
            {/* Section 1: Meeting Recordings List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1 py-1">
                <span className="text-[11px] font-bold tracking-wider text-slate-300 uppercase">
                  {dict.workspace.recordingsHeading.replace(
                    "{count}",
                    String(meetings.length)
                  )}
                </span>

                {(meetings.length > 0 || diskFiles.length > 0) && (
                  <button
                    type="button"
                    onClick={handleClearAllRecordings}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/15 px-2 py-1 text-[11px] font-semibold text-rose-300 transition hover:bg-rose-600 hover:text-white"
                  >
                    <Trash2 className="h-3 w-3" />
                    {dict.workspace.clearAll}
                  </button>
                )}
              </div>

              {meetings.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/50 p-4 text-center">
                  <Mic className="mx-auto mb-2 h-6 w-6 text-slate-500" />
                  <p className="text-xs font-medium text-slate-300">
                    {dict.workspace.emptyListTitle}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {dict.workspace.emptyListHint}
                  </p>
                </div>
              ) : (
                meetings.map((mtg) => {
                  const isSelected = mtg.id === activeMeeting?.id;
                  return (
                    <div
                      key={mtg.id}
                      className={`group relative rounded-xl border p-3 transition ${
                        isSelected
                          ? "border-orange-500/60 bg-orange-950/40 shadow-sm"
                          : "border-slate-800/70 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-900"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => selectMeeting(mtg.id)}
                          className="flex-1 text-left"
                        >
                          <h2 className="line-clamp-2 text-xs font-semibold text-slate-50">
                            {mtg.title}
                          </h2>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {mtg.durationSeconds}s
                            </span>
                            <span>•</span>
                            <span className="text-orange-300">
                              {mtg.segments.length} {dict.workspace.segmentsUnit}
                            </span>
                          </div>
                        </button>

                        <button
                          type="button"
                          title={dict.workspace.deleteRecordingTitle}
                          onClick={() =>
                            handleDeleteSingleRecording(mtg.id, mtg.title)
                          }
                          className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-1.5 text-rose-300 transition hover:bg-rose-600 hover:text-white"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Section 2: Physical Audio Files Manager (/recordings/*.wav) */}
            <div className="border-t border-slate-800/80 pt-3">
              <div className="flex items-center justify-between px-1 pb-2">
                <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-slate-300 uppercase">
                  <FolderOpen className="h-3.5 w-3.5 text-amber-400" />
                  {dict.workspace.savedFilesHeading.replace(
                    "{count}",
                    String(diskFiles.length)
                  )}
                </span>
                <button
                  type="button"
                  onClick={refreshDiskFiles}
                  className="inline-flex items-center gap-1 text-[11px] text-orange-400 hover:underline"
                >
                  <RefreshCw className="h-3 w-3" />
                  {dict.workspace.refresh}
                </button>
              </div>

              {recordingsDir && (
                <p className="mb-2 break-all rounded-lg bg-slate-950 px-2.5 py-1.5 font-mono text-[10px] text-slate-400">
                  📂 {recordingsDir}
                </p>
              )}

              {diskFiles.length === 0 ? (
                <p className="px-1 text-[11px] text-slate-400">
                  {dict.workspace.noSavedFiles}
                </p>
              ) : (
                <div className="space-y-2">
                  {diskFiles.map((file) => (
                    <div
                      key={file.fileName}
                      className="rounded-xl border border-slate-800 bg-slate-950/70 p-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 truncate font-semibold text-slate-200">
                          <FileAudio className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          <span className="truncate">{file.fileName}</span>
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              handleDeleteSingleRecording(
                                file.meetingId,
                                file.fileName
                              )
                            }
                            title={dict.workspace.deleteFileTitle}
                            className="rounded-md bg-rose-500/15 p-1 text-rose-300 hover:bg-rose-600 hover:text-white"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                        <span>{formatBytes(file.sizeBytes)}</span>
                        <span>
                          {new Date(file.createdAtMs).toLocaleTimeString(
                            locale === "vi" ? "vi-VN" : "en-US"
                          )}
                        </span>
                      </div>

                      <audio
                        controls
                        src={convertFileSrc(file.wavPath)}
                        className="mt-2 h-7 w-full rounded"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <UpdateButton locale={locale} className="mr-3 mb-2 self-end" />

          {/* Bottom Sidebar Actions */}
          <div className="grid grid-cols-2 gap-2 border-t border-slate-800 p-3">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              <Settings className="h-3.5 w-3.5 text-orange-400" />
              {dict.nav.settings}
            </button>

            <button
              type="button"
              disabled={!activeMeeting}
              onClick={() => setModalMode("export")}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-orange-500/40 bg-orange-500/15 px-3 py-2 text-xs font-semibold text-orange-200 hover:bg-orange-600 hover:text-white disabled:opacity-40"
            >
              <Share2 className="h-3.5 w-3.5" />
              {dict.nav.exportShare}
            </button>
          </div>
        </aside>
      )}

      {isSidebarCollapsed && (
        <aside className="flex shrink-0 items-center gap-2 border-b border-slate-800/90 bg-slate-900/90 px-3 py-2 lg:w-16 lg:flex-col lg:border-r lg:border-b-0 lg:px-0 lg:py-3.5">
          <Image
            src="/logo-mark.png"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 rounded-xl shadow-md shadow-orange-600/20"
          />

          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(false)}
            title={showSidebarLabel}
            aria-label={showSidebarLabel}
            className="relative rounded-lg border border-orange-500/30 bg-orange-500/15 p-1.5 text-orange-300 hover:bg-orange-500/25 lg:mt-2"
          >
            <PanelLeftOpen className="h-4 w-4" />
            {meetings.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-4 rounded-full bg-orange-600 px-1 text-center text-[9px] leading-4 font-bold text-white">
                {meetings.length}
              </span>
            )}
          </button>

          <div className="ml-auto flex items-center gap-2 lg:mt-auto lg:ml-0 lg:flex-col">
            <UpdateButton locale={locale} />
            {themeToggle}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              title={dict.nav.settings}
              aria-label={dict.nav.settings}
              className="rounded-lg border border-slate-800 bg-slate-950 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-50"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </aside>
      )}

      {/* Main Content Area (Scrollable so resized panels never get cut off) */}
      <main className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {/* Toast Banner */}
        {toastMessage && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/80 px-4 py-2 text-xs font-medium text-emerald-200 shadow-lg"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Top One-Click Recording Control Bar */}
        <ErrorBoundary
          sectionName="RecordingControlBar"
          fallbackTitle={dict.errors.boundaryTitle}
          retryLabel={dict.errors.boundaryRetry}
        >
          <RecordingControlBar
            dict={dict}
            locale={locale}
            onToast={triggerToast}
            onRecordingCompleted={() => {
              setRightTab("summary");
              void refreshDiskFiles();
            }}
          />
        </ErrorBoundary>

        {/* Active Meeting View OR Clean Empty State */}
        {activeMeeting ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800/90 bg-slate-900/60 px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-50">
                    {activeMeeting.title}
                  </h2>
                  <p className="text-xs text-slate-400">
                    🎧 {activeMeeting.audioDeviceUsed} • 👥{" "}
                    {activeMeeting.participants.join(", ")}
                  </p>
                </div>

                {activeMeeting.audioDataUrl && (
                  <audio
                    controls
                    src={activeMeeting.audioDataUrl}
                    className="h-8 max-w-[260px] rounded-lg"
                  />
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Quick Resize Presets for Main Panels */}
                <div className="hidden items-center gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1 text-[11px] lg:flex">
                  <button
                    type="button"
                    onClick={() => {
                      setMainSplitRatio(50);
                      setMainPaneHeight(540);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-medium text-slate-300 hover:bg-slate-800 hover:text-slate-50"
                  >
                    <Minimize2 className="h-3 w-3" />
                    50 / 50
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMainSplitRatio(65);
                      setMainPaneHeight(760);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-medium text-orange-300 hover:bg-orange-600 hover:text-white"
                  >
                    <Maximize2 className="h-3 w-3" />
                    {dict.workspace.wideTranscript}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMainSplitRatio(35);
                      setMainPaneHeight(760);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-medium text-emerald-300 hover:bg-emerald-600 hover:text-white"
                  >
                    <Maximize2 className="h-3 w-3" />
                    {dict.workspace.wideSummary}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    handleDeleteSingleRecording(
                      activeMeeting.id,
                      activeMeeting.title
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-600 hover:text-white"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {dict.workspace.deleteActiveRecording}
                </button>

                {/* Right Panel Tab Switcher */}
                <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 p-1">
                  <button
                    type="button"
                    onClick={() => setRightTab("summary")}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      rightTab === "summary"
                        ? "bg-orange-600 text-white"
                        : "text-slate-400 hover:text-slate-50"
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {dict.tabs.summary}
                  </button>

                  <button
                    type="button"
                    onClick={() => setRightTab("askFred")}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      rightTab === "askFred"
                        ? "bg-orange-600 text-white"
                        : "text-slate-400 hover:text-slate-50"
                    }`}
                  >
                    <Bot className="h-3.5 w-3.5" />
                    {dict.tabs.askFred}
                    <span className="rounded-full bg-orange-500/30 px-1.5 py-0.2 text-[10px]">
                      AI
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Resizable Main Split View (Transcript on Left, Summary/AskFred on Right) */}
            <div
              ref={mainSplitContainerRef}
              className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-0"
            >
              <div
                style={{
                  width:
                    typeof window !== "undefined" && window.innerWidth < 1024
                      ? "100%"
                      : `${mainSplitRatio}%`,
                  height: `${mainPaneHeight}px`,
                }}
                className="min-h-[420px] min-w-0 resize-y overflow-hidden"
              >
                <ErrorBoundary
                  sectionName="TranscriptViewer"
                  fallbackTitle={dict.errors.boundaryTitle}
                  retryLabel={dict.errors.boundaryRetry}
                >
                  <TranscriptViewer
                    meeting={activeMeeting}
                    dict={dict}
                    onToast={triggerToast}
                  />
                </ErrorBoundary>
              </div>

              {/* Horizontal Drag Handle between Main Transcript & Summary */}
              <div
                role="separator"
                aria-orientation="vertical"
                onMouseDown={handleStartMainHorizontalResize}
                title={dict.workspace.resizePanelsTitle}
                className="group hidden w-3.5 shrink-0 cursor-col-resize items-center justify-center lg:flex"
              >
                <div className="flex h-24 w-1.5 items-center justify-center rounded-full bg-slate-800 transition group-hover:bg-orange-500">
                  <GripVertical className="h-4 w-4 text-slate-400 group-hover:text-slate-50" />
                </div>
              </div>

              <div
                style={{
                  width:
                    typeof window !== "undefined" && window.innerWidth < 1024
                      ? "100%"
                      : `${100 - mainSplitRatio}%`,
                  height: `${mainPaneHeight}px`,
                }}
                className="min-h-[420px] min-w-0 resize-y overflow-hidden"
              >
                <ErrorBoundary
                  sectionName="RightIntelligencePanel"
                  fallbackTitle={dict.errors.boundaryTitle}
                  retryLabel={dict.errors.boundaryRetry}
                >
                  {rightTab === "summary" ? (
                    <SmartSummaryPanel
                      meeting={activeMeeting}
                      dict={dict}
                      locale={locale}
                      onToast={triggerToast}
                    />
                  ) : (
                    <AskFredChatPanel
                      meeting={activeMeeting}
                      dict={dict}
                      locale={locale}
                      onToast={triggerToast}
                    />
                  )}
                </ErrorBoundary>
              </div>
            </div>

            {/* Bottom Vertical Drag Handle for Main Split View */}
            <div
              role="separator"
              aria-orientation="horizontal"
              onMouseDown={handleStartMainVerticalResize}
              title={dict.workspace.resizeHeightTitle}
              className="group flex h-4 w-full cursor-row-resize items-center justify-center rounded-xl border border-slate-800/80 bg-slate-900/70 transition hover:border-orange-500/50 hover:bg-orange-950/40"
            >
              <GripHorizontal className="h-4 w-4 text-slate-400 group-hover:text-orange-300" />
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/15 text-orange-400">
              <Mic className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-slate-50">
              {dict.workspace.emptyStateTitle}
            </h3>
            <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-400">
              {dict.workspace.emptyStateHint}
            </p>
          </div>
        )}
      </main>

      {/* Modals */}
      {activeMeeting && (
        <CalendarAndExportModal
          mode={modalMode}
          onClose={() => setModalMode(null)}
          meeting={activeMeeting}
          dict={dict}
          onToast={triggerToast}
        />
      )}

      <AIProviderSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        dict={dict}
        onToast={triggerToast}
      />

      <UpdateDialog locale={locale} />
      <UpdateCheckPanel locale={locale} />
      <UpdateMenu locale={locale} />
    </div>
  );
}
