import { invoke } from "@tauri-apps/api/core";
import type { AudioDeviceItem, DualStreamStatus } from "@/types/meeting";

export const TARGET_STT_SAMPLE_RATE = 16000;

interface AudioDevicesInventory {
  devices?: Array<Record<string, unknown>>;
  routing?: Record<string, unknown>;
}

const HEADPHONE_KEYWORDS = [
  "airpods",
  "airpod",
  "headphone",
  "headphones",
  "headset",
  "earpods",
  "earbuds",
  "beats",
  "sony wh",
  "sony wf",
  "bose",
  "sennheiser",
  "jabra",
  "external headphones",
  "bluetooth",
];

/**
 * Identifies whether an audio device label corresponds to AirPods, Bluetooth headsets, or wired headphones.
 */
export function detectHeadphoneOrAirPods(deviceName: string): boolean {
  if (!deviceName) {
    return false;
  }
  const normalized = deviceName.toLowerCase();
  return HEADPHONE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

/**
 * Resamples mono Float32 PCM audio from any device sample rate (e.g., 16kHz Bluetooth HFP,
 * 24kHz AirPods Pro, 44.1kHz, or 48kHz System Audio) to 16kHz mono PCM.
 */
export function resampleMonoPcm(
  samples: Float32Array,
  sourceRate: number,
  targetRate = TARGET_STT_SAMPLE_RATE
): Float32Array {
  if (samples.length === 0 || sourceRate <= 0 || targetRate <= 0) {
    return new Float32Array(0);
  }
  if (sourceRate === targetRate) {
    return new Float32Array(samples);
  }

  const ratio = sourceRate / targetRate;
  const outputLength = Math.round(samples.length / ratio);
  if (outputLength <= 0) {
    return new Float32Array(0);
  }

  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcPos = i * ratio;
    const leftIdx = Math.floor(srcPos);
    const rightIdx = Math.min(leftIdx + 1, samples.length - 1);
    const frac = srcPos - leftIdx;
    const interpolated =
      samples[leftIdx] * (1 - frac) + samples[rightIdx] * frac;
    output[i] = Math.max(-1, Math.min(1, interpolated));
  }

  return output;
}

/**
 * Calculates normalized RMS level in [0, 1] for live dual-channel waveform meters.
 */
export function calculateRmsLevel(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSquares += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sumSquares / samples.length);
  return Math.min(1, Math.max(0, rms * 2.8));
}

/**
 * Applies adaptive echo suppression gate ONLY when laptop speakers are used.
 * When headphones or AirPods are active (`isHeadphoneMode === true`), zero attenuation is applied
 * so simultaneous user speech (double-talk) is captured at 100% fidelity.
 */
export function applyEchoSuppressionGate(
  micSamples: Float32Array,
  systemSamples: Float32Array,
  isHeadphoneMode: boolean
): Float32Array {
  if (isHeadphoneMode) {
    return new Float32Array(micSamples);
  }

  const micRms = calculateRmsLevel(micSamples);
  const sysRms = calculateRmsLevel(systemSamples);

  if (sysRms > 0.25 && micRms < sysRms * 0.45) {
    const attenuated = new Float32Array(micSamples.length);
    for (let i = 0; i < micSamples.length; i++) {
      attenuated[i] = micSamples[i] * 0.08;
    }
    return attenuated;
  }

  return new Float32Array(micSamples);
}

/**
 * Enumerates audio input and output devices from the Tauri Rust backend, falling back to browser MediaDevices.
 */
export async function enumerateDualStreamDevices(): Promise<{
  devices: AudioDeviceItem[];
  activeInputName: string;
  activeOutputName: string;
  isHeadphoneOrAirPodsActive: boolean;
  inputSampleRate: number;
  systemSampleRate: number;
}> {
  try {
    const parsed = await invoke<AudioDevicesInventory>("list_audio_devices");
    if (parsed && Array.isArray(parsed.devices)) {
      const devices: AudioDeviceItem[] = parsed.devices.map((d) => ({
        id: String(d.id ?? "dev"),
        name: String(d.name ?? "Audio Device"),
        kind: d.is_input ? "audioinput" : "audiooutput",
        isDefault: Boolean(d.is_default),
        isHeadphoneOrAirPods: Boolean(d.is_headphone_or_airpods),
        sampleRate: Number(d.sample_rate ?? 48000),
      }));

      const activeInputName = String(
        parsed.routing?.active_input_device ?? "Default Microphone"
      );
      const activeOutputName = String(
        parsed.routing?.active_output_device ?? "Default System Output"
      );

      const isHeadphoneOrAirPodsActive =
        Boolean(parsed.routing?.is_headphone_mode) ||
        detectHeadphoneOrAirPods(activeInputName) ||
        detectHeadphoneOrAirPods(activeOutputName);

      return {
        devices,
        activeInputName,
        activeOutputName,
        isHeadphoneOrAirPodsActive,
        inputSampleRate: Number(parsed.routing?.input_sample_rate ?? 48000),
        systemSampleRate: Number(parsed.routing?.system_sample_rate ?? 48000),
      };
    }
  } catch (error) {
    console.error("[DualStreamBridge] Fallback to Web MediaDevices enumeration:", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (
    typeof navigator !== "undefined" &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.enumerateDevices === "function"
  ) {
    try {
      const mediaDevices = await navigator.mediaDevices.enumerateDevices();
      const mapped: AudioDeviceItem[] = mediaDevices
        .filter((d) => d.kind === "audioinput" || d.kind === "audiooutput")
        .map((d, index) => {
          const fallbackLabel =
            d.kind === "audioinput"
              ? `Microphone ${index + 1}`
              : `System Output ${index + 1}`;
          const name = d.label || fallbackLabel;
          return {
            id: d.deviceId || `${d.kind}-${index}`,
            name,
            kind: d.kind as "audioinput" | "audiooutput",
            isDefault: d.deviceId === "default" || index === 0,
            isHeadphoneOrAirPods: detectHeadphoneOrAirPods(name),
            sampleRate: detectHeadphoneOrAirPods(name) ? 24000 : 48000,
          };
        });

      const activeIn =
        mapped.find((d) => d.kind === "audioinput" && d.isDefault) ||
        mapped.find((d) => d.kind === "audioinput");
      const activeOut =
        mapped.find((d) => d.kind === "audiooutput" && d.isDefault) ||
        mapped.find((d) => d.kind === "audiooutput");

      const activeInputName = activeIn?.name ?? "AirPods Pro / Default Mic";
      const activeOutputName =
        activeOut?.name ?? "AirPods Pro / System Loopback";
      const isHeadphoneOrAirPodsActive =
        detectHeadphoneOrAirPods(activeInputName) ||
        detectHeadphoneOrAirPods(activeOutputName);

      return {
        devices: mapped,
        activeInputName,
        activeOutputName,
        isHeadphoneOrAirPodsActive,
        inputSampleRate: isHeadphoneOrAirPodsActive ? 24000 : 48000,
        systemSampleRate: 48000,
      };
    } catch (error) {
      console.error("[DualStreamBridge] MediaDevices enumeration failed:", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    devices: [
      {
        id: "in-airpods",
        name: "AirPods Pro (Bluetooth HFP 24kHz -> 16kHz)",
        kind: "audioinput",
        isDefault: true,
        isHeadphoneOrAirPods: true,
        sampleRate: 24000,
      },
      {
        id: "out-airpods",
        name: "AirPods Pro (System Audio Loopback 48kHz)",
        kind: "audiooutput",
        isDefault: true,
        isHeadphoneOrAirPods: true,
        sampleRate: 48000,
      },
    ],
    activeInputName: "AirPods Pro (Mic)",
    activeOutputName: "AirPods Pro (System Loopback)",
    isHeadphoneOrAirPodsActive: true,
    inputSampleRate: 24000,
    systemSampleRate: 48000,
  };
}

export function createInitialDualStreamStatus(): DualStreamStatus {
  return {
    isRecording: false,
    isPaused: false,
    durationSeconds: 0,
    activeInputDeviceName: "AirPods Pro / Default Microphone",
    activeOutputDeviceName: "System Audio Loopback (Headphones Ready)",
    isHeadphoneOrAirPodsActive: true,
    inputSampleRate: 24000,
    systemSampleRate: 48000,
    echoGateEnabled: false,
    micLevel: 0,
    systemLevel: 0,
    systemAudioConnected: true,
    hotSwapCount: 0,
    lastHotSwapMessage: null,
  };
}
