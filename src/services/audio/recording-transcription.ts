import type {
  AIProviderSettings,
  ApiResponse,
  SupportedLocale,
  TranscriptSegment,
} from "@/types/meeting";
import { transcribeAudioChunk } from "@/services/ai/transcribe";
import {
  readRecordingSlice,
  type RecordingTrack,
} from "@/services/audio/recording-commands";
import { MAX_CHUNK_SEC, wavBase64DurationSec } from "@/services/audio/wav";

export async function transcribeRecordingSlice(params: {
  meetingId: string;
  startSec: number;
  minSliceSec: number;
  maxSliceSec?: number;
  track?: RecordingTrack;
  apiKey: string;
  model: string;
  locale: SupportedLocale;
  transcriptionLanguage: AIProviderSettings["transcriptionLanguage"];
}): Promise<
  ApiResponse<{ segments: TranscriptSegment[]; nextStartSec: number }>
> {
  const slice = await readRecordingSlice({
    meetingId: params.meetingId,
    startSec: params.startSec,
    maxSec: params.maxSliceSec ?? MAX_CHUNK_SEC,
    track: params.track,
    locale: params.locale,
  });
  if (!slice.success || slice.data === undefined) {
    return { success: false, error: slice.error };
  }

  return transcribeSliceBuffer({
    ...params,
    wavBase64: slice.data,
  });
}

async function transcribeSliceBuffer(params: {
  meetingId: string;
  startSec: number;
  minSliceSec: number;
  track?: RecordingTrack;
  apiKey: string;
  model: string;
  locale: SupportedLocale;
  transcriptionLanguage: AIProviderSettings["transcriptionLanguage"];
  wavBase64: string;
}): Promise<
  ApiResponse<{ segments: TranscriptSegment[]; nextStartSec: number }>
> {
  const sliceSec = wavBase64DurationSec(params.wavBase64);
  if (sliceSec < params.minSliceSec) {
    return {
      success: true,
      data: { segments: [], nextStartSec: params.startSec },
    };
  }

  const transcription = await transcribeAudioChunk({
    apiKey: params.apiKey,
    model: params.model,
    meetingId: params.meetingId,
    channel: params.track === "system" ? "system_remote" : "mic_user",
    locale: params.locale,
    transcriptionLanguage: params.transcriptionLanguage,
    startOffsetSec: params.startSec,
    wavBase64: params.wavBase64,
    format: "wav",
  });
  if (!transcription.success || !transcription.data) {
    return { success: false, error: transcription.error };
  }

  return {
    success: true,
    data: {
      segments: transcription.data.segments,
      nextStartSec: params.startSec + sliceSec,
    },
  };
}

type BaseSliceParams = Omit<
  Parameters<typeof transcribeRecordingSlice>[0],
  "startSec" | "minSliceSec" | "track"
>;

async function transcribeSliceWithRetry(
  params: BaseSliceParams & {
    startSec: number;
    track?: RecordingTrack;
    prefetchedWavBase64?: string;
  }
) {
  const runAttempt = () =>
    params.prefetchedWavBase64 !== undefined
      ? transcribeSliceBuffer({
          ...params,
          minSliceSec: 1,
          wavBase64: params.prefetchedWavBase64,
        })
      : transcribeRecordingSlice({
          ...params,
          minSliceSec: 1,
        });
  let tail = await runAttempt();
  if (!tail.success && params.maxSliceSec !== undefined) {
    tail = await runAttempt();
  }
  return tail;
}

async function drainSingleTrackTail(
  params: BaseSliceParams & {
    startSec: number;
    track?: RecordingTrack;
    onSegments: (segments: TranscriptSegment[], nextStartSec?: number) => void;
  }
): Promise<ApiResponse<null>> {
  const { onSegments, startSec: initialStartSec, ...sliceParams } = params;
  let startSec = initialStartSec;
  let hasMoreAudio = true;
  while (hasMoreAudio) {
    const tail = await transcribeSliceWithRetry({
      ...sliceParams,
      startSec,
    });
    if (!tail.success || !tail.data) {
      return { success: false, error: tail.error };
    }

    onSegments(tail.data.segments, tail.data.nextStartSec);
    hasMoreAudio = tail.data.nextStartSec > startSec;
    startSec = tail.data.nextStartSec;
  }
  return { success: true };
}

export async function transcribeRecordingTail(params: {
  meetingId: string;
  startSec: number;
  maxSliceSec?: number;
  track?: RecordingTrack;
  dualTrack?: boolean;
  apiKey: string;
  model: string;
  locale: SupportedLocale;
  transcriptionLanguage: AIProviderSettings["transcriptionLanguage"];
  onResetMixedSegments?: () => void;
  onSegments: (segments: TranscriptSegment[], nextStartSec?: number) => void;
}): Promise<ApiResponse<null>> {
  const {
    onSegments,
    onResetMixedSegments,
    dualTrack,
    track,
    startSec: initialStartSec,
    ...baseParams
  } = params;

  if (!dualTrack) {
    return drainSingleTrackTail({
      ...baseParams,
      startSec: initialStartSec,
      track,
      onSegments,
    });
  }

  const probeStartSec = onResetMixedSegments ? 0 : initialStartSec;
  const maxSec = baseParams.maxSliceSec ?? MAX_CHUNK_SEC;
  const micProbe = await readRecordingSlice({
    meetingId: baseParams.meetingId,
    startSec: probeStartSec,
    maxSec,
    track: "mic",
    locale: baseParams.locale,
  });
  if (!micProbe.success || micProbe.data === undefined) {
    return drainSingleTrackTail({
      ...baseParams,
      startSec: initialStartSec,
      onSegments,
    });
  }

  const sysProbe = await readRecordingSlice({
    meetingId: baseParams.meetingId,
    startSec: probeStartSec,
    maxSec,
    track: "system",
    locale: baseParams.locale,
  });
  if (!sysProbe.success || sysProbe.data === undefined) {
    return drainSingleTrackTail({
      ...baseParams,
      startSec: initialStartSec,
      onSegments,
    });
  }

  let didResetMixedSegments = false;
  let startSec = probeStartSec;
  let pendingProbes: { micWav: string; sysWav: string } | null = {
    micWav: micProbe.data,
    sysWav: sysProbe.data,
  };
  let hasMoreAudio = true;
  while (hasMoreAudio) {
    const currentProbes = pendingProbes;
    pendingProbes = null;

    const micTail = await transcribeSliceWithRetry({
      ...baseParams,
      track: "mic",
      startSec,
      prefetchedWavBase64: currentProbes?.micWav,
    });
    if (!micTail.success || !micTail.data) {
      return { success: false, error: micTail.error };
    }

    const sysTail = await transcribeSliceWithRetry({
      ...baseParams,
      track: "system",
      startSec,
      prefetchedWavBase64: currentProbes?.sysWav,
    });
    if (!sysTail.success || !sysTail.data) {
      return { success: false, error: sysTail.error };
    }

    if (!didResetMixedSegments) {
      onResetMixedSegments?.();
      didResetMixedSegments = true;
    }

    const combinedSegments = [
      ...micTail.data.segments,
      ...sysTail.data.segments,
    ].sort((a, b) => a.startMs - b.startMs);
    const nextStartSec = Math.max(
      micTail.data.nextStartSec,
      sysTail.data.nextStartSec
    );
    onSegments(combinedSegments, nextStartSec);
    hasMoreAudio = nextStartSec > startSec;
    startSec = nextStartSec;
  }
  return { success: true };
}
