import { TARGET_STT_SAMPLE_RATE } from "@/services/audio/dual-stream-bridge";

export const MAX_CHUNK_SEC = 180;

const WAV_HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = 2;
const BASE64_SLICE_BYTES = 0x8000;

export function encodeWavMono16(samples: Float32Array): Uint8Array {
  const dataBytes = samples.length * BYTES_PER_SAMPLE;
  const bytes = new Uint8Array(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(bytes.buffer);
  const encoder = new TextEncoder();

  bytes.set(encoder.encode("RIFF"), 0);
  view.setUint32(4, WAV_HEADER_BYTES - 8 + dataBytes, true);
  bytes.set(encoder.encode("WAVEfmt "), 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_STT_SAMPLE_RATE, true);
  view.setUint32(28, TARGET_STT_SAMPLE_RATE * BYTES_PER_SAMPLE, true);
  view.setUint16(32, BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);
  bytes.set(encoder.encode("data"), 36);
  view.setUint32(40, dataBytes, true);

  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(
      WAV_HEADER_BYTES + index * BYTES_PER_SAMPLE,
      clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
      true
    );
  });

  return bytes;
}

export function splitSamplesIntoChunks(
  samples: Float32Array
): Array<{ startOffsetSec: number; samples: Float32Array }> {
  const chunkLength = MAX_CHUNK_SEC * TARGET_STT_SAMPLE_RATE;
  const chunks: Array<{ startOffsetSec: number; samples: Float32Array }> = [];

  for (let start = 0; start < samples.length; start += chunkLength) {
    chunks.push({
      startOffsetSec: start / TARGET_STT_SAMPLE_RATE,
      samples: samples.subarray(start, start + chunkLength),
    });
  }

  return chunks;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += BASE64_SLICE_BYTES) {
    const slice = bytes.subarray(i, i + BASE64_SLICE_BYTES);
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  return btoa(binary);
}

export function wavBase64DurationSec(wavBase64: string): number {
  const padding = wavBase64.endsWith("==") ? 2 : wavBase64.endsWith("=") ? 1 : 0;
  const byteLength = (wavBase64.length / 4) * 3 - padding;
  return (
    Math.max(0, byteLength - WAV_HEADER_BYTES) /
    (TARGET_STT_SAMPLE_RATE * BYTES_PER_SAMPLE)
  );
}
