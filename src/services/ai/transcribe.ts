import type {
  AIProviderSettings,
  ApiResponse,
  AudioSourceChannel,
  OpenRouterAudioFormat,
  SupportedLocale,
  TranscriptSegment,
} from "@/types/meeting";
import { getDictionary } from "@/i18n/dictionaries";
import { callOpenRouterChat } from "@/services/ai/provider-registry";

export function parseDiarizedLinesToSegments(params: {
  rawText: string;
  meetingId: string;
  channel: AudioSourceChannel;
  locale: SupportedLocale;
  startOffsetSec: number;
}): TranscriptSegment[] {
  const transcriptDict = getDictionary(params.locale).transcript;
  const lines = params.rawText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 1 && !l.includes("[SILENCE]"));

  const baseStartMs = Math.max(1000, Math.round(params.startOffsetSec * 1000));

  return lines.map((rawLine, idx) => {
    let speakerId =
      params.channel === "mic_user" ? "spk_user_me" : "spk_remote_1";
    let speakerName =
      params.channel === "mic_user"
        ? transcriptDict.defaultMicSpeaker
        : transcriptDict.remoteSpeaker.replace("{n}", "1");
    let cleanText = rawLine;

    if (params.channel === "system_remote") {
      const match = rawLine.match(
        /^\[?(?:Người nói|Speaker|Giọng)\s*(\d+)\]?\s*:\s*(.+)$/i
      );
      if (match && match[1] && match[2]) {
        const spkNum = match[1];
        speakerId = `spk_remote_${spkNum}`;
        speakerName = transcriptDict.remoteSpeaker.replace("{n}", spkNum);
        cleanText = match[2].trim();
      }
    } else {
      cleanText = rawLine.replace(
        /^\[?(?:Người nói|Speaker|Bạn|You)\s*\d*\]?\s*:\s*/i,
        ""
      );
    }

    return {
      id: `seg-or-${params.channel}-${Date.now()}-${idx}`,
      meetingId: params.meetingId,
      speakerId,
      speakerName,
      channel: params.channel,
      text: cleanText,
      startMs: baseStartMs + idx * 4000,
      endMs: baseStartMs + (idx + 1) * 4000,
      confidence: 0.99,
    };
  });
}

export async function transcribeAudioChunk(params: {
  apiKey: string;
  model: string;
  meetingId: string;
  channel: AudioSourceChannel;
  locale: SupportedLocale;
  transcriptionLanguage: AIProviderSettings["transcriptionLanguage"];
  startOffsetSec: number;
  wavBase64: string;
  format: OpenRouterAudioFormat;
}): Promise<
  ApiResponse<{ segments: TranscriptSegment[]; providerUsed: string }>
> {
  const errors = getDictionary(params.locale).errors;
  const meetingId = params.meetingId.trim();

  if (!meetingId) {
    return { success: false, error: errors.invalidRequest };
  }

  const audioData = params.wavBase64.replace(/^data:[^,]*,/, "");
  if (audioData.length <= 100) {
    return {
      success: true,
      data: { segments: [], providerUsed: "Silence Gate" },
    };
  }

  const startOffsetSec = params.startOffsetSec >= 0 ? params.startOffsetSec : 0;
  const promptLocale =
    params.transcriptionLanguage === "auto"
      ? params.locale
      : params.transcriptionLanguage;
  const promptText =
    params.channel === "system_remote"
      ? promptLocale === "vi"
        ? "Hãy nghe đoạn âm thanh này và gỡ băng (transcribe) chính xác nguyên văn lời nói (tiếng Việt hoặc tiếng Anh). Nếu có nhiều người nói khác nhau trong đoạn âm thanh, hãy tách dòng và ghi rõ đầu dòng theo mẫu '[Người nói 1]: nội dung', '[Người nói 2]: nội dung'. Nếu chỉ có 1 người nói, ghi '[Người nói 1]: nội dung'. Nếu chỉ có tiếng nhạc không lời hoặc im lặng, chỉ trả về đúng chuỗi: [SILENCE]. Không giải thích thêm."
        : "Transcribe the exact spoken words from this audio. If multiple speakers are heard, put each turn on a new line prefixed with '[Speaker 1]: text', '[Speaker 2]: text'. If there is no human speech, reply with exact string: [SILENCE]."
      : promptLocale === "vi"
        ? "Hãy nghe đoạn thu âm từ Microphone này và gỡ băng chính xác nguyên văn lời người nói. Nếu im lặng không có lời nói, chỉ trả về đúng chuỗi: [SILENCE]. Không giải thích thêm."
        : "Transcribe the exact spoken words from this microphone recording. If silent, reply with [SILENCE].";

  try {
    const result = await callOpenRouterChat({
      apiKey: params.apiKey,
      model: params.model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: promptText },
            {
              type: "input_audio",
              input_audio: { data: audioData, format: params.format },
            },
          ],
        },
      ],
      timeoutMs: 120000,
      providerName: "OpenRouter-Audio-STT",
    });

    const providerUsed = `OpenRouter Audio STT (${result.model})`;
    const isSilence =
      result.content.length === 0 ||
      result.content.includes("[SILENCE]") ||
      result.content.toLowerCase() === "silence";

    if (isSilence) {
      return { success: true, data: { segments: [], providerUsed } };
    }

    return {
      success: true,
      data: {
        segments: parseDiarizedLinesToSegments({
          rawText: result.content,
          meetingId,
          channel: params.channel,
          locale: params.locale,
          startOffsetSec,
        }),
        providerUsed,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `[TranscribeService] OpenRouter audio transcription failed (${errorMessage}):`,
      {
        meetingId,
        channel: params.channel,
        error: errorMessage,
      }
    );
    const detailMatch = errorMessage.match(
      /^OpenRouter-Audio-STT HTTP (\d+): (.+)$/
    );
    return {
      success: false,
      error: detailMatch
        ? `${errors.transcriptionFailed} (HTTP ${detailMatch[1]}: ${detailMatch[2]})`
        : errors.transcriptionFailed,
    };
  }
}
