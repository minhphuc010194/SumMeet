import { describe, expect, it } from "vitest";
import {
  applyEchoSuppressionGate,
  calculateRmsLevel,
  detectHeadphoneOrAirPods,
  resampleMonoPcm,
  TARGET_STT_SAMPLE_RATE,
} from "@/services/audio/dual-stream-bridge";

describe("Dual-Stream Audio & AirPods/Headphone Engine", () => {
  it("identifies AirPods Pro, Bluetooth headsets, and wired headphones accurately", () => {
    // Given various macOS and Bluetooth audio device labels
    // When detecting whether the device is a headphone/AirPods
    // Then headphones and AirPods return true while built-in speakers return false
    expect(detectHeadphoneOrAirPods("Minh's AirPods Pro")).toBe(true);
    expect(detectHeadphoneOrAirPods("AirPods Max (Bluetooth HFP)")).toBe(true);
    expect(detectHeadphoneOrAirPods("Sony WH-1000XM5")).toBe(true);
    expect(detectHeadphoneOrAirPods("External Headphones")).toBe(true);
    expect(detectHeadphoneOrAirPods("MacBook Pro Speakers")).toBe(false);
    expect(detectHeadphoneOrAirPods("MacBook Pro Microphone")).toBe(false);
  });

  it("resamples 24kHz AirPods Bluetooth HFP and 48kHz System Audio to 16kHz Mono PCM", () => {
    // Given a 1-second 24,000 Hz audio buffer from AirPods Bluetooth HFP
    const airpodsBuffer24k = new Float32Array(24000);
    for (let i = 0; i < airpodsBuffer24k.length; i++) {
      airpodsBuffer24k[i] = Math.sin(i * 0.02) * 0.5;
    }

    // When resampling to 16,000 Hz target STT sample rate
    const resampled16k = resampleMonoPcm(
      airpodsBuffer24k,
      24000,
      TARGET_STT_SAMPLE_RATE
    );

    // Then the output length is 16,000 samples and signal energy is preserved
    expect(resampled16k.length).toBe(16000);
    expect(calculateRmsLevel(resampled16k)).toBeGreaterThan(0.2);
  });

  it("disables echo attenuation when AirPods or headphones are worn so double-talk is never clipped", () => {
    // Given simultaneous speech on user's AirPods mic and loud remote meeting audio
    const userMicSignal = new Float32Array(1024).fill(0.06);
    const remoteSystemSignal = new Float32Array(1024).fill(0.55);

    // When in Headphone / AirPods mode
    const headphoneResult = applyEchoSuppressionGate(
      userMicSignal,
      remoteSystemSignal,
      true
    );

    // Then zero attenuation is applied to the user's microphone
    expect(headphoneResult[0]).toBeCloseTo(0.06, 4);

    // When in laptop Speaker mode (not wearing headphones)
    const speakerResult = applyEchoSuppressionGate(
      userMicSignal,
      remoteSystemSignal,
      false
    );

    // Then speaker bleed is suppressed
    expect(speakerResult[0]).toBeLessThan(0.01);
  });
});
