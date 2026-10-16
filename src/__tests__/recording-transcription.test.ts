import { beforeEach, describe, expect, it, vi } from "vitest";
import { transcribeAudioChunk } from "@/services/ai/transcribe";
import { readRecordingSlice } from "@/services/audio/recording-commands";
import {
  transcribeRecordingSlice,
  transcribeRecordingTail,
} from "@/services/audio/recording-transcription";
import { bytesToBase64, encodeWavMono16 } from "@/services/audio/wav";

vi.mock("@/services/ai/transcribe", () => ({ transcribeAudioChunk: vi.fn() }));
vi.mock("@/services/audio/recording-commands", () => ({
  readRecordingSlice: vi.fn(),
}));

const transcribeMock = vi.mocked(transcribeAudioChunk);
const readSliceMock = vi.mocked(readRecordingSlice);

const BASE_PARAMS = {
  meetingId: "mtg-1",
  startSec: 20,
  minSliceSec: 3,
  apiKey: "sk-or-test",
  model: "google/gemini-3.1-flash-lite",
  locale: "vi" as const,
  transcriptionLanguage: "en" as const,
};

function wavOfSeconds(seconds: number): string {
  return seconds === 0
    ? ""
    : bytesToBase64(encodeWavMono16(new Float32Array(seconds * 16000)));
}

const SEGMENT = {
  id: "seg-1",
  meetingId: "mtg-1",
  speakerId: "spk_user_me",
  speakerName: "Bạn (Mic)",
  channel: "mic_user" as const,
  text: "Xin chào",
  startMs: 20000,
  endMs: 24000,
  confidence: 0.99,
};

describe("Live recording slice transcription", () => {
  beforeEach(() => {
    transcribeMock.mockReset();
    readSliceMock.mockReset();
  });

  it("reads at most 180 s and sends the wav slice as the mic channel", async () => {
    const wavBase64 = wavOfSeconds(8);
    readSliceMock.mockResolvedValue({ success: true, data: wavBase64 });
    transcribeMock.mockResolvedValue({
      success: true,
      data: { segments: [SEGMENT], providerUsed: "OpenRouter" },
    });

    const result = await transcribeRecordingSlice(BASE_PARAMS);

    expect(readSliceMock).toHaveBeenCalledWith({
      meetingId: "mtg-1",
      startSec: 20,
      maxSec: 180,
      locale: "vi",
    });
    expect(transcribeMock).toHaveBeenCalledWith({
      apiKey: "sk-or-test",
      model: "google/gemini-3.1-flash-lite",
      meetingId: "mtg-1",
      channel: "mic_user",
      locale: "vi",
      transcriptionLanguage: "en",
      startOffsetSec: 20,
      wavBase64,
      format: "wav",
    });
    expect(result).toEqual({
      success: true,
      data: { segments: [SEGMENT], nextStartSec: 28 },
    });
  });

  it.each([
    ["mic", "mic_user"],
    ["system", "system_remote"],
  ] as const)(
    "reads the %s track and sends it as the %s channel",
    async (track, channel) => {
      readSliceMock.mockResolvedValue({ success: true, data: wavOfSeconds(8) });
      transcribeMock.mockResolvedValue({
        success: true,
        data: { segments: [], providerUsed: "OpenRouter" },
      });

      await transcribeRecordingSlice({ ...BASE_PARAMS, track });

      expect(readSliceMock).toHaveBeenCalledWith(
        expect.objectContaining({ meetingId: "mtg-1", startSec: 20, track })
      );
      expect(transcribeMock.mock.calls[0][0]).toMatchObject({
        channel,
        startOffsetSec: 20,
      });
    }
  );

  it("reads the default file as the mic channel when no track is given", async () => {
    readSliceMock.mockResolvedValue({ success: true, data: wavOfSeconds(8) });
    transcribeMock.mockResolvedValue({
      success: true,
      data: { segments: [], providerUsed: "OpenRouter" },
    });

    await transcribeRecordingSlice(BASE_PARAMS);

    expect(readSliceMock.mock.calls[0][0].track).toBeUndefined();
    expect(transcribeMock.mock.calls[0][0].channel).toBe("mic_user");
  });

  it("skips an empty slice without calling OpenRouter", async () => {
    readSliceMock.mockResolvedValue({ success: true, data: "" });

    const result = await transcribeRecordingSlice(BASE_PARAMS);

    expect(transcribeMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      data: { segments: [], nextStartSec: 20 },
    });
  });

  it("waits for more audio when the slice is shorter than the minimum", async () => {
    readSliceMock.mockResolvedValue({ success: true, data: wavOfSeconds(2) });

    const result = await transcribeRecordingSlice(BASE_PARAMS);

    expect(transcribeMock).not.toHaveBeenCalled();
    expect(result.data?.nextStartSec).toBe(20);
  });

  it("transcribes a short tail when the minimum allows it", async () => {
    readSliceMock.mockResolvedValue({ success: true, data: wavOfSeconds(2) });
    transcribeMock.mockResolvedValue({
      success: true,
      data: { segments: [], providerUsed: "Silence Gate" },
    });

    const result = await transcribeRecordingSlice({
      ...BASE_PARAMS,
      minSliceSec: 1,
    });

    expect(transcribeMock).toHaveBeenCalledTimes(1);
    expect(result.data?.nextStartSec).toBe(22);
  });

  it("propagates a slice read failure without transcribing", async () => {
    readSliceMock.mockResolvedValue({ success: false, error: "read failed" });

    const result = await transcribeRecordingSlice(BASE_PARAMS);

    expect(transcribeMock).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: "read failed" });
  });

  it("does not advance when transcription fails", async () => {
    readSliceMock.mockResolvedValue({ success: true, data: wavOfSeconds(5) });
    transcribeMock.mockResolvedValue({ success: false, error: "stt failed" });

    const result = await transcribeRecordingSlice(BASE_PARAMS);

    expect(result).toEqual({ success: false, error: "stt failed" });
  });
});

describe("Recording tail transcription after stop", () => {
  const { meetingId, apiKey, model, locale, transcriptionLanguage } =
    BASE_PARAMS;
  const TAIL_PARAMS = { meetingId, apiKey, model, locale, transcriptionLanguage };

  function stubRecordingOfSeconds(totalSec: number) {
    readSliceMock.mockImplementation(async ({ startSec, maxSec }) => ({
      success: true,
      data: wavOfSeconds(Math.max(0, Math.min(maxSec, totalSec - startSec))),
    }));
  }

  function segmentAt(startOffsetSec: number) {
    return { ...SEGMENT, id: `seg-${startOffsetSec}`, text: `at ${startOffsetSec}` };
  }

  beforeEach(() => {
    transcribeMock.mockReset();
    readSliceMock.mockReset();
  });

  it("drains a remainder longer than 180 s in capped, ordered chunks", async () => {
    stubRecordingOfSeconds(400);
    transcribeMock.mockImplementation(async ({ startOffsetSec }) => ({
      success: true,
      data: { segments: [segmentAt(startOffsetSec)], providerUsed: "OpenRouter" },
    }));
    const delivered: string[] = [];

    const result = await transcribeRecordingTail({
      ...TAIL_PARAMS,
      startSec: 20,
      onSegments: (segments) => delivered.push(...segments.map((s) => s.text)),
    });

    expect(result).toEqual({ success: true });
    expect(readSliceMock.mock.calls.map(([call]) => [call.startSec, call.maxSec])).toEqual([
      [20, 180],
      [200, 180],
      [380, 180],
      [400, 180],
    ]);
    expect(transcribeMock.mock.calls.map(([call]) => call.startOffsetSec)).toEqual([
      20, 200, 380,
    ]);
    expect(transcribeMock.mock.calls[0][0].transcriptionLanguage).toBe("en");
    expect(delivered).toEqual(["at 20", "at 200", "at 380"]);
  });

  it("drains the system track as the system channel", async () => {
    stubRecordingOfSeconds(30);
    transcribeMock.mockImplementation(async ({ startOffsetSec }) => ({
      success: true,
      data: { segments: [segmentAt(startOffsetSec)], providerUsed: "OpenRouter" },
    }));
    const delivered: string[] = [];

    const result = await transcribeRecordingTail({
      ...TAIL_PARAMS,
      startSec: 10,
      track: "system",
      onSegments: (segments) => delivered.push(...segments.map((s) => s.text)),
    });

    expect(result).toEqual({ success: true });
    expect(readSliceMock.mock.calls.every(([call]) => call.track === "system")).toBe(
      true
    );
    expect(transcribeMock.mock.calls[0][0].channel).toBe("system_remote");
    expect(delivered).toEqual(["at 10"]);
  });

  it("returns the error without throwing and keeps segments delivered before the failure", async () => {
    stubRecordingOfSeconds(400);
    transcribeMock
      .mockResolvedValueOnce({
        success: true,
        data: { segments: [segmentAt(0)], providerUsed: "OpenRouter" },
      })
      .mockResolvedValueOnce({ success: false, error: "stt failed" });
    const delivered: string[] = [];

    const result = await transcribeRecordingTail({
      ...TAIL_PARAMS,
      startSec: 0,
      onSegments: (segments) => delivered.push(...segments.map((s) => s.text)),
    });

    expect(result).toEqual({ success: false, error: "stt failed" });
    expect(delivered).toEqual(["at 0"]);
    expect(transcribeMock).toHaveBeenCalledTimes(2);
  });

  it("ignores a remainder shorter than one second", async () => {
    stubRecordingOfSeconds(20.5);

    const result = await transcribeRecordingTail({
      ...TAIL_PARAMS,
      startSec: 20,
      onSegments: vi.fn(),
    });

    expect(result).toEqual({ success: true });
    expect(transcribeMock).not.toHaveBeenCalled();
  });

  it("reports a failed slice read", async () => {
    readSliceMock.mockResolvedValue({ success: false, error: "read failed" });

    const result = await transcribeRecordingTail({
      ...TAIL_PARAMS,
      startSec: 0,
      onSegments: vi.fn(),
    });

    expect(result).toEqual({ success: false, error: "read failed" });
  });
});
