import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDictionary } from "@/i18n/dictionaries";
import {
  parseDiarizedLinesToSegments,
  transcribeAudioChunk,
} from "@/services/ai/transcribe";

const WAV_BASE64 = "UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA".repeat(4);

const BASE_PARAMS = {
  apiKey: "sk-or-test-key",
  model: "google/gemini-3.1-flash-lite",
  meetingId: "mtg-1",
  channel: "system_remote" as const,
  locale: "vi" as const,
  transcriptionLanguage: "auto" as const,
  startOffsetSec: 180,
  wavBase64: WAV_BASE64,
  format: "wav" as const,
};

function completionResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      model: "google/gemini-3.1-flash-lite",
      choices: [{ message: { content } }],
    }),
    { status: 200 }
  );
}

describe("OpenRouter audio transcription", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends the chunk as input_audio without a data: prefix and parses diarized speakers", async () => {
    fetchMock.mockResolvedValue(
      completionResponse("[Người nói 1]: Xin chào mọi người\n[Người nói 2]: Chào bạn")
    );

    const result = await transcribeAudioChunk({
      ...BASE_PARAMS,
      wavBase64: `data:audio/wav;base64,${WAV_BASE64}`,
    });

    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer sk-or-test-key");
    expect(body.model).toBe("google/gemini-3.1-flash-lite");
    expect(body.messages[0].content[1]).toEqual({
      type: "input_audio",
      input_audio: { data: WAV_BASE64, format: "wav" },
    });

    expect(result.success).toBe(true);
    expect(result.data?.segments).toHaveLength(2);
    expect(result.data?.segments[0]).toMatchObject({
      meetingId: "mtg-1",
      speakerId: "spk_remote_1",
      speakerName: "Người nói 1 (Máy / Video)",
      channel: "system_remote",
      text: "Xin chào mọi người",
      startMs: 180000,
      endMs: 184000,
    });
    expect(result.data?.segments[1]).toMatchObject({
      speakerId: "spk_remote_2",
      text: "Chào bạn",
      startMs: 184000,
    });
  });

  it("returns no segments for [SILENCE] and empty replies", async () => {
    fetchMock.mockResolvedValueOnce(completionResponse("[SILENCE]"));
    const silent = await transcribeAudioChunk(BASE_PARAMS);

    fetchMock.mockResolvedValueOnce(completionResponse(""));
    const empty = await transcribeAudioChunk(BASE_PARAMS);

    expect(silent).toMatchObject({ success: true, data: { segments: [] } });
    expect(empty).toMatchObject({ success: true, data: { segments: [] } });
  });

  it("skips the request for chunks without audio", async () => {
    const result = await transcribeAudioChunk({ ...BASE_PARAMS, wavBase64: "" });

    expect(result).toMatchObject({ success: true, data: { segments: [] } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the mic prompt and labels for the mic channel", async () => {
    fetchMock.mockResolvedValue(completionResponse("Bạn: Mình sẽ gửi báo cáo"));

    const result = await transcribeAudioChunk({
      ...BASE_PARAMS,
      channel: "mic_user",
      locale: "en",
      startOffsetSec: 0,
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages[0].content[0].text).toContain("microphone recording");
    expect(result.data?.segments[0]).toMatchObject({
      speakerId: "spk_user_me",
      speakerName: "You (Mic)",
      channel: "mic_user",
      text: "Mình sẽ gửi báo cáo",
      startMs: 1000,
    });
  });

  it.each([
    ["system_remote", "vi", "en", "Transcribe the exact spoken words from this audio"],
    ["system_remote", "en", "vi", "Hãy nghe đoạn âm thanh này"],
    ["mic_user", "vi", "en", "Transcribe the exact spoken words from this microphone"],
    ["mic_user", "en", "vi", "Hãy nghe đoạn thu âm từ Microphone này"],
  ] as const)(
    "prompts the %s channel in the transcription language (UI %s, setting %s)",
    async (channel, locale, transcriptionLanguage, expectedPrompt) => {
      fetchMock.mockResolvedValue(completionResponse("[SILENCE]"));

      await transcribeAudioChunk({
        ...BASE_PARAMS,
        channel,
        locale,
        transcriptionLanguage,
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.messages[0].content[0].text).toContain(expectedPrompt);
    }
  );

  it("falls back to the UI locale for the prompt when the language is auto", async () => {
    fetchMock.mockResolvedValue(completionResponse("[SILENCE]"));

    await transcribeAudioChunk({ ...BASE_PARAMS, locale: "en" });
    await transcribeAudioChunk({ ...BASE_PARAMS, locale: "vi" });

    const prompts = fetchMock.mock.calls.map(
      ([, init]) => JSON.parse(init.body as string).messages[0].content[0].text
    );
    expect(prompts[0]).toContain("Transcribe the exact spoken words");
    expect(prompts[1]).toContain("Hãy nghe đoạn âm thanh này");
  });

  it("keeps speaker labels on the UI locale when the transcription language differs", async () => {
    fetchMock.mockResolvedValue(completionResponse("Mình sẽ gửi báo cáo"));

    const result = await transcribeAudioChunk({
      ...BASE_PARAMS,
      channel: "mic_user",
      locale: "en",
      transcriptionLanguage: "vi",
    });

    expect(result.data?.segments[0].speakerName).toBe("You (Mic)");
  });

  it("returns a localized error when OpenRouter fails", async () => {
    fetchMock.mockResolvedValue(new Response("down", { status: 502 }));

    const result = await transcribeAudioChunk(BASE_PARAMS);

    expect(result).toEqual({
      success: false,
      error: getDictionary("vi").errors.transcriptionFailed,
    });
  });

  it("requires a meetingId", async () => {
    const result = await transcribeAudioChunk({ ...BASE_PARAMS, meetingId: " " });

    expect(result).toEqual({
      success: false,
      error: getDictionary("vi").errors.invalidRequest,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("diarized line parsing", () => {
  it("drops [SILENCE] lines, clamps the base offset and spaces lines 4 seconds apart", () => {
    const segments = parseDiarizedLinesToSegments({
      rawText: "Speaker 3: Hello there\n[SILENCE]\n\nplain line without label",
      meetingId: "mtg-2",
      channel: "system_remote",
      locale: "en",
      startOffsetSec: 0,
    });

    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      speakerId: "spk_remote_3",
      speakerName: "Speaker 3 (System / Video)",
      text: "Hello there",
      startMs: 1000,
    });
    expect(segments[1]).toMatchObject({
      speakerId: "spk_remote_1",
      text: "plain line without label",
      startMs: 5000,
      endMs: 9000,
    });
  });
});
