import { describe, expect, it } from "vitest";
import {
  MAX_CHUNK_SEC,
  bytesToBase64,
  encodeWavMono16,
  splitSamplesIntoChunks,
  wavBase64DurationSec,
} from "@/services/audio/wav";
import { TARGET_STT_SAMPLE_RATE } from "@/services/audio/dual-stream-bridge";

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

describe("WAV encoder", () => {
  it("writes a 16 kHz mono 16-bit PCM header sized to the samples", () => {
    const wav = encodeWavMono16(new Float32Array(100));
    const view = new DataView(wav.buffer);

    expect(wav.length).toBe(44 + 200);
    expect(readAscii(wav, 0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(36 + 200);
    expect(readAscii(wav, 8, 8)).toBe("WAVEfmt ");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(TARGET_STT_SAMPLE_RATE);
    expect(view.getUint32(28, true)).toBe(TARGET_STT_SAMPLE_RATE * 2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(readAscii(wav, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(200);
  });

  it("scales and clamps float samples to signed 16-bit", () => {
    const wav = encodeWavMono16(new Float32Array([0, 1, -1, 2, -2, 0.5]));
    const view = new DataView(wav.buffer);
    const pcm = [0, 1, 2, 3, 4, 5].map((i) => view.getInt16(44 + i * 2, true));

    expect(pcm).toEqual([0, 32767, -32768, 32767, -32768, 16383]);
  });
});

describe("Sample chunking", () => {
  const chunkLength = MAX_CHUNK_SEC * TARGET_STT_SAMPLE_RATE;

  it("splits long audio into chunks of at most 180 s with ordered offsets", () => {
    const chunks = splitSamplesIntoChunks(
      new Float32Array(chunkLength * 2 + TARGET_STT_SAMPLE_RATE * 40)
    );

    expect(chunks.map((c) => c.startOffsetSec)).toEqual([0, 180, 360]);
    expect(chunks.map((c) => c.samples.length)).toEqual([
      chunkLength,
      chunkLength,
      TARGET_STT_SAMPLE_RATE * 40,
    ]);
  });

  it("keeps audio of exactly 180 s in one chunk and returns none for empty audio", () => {
    expect(splitSamplesIntoChunks(new Float32Array(chunkLength))).toHaveLength(1);
    expect(splitSamplesIntoChunks(new Float32Array(0))).toEqual([]);
  });
});

function rustSliceWavBase64(sampleCount: number): string {
  const dataBytes = sampleCount * 2;
  const bytes = Buffer.alloc(44 + dataBytes);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(36 + dataBytes, 4);
  bytes.write("WAVEfmt ", 8, "ascii");
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16_000, 24);
  bytes.writeUInt32LE(32_000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36, "ascii");
  bytes.writeUInt32LE(dataBytes, 40);
  return bytes.toString("base64");
}

describe("Duration of Rust slice WAVs", () => {
  it.each([
    [0, 0],
    [1, 1 / 16000],
    [2, 2 / 16000],
    [16_000 * 3 + 7, 3 + 7 / 16000],
    [16_000 * MAX_CHUNK_SEC, MAX_CHUNK_SEC],
  ])(
    "reads %i samples from the 44-byte hound header layout as %f s",
    (sampleCount, expectedSec) => {
      expect(wavBase64DurationSec(rustSliceWavBase64(sampleCount))).toBeCloseTo(
        expectedSec,
        9
      );
    }
  );

  it("matches the duration of the JS encoder for the same samples", () => {
    const samples = new Float32Array(16_000 * 5 + 3);

    expect(wavBase64DurationSec(rustSliceWavBase64(samples.length))).toBe(
      wavBase64DurationSec(bytesToBase64(encodeWavMono16(samples)))
    );
  });
});

describe("Base64 helpers", () => {
  it("encodes byte arrays larger than the internal slice size", () => {
    const bytes = new Uint8Array(100_001).map((_, i) => i % 251);

    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
  });

  it("derives the duration of a base64 WAV from its length", () => {
    const twoAndHalfSeconds = bytesToBase64(
      encodeWavMono16(new Float32Array(TARGET_STT_SAMPLE_RATE * 2.5))
    );
    const oddLength = bytesToBase64(encodeWavMono16(new Float32Array(1001)));

    expect(wavBase64DurationSec(twoAndHalfSeconds)).toBeCloseTo(2.5, 5);
    expect(wavBase64DurationSec(oddLength)).toBeCloseTo(1001 / 16000, 5);
    expect(wavBase64DurationSec("")).toBe(0);
  });
});
