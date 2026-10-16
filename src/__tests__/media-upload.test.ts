import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDictionary } from "@/i18n/dictionaries";
import { transcribeAudioChunk } from "@/services/ai/transcribe";
import {
  getDirectUploadFormat,
  transcribeUploadedMedia,
} from "@/services/audio/media-upload";
import { bytesToBase64 } from "@/services/audio/wav";

vi.mock("@/services/ai/transcribe", () => ({ transcribeAudioChunk: vi.fn() }));

const transcribeMock = vi.mocked(transcribeAudioChunk);

const FILE_BYTES = new Uint8Array([73, 68, 51, 4, 0, 0, 1, 2, 3, 4]);

function makeFile(name: string): File {
  return {
    name,
    arrayBuffer: async () => FILE_BYTES.slice().buffer,
  } as unknown as File;
}

function stubWebAudio(params: { durationSec: number } | { decodeError: Error }) {
  const offlineArgs: number[][] = [];

  vi.stubGlobal(
    "AudioContext",
    class {
      decodeAudioData = vi.fn(async () => {
        if ("decodeError" in params) throw params.decodeError;
        return { duration: params.durationSec };
      });
      close = vi.fn(async () => {});
    }
  );
  vi.stubGlobal(
    "OfflineAudioContext",
    class {
      destination = {};
      constructor(channels: number, length: number, sampleRate: number) {
        offlineArgs.push([channels, length, sampleRate]);
      }
      createBufferSource() {
        return { buffer: null, connect: vi.fn(), start: vi.fn() };
      }
      async startRendering() {
        const length = offlineArgs[0][1];
        return { getChannelData: () => new Float32Array(length) };
      }
    }
  );

  return offlineArgs;
}

function okChunk(text: string) {
  return {
    success: true,
    data: {
      segments: [
        {
          id: `seg-${text}`,
          meetingId: "mtg-up",
          speakerId: "spk_remote_1",
          speakerName: "Speaker 1",
          channel: "system_remote" as const,
          text,
          startMs: 1000,
          endMs: 5000,
          confidence: 0.99,
        },
      ],
      providerUsed: "OpenRouter",
    },
  };
}

const BASE_PARAMS = {
  meetingId: "mtg-up",
  apiKey: "sk-or-test",
  model: "google/gemini-3.1-flash-lite",
  locale: "en" as const,
  transcriptionLanguage: "vi" as const,
};

describe("Upload format detection", () => {
  it.each(["wav", "mp3", "aac", "m4a", "ogg", "flac"])(
    "accepts .%s case-insensitively",
    (extension) => {
      expect(getDirectUploadFormat(`call.${extension.toUpperCase()}`)).toBe(
        extension
      );
    }
  );

  it("rejects containers OpenRouter does not accept and files without extension", () => {
    expect(getDirectUploadFormat("clip.mp4")).toBeNull();
    expect(getDirectUploadFormat("clip.webm")).toBeNull();
    expect(getDirectUploadFormat("recording")).toBeNull();
  });
});

describe("Uploaded media transcription", () => {
  beforeEach(() => {
    transcribeMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("decodes to 16 kHz mono and transcribes 180 s wav chunks in order", async () => {
    const offlineArgs = stubWebAudio({ durationSec: 400 });
    transcribeMock
      .mockResolvedValueOnce(okChunk("one"))
      .mockResolvedValueOnce(okChunk("two"))
      .mockResolvedValueOnce(okChunk("three"));

    const result = await transcribeUploadedMedia({
      ...BASE_PARAMS,
      file: makeFile("standup.m4a"),
    });

    expect(offlineArgs).toEqual([[1, 6_400_000, 16000]]);
    expect(transcribeMock).toHaveBeenCalledTimes(3);
    expect(
      transcribeMock.mock.calls.map(([call]) => [
        call.startOffsetSec,
        call.format,
        call.channel,
        call.meetingId,
        call.apiKey,
        call.model,
      ])
    ).toEqual([
      [0, "wav", "system_remote", "mtg-up", "sk-or-test", BASE_PARAMS.model],
      [180, "wav", "system_remote", "mtg-up", "sk-or-test", BASE_PARAMS.model],
      [360, "wav", "system_remote", "mtg-up", "sk-or-test", BASE_PARAMS.model],
    ]);
    expect(result.success).toBe(true);
    expect(result.data?.segments.map((s) => s.text)).toEqual([
      "one",
      "two",
      "three",
    ]);
    expect(result.data?.durationSec).toBe(400);
  });

  it("sends the original file once when decoding fails on a supported format", async () => {
    stubWebAudio({ decodeError: new Error("EncodingError") });
    transcribeMock.mockResolvedValue(okChunk("raw"));

    const result = await transcribeUploadedMedia({
      ...BASE_PARAMS,
      file: makeFile("voice.MP3"),
    });

    expect(transcribeMock).toHaveBeenCalledTimes(1);
    expect(transcribeMock.mock.calls[0][0]).toMatchObject({
      startOffsetSec: 0,
      format: "mp3",
      wavBase64: bytesToBase64(FILE_BYTES),
    });
    expect(result.success).toBe(true);
    expect(result.data?.segments).toHaveLength(1);
  });

  it("passes the transcription language to every chunk request", async () => {
    stubWebAudio({ durationSec: 400 });
    transcribeMock.mockResolvedValue(okChunk("x"));

    await transcribeUploadedMedia({ ...BASE_PARAMS, file: makeFile("a.wav") });

    expect(
      transcribeMock.mock.calls.map(([call]) => [call.locale, call.transcriptionLanguage])
    ).toEqual([
      ["en", "vi"],
      ["en", "vi"],
      ["en", "vi"],
    ]);
  });

  it("does not log the uploaded file name when decoding fails", async () => {
    stubWebAudio({ decodeError: new Error("EncodingError") });
    transcribeMock.mockResolvedValue(okChunk("raw"));

    await transcribeUploadedMedia({
      ...BASE_PARAMS,
      file: makeFile("board-minutes-secret.MP3"),
    });

    const logged = vi.mocked(console.error).mock.calls;
    expect(logged).toHaveLength(1);
    expect(JSON.stringify(logged)).not.toContain("board-minutes-secret");
  });

  it("shows a localized error when decoding fails on an unsupported format", async () => {
    stubWebAudio({ decodeError: new Error("EncodingError") });

    const result = await transcribeUploadedMedia({
      ...BASE_PARAMS,
      file: makeFile("meeting.mp4"),
    });

    expect(transcribeMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      error: getDictionary("en").errors.unsupportedMedia,
    });
  });

  it("stops at the first failed chunk and returns its error", async () => {
    stubWebAudio({ durationSec: 400 });
    transcribeMock
      .mockResolvedValueOnce(okChunk("one"))
      .mockResolvedValueOnce({ success: false, error: "stt failed" });

    const result = await transcribeUploadedMedia({
      ...BASE_PARAMS,
      file: makeFile("long.wav"),
    });

    expect(transcribeMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ success: false, error: "stt failed" });
  });
});
