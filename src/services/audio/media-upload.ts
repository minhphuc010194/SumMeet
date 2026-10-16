import type {
  AIProviderSettings,
  ApiResponse,
  OpenRouterAudioFormat,
  SupportedLocale,
  TranscriptSegment,
} from "@/types/meeting";
import { getDictionary } from "@/i18n/dictionaries";
import { transcribeAudioChunk } from "@/services/ai/transcribe";
import { TARGET_STT_SAMPLE_RATE } from "@/services/audio/dual-stream-bridge";
import {
  bytesToBase64,
  encodeWavMono16,
  splitSamplesIntoChunks,
} from "@/services/audio/wav";

const DIRECT_UPLOAD_FORMATS: OpenRouterAudioFormat[] = [
  "wav",
  "mp3",
  "aac",
  "m4a",
  "ogg",
  "flac",
];

interface ChunkRequest {
  startOffsetSec: number;
  wavBase64: string;
  format: OpenRouterAudioFormat;
}

export function getDirectUploadFormat(
  fileName: string
): OpenRouterAudioFormat | null {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return DIRECT_UPLOAD_FORMATS.find((format) => format === extension) ?? null;
}

export async function decodeToMono16k(file: Blob): Promise<Float32Array> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    const offline = new OfflineAudioContext(
      1,
      Math.ceil(decoded.duration * TARGET_STT_SAMPLE_RATE),
      TARGET_STT_SAMPLE_RATE
    );
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    return (await offline.startRendering()).getChannelData(0);
  } finally {
    await context.close();
  }
}

function* wavChunkRequests(samples: Float32Array): Generator<ChunkRequest> {
  for (const chunk of splitSamplesIntoChunks(samples)) {
    yield {
      startOffsetSec: chunk.startOffsetSec,
      wavBase64: bytesToBase64(encodeWavMono16(chunk.samples)),
      format: "wav",
    };
  }
}

export async function transcribeUploadedMedia(params: {
  file: File;
  meetingId: string;
  apiKey: string;
  model: string;
  locale: SupportedLocale;
  transcriptionLanguage: AIProviderSettings["transcriptionLanguage"];
}): Promise<
  ApiResponse<{ segments: TranscriptSegment[]; durationSec: number }>
> {
  const { file, ...chunkContext } = params;
  const errors = getDictionary(params.locale).errors;

  let requests: Iterable<ChunkRequest>;
  let durationSec = 0;
  try {
    const samples = await decodeToMono16k(file);
    requests = wavChunkRequests(samples);
    durationSec = Math.round(samples.length / TARGET_STT_SAMPLE_RATE);
  } catch (error) {
    console.error("[MediaUpload] Web Audio decode failed:", {
      error: error instanceof Error ? error.message : String(error),
    });
    const format = getDirectUploadFormat(file.name);
    if (!format) {
      return { success: false, error: errors.unsupportedMedia };
    }
    requests = [
      {
        startOffsetSec: 0,
        wavBase64: bytesToBase64(new Uint8Array(await file.arrayBuffer())),
        format,
      },
    ];
  }

  const segments: TranscriptSegment[] = [];
  for (const request of requests) {
    const result = await transcribeAudioChunk({
      ...chunkContext,
      ...request,
      channel: "system_remote",
    });
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }
    segments.push(...result.data.segments);
  }

  return { success: true, data: { segments, durationSec } };
}
