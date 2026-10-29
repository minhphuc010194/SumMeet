"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Headphones,
  Loader2,
  Mic,
  PhoneCall,
  Square,
  Upload,
  Volume2,
} from "lucide-react";
import type { Dictionary } from "@/i18n/dictionaries";
import type {
  AudioDeviceItem,
  DualStreamStatus,
  SupportedLocale,
} from "@/types/meeting";
import { generateSummaryWithFallback } from "@/services/ai/provider-registry";
import {
  createInitialDualStreamStatus,
  enumerateDualStreamDevices,
} from "@/services/audio/dual-stream-bridge";
import { transcribeUploadedMedia } from "@/services/audio/media-upload";
import {
  announceCallDetection,
  requestCallAttention,
  subscribeCallActions,
  subscribeMicActivity,
} from "@/services/audio/mic-activity";
import {
  getActiveRecording,
  startMicRecording,
  stopMicRecording,
  type RecordingTrack,
} from "@/services/audio/recording-commands";
import {
  transcribeRecordingSlice,
  transcribeRecordingTail,
} from "@/services/audio/recording-transcription";
import { useMeetingStore } from "@/store/meeting-store";

interface RecordingControlBarProps {
  dict: Dictionary;
  locale: SupportedLocale;
  onToast: (message: string) => void;
  onRecordingCompleted?: () => void;
}

const SINGLE_TRACK: { track?: RecordingTrack }[] = [{}];
const MIC_AND_SYSTEM_TRACKS: { track?: RecordingTrack }[] = [
  { track: "mic" },
  { track: "system" },
];

function transcribedSecFor(track?: RecordingTrack) {
  const { recordingTranscribedSec, recordingSystemTranscribedSec } =
    useMeetingStore.getState();
  return track === "system"
    ? recordingSystemTranscribedSec
    : recordingTranscribedSec;
}

function SignalMeter({ label, level }: { label: string; level: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-slate-400">{label}</span>
      <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-emerald-400 transition-all duration-150"
          style={{ width: `${Math.max(10, Math.round(level * 100))}%` }}
        />
      </div>
    </div>
  );
}

export function RecordingControlBar({
  dict,
  locale,
  onToast,
  onRecordingCompleted,
}: RecordingControlBarProps) {
  const {
    selectMeeting,
    createMeetingSession,
    deleteMeeting,
    appendTranscriptSegment,
    completeMeetingRecording,
    setRecordingTranscribedSec,
    setRecordingSystemTranscribedSec,
    preferredInputDeviceId,
    setPreferredInputDeviceId,
    includeSystemAudio,
    setIncludeSystemAudio,
    markCallDetectionAnnounced,
  } = useMeetingStore();

  const [status, setStatus] = useState<DualStreamStatus>(() =>
    createInitialDualStreamStatus()
  );
  const [inputDevices, setInputDevices] = useState<AudioDeviceItem[]>([]);
  const [isProcessingResult, setIsProcessingResult] = useState(false);
  const [isRecoveryPending, setIsRecoveryPending] = useState(true);
  const [isDeviceListPending, setIsDeviceListPending] = useState(true);
  const [isLiveTranscribingChunk, setIsLiveTranscribingChunk] = useState(false);
  const [systemAudioSupported, setSystemAudioSupported] = useState(false);
  const [hasSystemAudio, setHasSystemAudio] = useState(false);
  const [processingStepText, setProcessingStepText] = useState("");
  const [spokenCount, setSpokenCount] = useState(0);
  const [isCallSuggestionVisible, setIsCallSuggestionVisible] = useState(false);
  const [detectedCallApp, setDetectedCallApp] = useState<string | null>(null);
  const isCallDetectionEnabled = useMeetingStore(
    (state) => state.settings.callDetectionEnabled
  );

  const activeMeetingIdRef = useRef<string | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveChunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastDeviceSignatureRef = useRef<string | null>(null);
  const isRecordingRef = useRef(false);
  const canSuggestCallRef = useRef(false);
  const wasOtherAppActiveRef = useRef(false);
  const recordFromNotificationRef = useRef<() => void>(() => {});
  const hasSystemAudioRef = useRef(false);
  const lastSystemSoundAtMsRef = useRef(0);
  const isSilentHintShownRef = useRef(false);
  const chunkInFlightRef = useRef<Promise<void> | null>(null);

  const refreshDevices = useCallback(
    async (announceIfChanged = false) => {
      try {
        const result = await enumerateDualStreamDevices();
        const nextSignature = `${result.activeInputName}::${result.activeOutputName}`;
        const previousSignature = lastDeviceSignatureRef.current;
        const hasHardwareRouteChanged =
          previousSignature !== null && previousSignature !== nextSignature;
        lastDeviceSignatureRef.current = nextSignature;

        setInputDevices(
          result.devices.filter((device) => device.kind === "audioinput")
        );
        setSystemAudioSupported(result.systemAudioSupported);
        setStatus((prev) => ({
          ...prev,
          activeInputDeviceName: result.activeInputName,
          activeOutputDeviceName: result.activeOutputName,
          isHeadphoneOrAirPodsActive: result.isHeadphoneOrAirPodsActive,
          inputSampleRate: result.inputSampleRate,
          systemSampleRate: result.systemSampleRate,
          echoGateEnabled: !result.isHeadphoneOrAirPodsActive,
          hotSwapCount: hasHardwareRouteChanged
            ? prev.hotSwapCount + 1
            : prev.hotSwapCount,
        }));

        if (hasHardwareRouteChanged || announceIfChanged) {
          onToast(
            dict.recorder.deviceSwitched.replace(
              "{device}",
              result.activeOutputName
            )
          );
        }
      } catch (error) {
        console.error("[RecordingControlBar] Device check warning:", {
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setIsDeviceListPending(false);
      }
    },
    [dict, onToast]
  );

  useEffect(() => {
    isRecordingRef.current = status.isRecording;
  }, [status.isRecording]);

  const isCaptureIdle = !status.isRecording && !isProcessingResult;
  const canSuggestCall = isCallDetectionEnabled && isCaptureIdle;

  useEffect(() => {
    canSuggestCallRef.current = canSuggestCall;
    if (!canSuggestCall) {
      setIsCallSuggestionVisible(false);
      setDetectedCallApp(null);
    }
  }, [canSuggestCall]);

  useEffect(() => {
    if (!isCallDetectionEnabled) return;
    if (useMeetingStore.getState().hasAnnouncedCallDetection) return;
    markCallDetectionAnnounced();
    void announceCallDetection({
      title: dict.recorder.callDetectionIntroTitle,
      body: dict.recorder.callDetectionIntroBody,
    });
  }, [isCallDetectionEnabled, dict, markCallDetectionAnnounced]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: () => void = () => {};

    void subscribeMicActivity((otherAppActive, activeApp) => {
      const hasJustBecomeActive =
        otherAppActive && !wasOtherAppActiveRef.current;
      wasOtherAppActiveRef.current = otherAppActive;
      if (!otherAppActive) {
        setIsCallSuggestionVisible(false);
        setDetectedCallApp(null);
        return;
      }
      if (hasJustBecomeActive && canSuggestCallRef.current) {
        const appName = activeApp ?? null;
        setDetectedCallApp(appName);
        setIsCallSuggestionVisible(true);
        void requestCallAttention({
          title: dict.recorder.callDetectedTitle,
          body: appName
            ? dict.recorder.callDetectedAppBody.replace("{app}", appName)
            : dict.recorder.callDetectedBody,
        });
      }
    }).then((stop) => {
      if (cancelled) stop();
      else unsubscribe = stop;
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [dict]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: () => void = () => {};

    void subscribeCallActions({
      recordTitle: dict.recorder.callDetectedAction,
      onRecord: () => recordFromNotificationRef.current(),
    }).then((stop) => {
      if (cancelled) stop();
      else unsubscribe = stop;
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [dict]);

  useEffect(() => {
    hasSystemAudioRef.current = hasSystemAudio;
  }, [hasSystemAudio]);

  useEffect(() => {
    refreshDevices(false);
    const intervalId = setInterval(() => refreshDevices(false), 3000);
    return () => clearInterval(intervalId);
  }, [refreshDevices]);

  const stopCaptureTimers = useCallback(() => {
    if (statusTimerRef.current) {
      clearInterval(statusTimerRef.current);
      statusTimerRef.current = null;
    }
    if (liveChunkTimerRef.current) {
      clearInterval(liveChunkTimerRef.current);
      liveChunkTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopCaptureTimers();
  }, [stopCaptureTimers]);

  const transcribeLatestRecordedSlice = useCallback(() => {
    const meetingId = activeMeetingIdRef.current;
    if (!meetingId || chunkInFlightRef.current) return;

    const transcribeSlice = async () => {
      setIsLiveTranscribingChunk(true);
      try {
        const { openRouterKey, settings } = useMeetingStore.getState();
        const tracks = hasSystemAudioRef.current
          ? MIC_AND_SYSTEM_TRACKS
          : SINGLE_TRACK;
        for (const trackParams of tracks) {
          const result = await transcribeRecordingSlice({
            meetingId,
            startSec: transcribedSecFor(trackParams.track),
            minSliceSec: 3,
            apiKey: openRouterKey,
            model: settings.openRouterModel,
            locale,
            transcriptionLanguage: settings.transcriptionLanguage,
            ...trackParams,
          });
          if (!result.success || !result.data) continue;

          const { segments, nextStartSec } = result.data;
          segments.forEach((seg) => appendTranscriptSegment(meetingId, seg));
          if (trackParams.track === "system") {
            setRecordingSystemTranscribedSec(nextStartSec);
          } else {
            setRecordingTranscribedSec(nextStartSec);
          }
          setSpokenCount((count) => count + segments.length);
        }
      } finally {
        setIsLiveTranscribingChunk(false);
        chunkInFlightRef.current = null;
      }
    };

    chunkInFlightRef.current = transcribeSlice();
  }, [
    appendTranscriptSegment,
    locale,
    setRecordingSystemTranscribedSec,
    setRecordingTranscribedSec,
  ]);

  const startCaptureTimers = useCallback(() => {
    statusTimerRef.current = setInterval(async () => {
      const polled = await getActiveRecording(locale);
      const active = polled.data;
      if (!active) return;
      setStatus((prev) => ({
        ...prev,
        durationSeconds: Math.floor(active.elapsedSec),
        micLevel: active.level,
        systemLevel: active.systemLevel,
      }));

      if (active.systemLevel > 0) {
        lastSystemSoundAtMsRef.current = Date.now();
      }
      const isSystemSilent =
        active.hasSystemAudio &&
        Date.now() - lastSystemSoundAtMsRef.current >= 60_000;
      if (isSystemSilent && !isSilentHintShownRef.current) {
        isSilentHintShownRef.current = true;
        onToast(dict.recorder.systemAudioSilentHint);
      }
    }, 500);

    liveChunkTimerRef.current = setInterval(
      transcribeLatestRecordedSlice,
      5000
    );
  }, [dict, locale, onToast, transcribeLatestRecordedSlice]);

  useEffect(() => {
    let cancelled = false;

    async function recoverActiveRecording() {
      const polled = await getActiveRecording(locale);
      const active = polled.data;
      const hasNoActiveRecording = !active;
      const isRecoveryStale = cancelled || isRecordingRef.current;
      if (hasNoActiveRecording || isRecoveryStale) return;

      const meeting = useMeetingStore
        .getState()
        .meetings.find((m) => m.id === active.meetingId);
      if (!meeting) {
        await stopMicRecording(locale);
        return;
      }

      const elapsedSec = Math.floor(active.elapsedSec);
      selectMeeting(meeting.id);
      activeMeetingIdRef.current = meeting.id;
      isRecordingRef.current = true;
      lastSystemSoundAtMsRef.current = Date.now();
      isSilentHintShownRef.current = false;
      setHasSystemAudio(active.hasSystemAudio);
      setStatus((prev) => ({
        ...prev,
        isRecording: true,
        isPaused: false,
        durationSeconds: elapsedSec,
        micLevel: active.level,
        systemLevel: active.systemLevel,
      }));
      startCaptureTimers();
    }

    void recoverActiveRecording().finally(() => {
      if (!cancelled) setIsRecoveryPending(false);
    });
    return () => {
      cancelled = true;
    };
  }, [locale, selectMeeting, startCaptureTimers]);

  const summarizeAndPresent = async (params: {
    meetingId: string;
    durationSec: number;
    doneMessage: string;
    audioUrl?: string;
  }) => {
    const { openRouterKey, settings, meetings } = useMeetingStore.getState();
    const meeting = meetings.find((m) => m.id === params.meetingId);
    if (!meeting) return;

    const summary = await generateSummaryWithFallback({
      apiKey: openRouterKey,
      model: settings.openRouterModel,
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      templateId: meeting.summary.templateId,
      segments: meeting.segments,
      locale,
      outputLanguage: "auto",
    });

    const fallbackOverview = summary.error ?? dict.errors.noTranscript;
    const completedSummary =
      summary.data ??
      (meeting.summary.overview === dict.session.liveOverview
        ? {
            ...meeting.summary,
            overview: fallbackOverview,
            updatedAt: new Date().toISOString(),
          }
        : undefined);

    completeMeetingRecording(
      meeting.id,
      params.durationSec,
      completedSummary,
      params.audioUrl
    );
    onRecordingCompleted?.();

    if (!summary.success || !summary.data) {
      onToast(fallbackOverview);
      return;
    }

    onToast(params.doneMessage);
  };

  const preferredInput = inputDevices.find(
    (device) => device.id === preferredInputDeviceId
  );

  const handleStartRecording = async () => {
    const timeLabel = new Date().toLocaleTimeString(
      locale === "vi" ? "vi-VN" : "en-US",
      { hour: "2-digit", minute: "2-digit", second: "2-digit" }
    );

    const wantsSystemAudio = includeSystemAudio && systemAudioSupported;
    const newMeeting = createMeetingSession({
      title: dict.recorder.sessionTitle.replace("{time}", timeLabel),
      audioDeviceUsed: preferredInput?.name ?? status.activeInputDeviceName,
      isHeadphoneSession: status.isHeadphoneOrAirPodsActive,
      participants: wantsSystemAudio
        ? [dict.transcript.defaultMicSpeaker, dict.session.systemAudioParticipant]
        : [dict.transcript.defaultMicSpeaker],
      locale,
    });

    setRecordingTranscribedSec(0);
    setRecordingSystemTranscribedSec(0);
    const started = await startMicRecording({
      meetingId: newMeeting.id,
      inputDeviceId: preferredInput?.id ?? null,
      includeSystemAudio: wantsSystemAudio,
      locale,
    });
    if (!started.success || !started.data) {
      deleteMeeting(newMeeting.id);
      onToast(started.error ?? dict.errors.recordingFailed);
      return;
    }

    if (started.data.systemAudioError) {
      onToast(dict.recorder.systemAudioUnavailable);
    }
    activeMeetingIdRef.current = newMeeting.id;
    isRecordingRef.current = true;
    lastSystemSoundAtMsRef.current = Date.now();
    isSilentHintShownRef.current = false;
    setHasSystemAudio(started.data.hasSystemAudio);
    setSpokenCount(0);
    setStatus((prev) => ({
      ...prev,
      isRecording: true,
      isPaused: false,
      durationSeconds: 0,
    }));
    startCaptureTimers();
  };

  const handleStopRecording = async () => {
    const finishedMeetingId = activeMeetingIdRef.current;
    if (!finishedMeetingId) return;

    stopCaptureTimers();
    isRecordingRef.current = false;
    setStatus((prev) => ({
      ...prev,
      isRecording: false,
      isPaused: false,
      micLevel: 0,
      systemLevel: 0,
    }));
    setIsProcessingResult(true);
    setProcessingStepText(dict.recorder.processingRecording);

    try {
      const stopped = await stopMicRecording(locale);
      await chunkInFlightRef.current;
      if (!stopped.success || !stopped.data) {
        completeMeetingRecording(finishedMeetingId, status.durationSeconds);
        onToast(stopped.error ?? dict.errors.recordingFailed);
        return;
      }

      const { openRouterKey, settings } = useMeetingStore.getState();
      const tracks = hasSystemAudio ? MIC_AND_SYSTEM_TRACKS : SINGLE_TRACK;
      for (const trackParams of tracks) {
        const tail = await transcribeRecordingTail({
          meetingId: finishedMeetingId,
          startSec: transcribedSecFor(trackParams.track),
          apiKey: openRouterKey,
          model: settings.openRouterModel,
          locale,
          transcriptionLanguage: settings.transcriptionLanguage,
          onSegments: (segments) =>
            segments.forEach((seg) =>
              appendTranscriptSegment(finishedMeetingId, seg)
            ),
          ...trackParams,
        });
        if (!tail.success) {
          onToast(tail.error ?? dict.errors.transcriptionFailed);
        }
      }

      await summarizeAndPresent({
        meetingId: finishedMeetingId,
        durationSec: Math.max(1, Math.round(stopped.data.durationSec)),
        doneMessage: dict.recorder.recordingDone,
        audioUrl: convertFileSrc(stopped.data.wavPath),
      });
    } catch (error) {
      console.error("[RecordingControlBar] Stop & summarize error:", {
        error: error instanceof Error ? error.message : String(error),
      });
      completeMeetingRecording(finishedMeetingId, status.durationSeconds);
    } finally {
      activeMeetingIdRef.current = null;
      setIsProcessingResult(false);
      setProcessingStepText("");
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessingResult(true);
    setProcessingStepText(
      dict.recorder.uploadProcessing.replace("{name}", file.name)
    );

    const newMeeting = createMeetingSession({
      title: file.name.replace(/\.[^/.]+$/, ""),
      audioDeviceUsed: dict.recorder.uploadedFileSource.replace(
        "{name}",
        file.name
      ),
      isHeadphoneSession: true,
      locale,
    });

    try {
      const { openRouterKey, settings } = useMeetingStore.getState();
      const transcription = await transcribeUploadedMedia({
        file,
        meetingId: newMeeting.id,
        apiKey: openRouterKey,
        model: settings.openRouterModel,
        locale,
        transcriptionLanguage: settings.transcriptionLanguage,
      });
      if (!transcription.success || !transcription.data) {
        deleteMeeting(newMeeting.id);
        onToast(transcription.error ?? dict.errors.unsupportedMedia);
        return;
      }

      const { segments, durationSec } = transcription.data;
      segments.forEach((seg) => appendTranscriptSegment(newMeeting.id, seg));
      await summarizeAndPresent({
        meetingId: newMeeting.id,
        durationSec,
        doneMessage: dict.recorder.uploadDone.replace("{name}", file.name),
        audioUrl: URL.createObjectURL(file),
      });
    } catch (error) {
      console.error("[RecordingControlBar] File upload error:", {
        error: error instanceof Error ? error.message : String(error),
      });
      deleteMeeting(newMeeting.id);
      onToast(dict.errors.unsupportedMedia);
    } finally {
      setIsProcessingResult(false);
      setProcessingStepText("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const formatTimer = (sec: number) => {
    const mins = String(Math.floor(sec / 60)).padStart(2, "0");
    const secs = String(sec % 60).padStart(2, "0");
    return `${mins}:${secs}`;
  };

  const isStartBlocked =
    isProcessingResult || isRecoveryPending || isDeviceListPending;
  const isSystemAudioToggleDisabled =
    status.isRecording || isStartBlocked || !systemAudioSupported;
  const isHeadphoneWithoutSystemAudio =
    status.isHeadphoneOrAirPodsActive &&
    systemAudioSupported &&
    !includeSystemAudio;

  useEffect(() => {
    recordFromNotificationRef.current = () => {
      if (status.isRecording || isStartBlocked) return;
      void handleStartRecording();
    };
  });

  return (
    <section
      aria-label={dict.recorder.controlsLabel}
      className="rounded-xl border border-orange-500/40 bg-gradient-to-r from-slate-900 via-orange-950/50 to-slate-900 p-3 shadow-lg"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
              status.isRecording
                ? "animate-pulse border-rose-500 bg-rose-500/20 text-rose-400"
                : "border-orange-500/40 bg-orange-500/20 text-orange-300"
            }`}
          >
            <Mic className="h-4 w-4" />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-slate-50">
                {status.isRecording
                  ? dict.recorder.recordingTitle
                  : dict.recorder.readyTitle}
              </h2>

              {status.isRecording && (
                <span className="rounded-md bg-rose-600 px-2 py-0.5 font-mono text-xs font-bold text-white shadow">
                  ● {formatTimer(status.durationSeconds)}
                </span>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-300">
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-800/90 px-2 py-0.5 text-slate-200">
                {status.isHeadphoneOrAirPodsActive ? (
                  <Headphones className="h-3 w-3 text-emerald-400" />
                ) : (
                  <Volume2 className="h-3 w-3 text-orange-400" />
                )}
                <select
                  aria-label={dict.recorder.inputDeviceLabel}
                  value={preferredInput?.id ?? ""}
                  disabled={status.isRecording || isStartBlocked}
                  onChange={(e) =>
                    setPreferredInputDeviceId(e.target.value || null)
                  }
                  className="max-w-[16rem] truncate rounded-md bg-slate-950 py-0.5 pl-1 text-slate-200 focus:outline-none disabled:opacity-50"
                >
                  <option value="">
                    {dict.recorder.systemDefaultDevice.replace(
                      "{device}",
                      status.activeInputDeviceName
                    )}
                  </option>
                  {inputDevices.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.name}
                    </option>
                  ))}
                </select>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={includeSystemAudio}
                disabled={isSystemAudioToggleDisabled}
                title={
                  systemAudioSupported
                    ? undefined
                    : dict.recorder.systemAudioUnsupported
                }
                onClick={() => {
                  setIncludeSystemAudio(!includeSystemAudio);
                  if (!includeSystemAudio) {
                    onToast(dict.recorder.systemAudioPermissionHint);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-800/90 px-2 py-0.5 text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
              >
                <span
                  className={`inline-flex h-3.5 w-6 items-center rounded-full ${
                    includeSystemAudio ? "bg-orange-500" : "bg-slate-600"
                  }`}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full bg-white ${
                      includeSystemAudio ? "ml-3" : "ml-0.5"
                    }`}
                  />
                </span>
                {dict.recorder.includeSystemAudio}
              </button>
              <span className="text-slate-400">
                {dict.recorder.captureHint}
              </span>
            </div>

            {isHeadphoneWithoutSystemAudio && (
              <p className="mt-1.5 text-[11px] font-medium text-amber-300">
                {dict.recorder.headphoneSystemAudioOffHint}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/*,.mp3,.wav,.m4a,.mp4,.mov,.webm"
            onChange={handleFileUpload}
            className="hidden"
          />

          {!status.isRecording && (
            <button
              type="button"
              disabled={isProcessingResult}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 text-xs font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5 text-orange-400" />
              {dict.nav.uploadFile}
            </button>
          )}

          {!status.isRecording ? (
            <button
              type="button"
              disabled={isStartBlocked}
              onClick={handleStartRecording}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-orange-600 px-3.5 text-xs font-semibold text-white shadow-sm shadow-orange-600/25 transition hover:bg-orange-500 disabled:opacity-50"
            >
              <Mic className="h-3.5 w-3.5" />
              {dict.recorder.startRecording}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStopRecording}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 text-xs font-semibold text-white shadow-sm shadow-rose-600/30 transition hover:bg-rose-500"
            >
              <Square className="h-3.5 w-3.5" />
              {dict.recorder.stopRecording}
            </button>
          )}
        </div>
      </div>

      {isCallSuggestionVisible && (
        <div
          role="status"
          className="mt-2.5 flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-orange-500/50 bg-orange-950/60 px-3 py-2"
        >
          <div className="flex items-center gap-2.5">
            <PhoneCall className="h-4 w-4 shrink-0 text-orange-400" />
            <div>
              <p className="text-xs font-bold text-slate-50">
                {dict.recorder.callDetectedTitle}
              </p>
              <p className="text-[11px] text-orange-300">
                {detectedCallApp
                  ? dict.recorder.callDetectedAppHint.replace(
                      "{app}",
                      detectedCallApp
                    )
                  : dict.recorder.callDetectedHint}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsCallSuggestionVisible(false)}
              className="inline-flex h-7 items-center rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 text-xs font-medium text-slate-300 transition hover:bg-slate-700"
            >
              {dict.recorder.callDetectedDismiss}
            </button>
            <button
              type="button"
              disabled={isStartBlocked}
              onClick={() => {
                setIsCallSuggestionVisible(false);
                handleStartRecording();
              }}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-orange-600 px-3 text-xs font-semibold text-white shadow-sm shadow-orange-600/25 transition hover:bg-orange-500 disabled:opacity-50"
            >
              <Mic className="h-3 w-3" />
              {dict.recorder.callDetectedStart}
            </button>
          </div>
        </div>
      )}

      {status.isRecording && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-500/30 bg-slate-950/80 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 animate-ping rounded-full bg-emerald-400" />
            <span className="font-medium text-slate-200">
              {isLiveTranscribingChunk ? (
                <span className="inline-flex items-center gap-1.5 text-orange-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {dict.recorder.liveTranscribing}
                </span>
              ) : (
                <span>
                  {dict.recorder.listening.replace(
                    "{count}",
                    String(spokenCount)
                  )}
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <SignalMeter
              label={dict.recorder.audioSignal}
              level={status.micLevel}
            />
            {hasSystemAudio && (
              <SignalMeter
                label={dict.recorder.systemSignal}
                level={status.systemLevel}
              />
            )}
          </div>
        </div>
      )}

      {isProcessingResult && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-orange-500/50 bg-orange-950/60 px-4 py-3 text-xs font-semibold text-orange-200">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-orange-400" />
          <div>
            <p className="text-sm font-bold text-slate-50">{processingStepText}</p>
            <p className="text-[11px] text-orange-300">
              {dict.recorder.processingHint}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
