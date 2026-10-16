import type {
  AIProviderSettings,
  ApiResponse,
  SupportedLocale,
  TranscriptSegment,
} from "@/types/meeting";
import { transcribeAudioChunk } from "@/services/ai/transcribe";
import { readRecordingSlice } from "@/services/audio/recording-commands";
import { MAX_CHUNK_SEC, wavBase64DurationSec } from "@/services/audio/wav";

export async function transcribeRecordingSlice(params: {
  meetingId: string;
  startSec: number;
  minSliceSec: number;
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
    maxSec: MAX_CHUNK_SEC,
    locale: params.locale,
  });
  if (!slice.success || slice.data === undefined) {
    return { success: false, error: slice.error };
  }

  const sliceSec = wavBase64DurationSec(slice.data);
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
    channel: "mic_user",
    locale: params.locale,
    transcriptionLanguage: params.transcriptionLanguage,
    startOffsetSec: params.startSec,
    wavBase64: slice.data,
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

export async function transcribeRecordingTail(params: {
  meetingId: string;
  startSec: number;
  apiKey: string;
  model: string;
  locale: SupportedLocale;
  transcriptionLanguage: AIProviderSettings["transcriptionLanguage"];
  onSegments: (segments: TranscriptSegment[]) => void;
}): Promise<ApiResponse<null>> {
  const { onSegments, ...sliceParams } = params;
  let startSec = params.startSec;
  let hasMoreAudio = true;
  while (hasMoreAudio) {
    const tail = await transcribeRecordingSlice({
      ...sliceParams,
      startSec,
      minSliceSec: 1,
    });
    if (!tail.success || !tail.data) {
      return { success: false, error: tail.error };
    }

    onSegments(tail.data.segments);
    hasMoreAudio = tail.data.nextStartSec > startSec;
    startSec = tail.data.nextStartSec;
  }
  return { success: true };
}
