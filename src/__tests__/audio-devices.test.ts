import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { enumerateDualStreamDevices } from "@/services/audio/dual-stream-bridge";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const invokeMock = vi.mocked(invoke);

describe("Audio device enumeration over Tauri", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("maps the list_audio_devices inventory and routing snapshot", async () => {
    invokeMock.mockResolvedValue({
      devices: [
        {
          id: "in-1",
          name: "MacBook Pro Microphone",
          is_input: true,
          is_output: false,
          is_default: true,
          is_headphone_or_airpods: false,
          sample_rate: 48000,
          channels: 1,
        },
        {
          id: "out-1",
          name: "Minh's AirPods Pro",
          is_input: false,
          is_output: true,
          is_default: true,
          is_headphone_or_airpods: true,
          sample_rate: 24000,
          channels: 2,
        },
      ],
      routing: {
        active_input_device: "MacBook Pro Microphone",
        active_output_device: "MacBook Pro Speakers",
        is_headphone_mode: false,
        input_sample_rate: 48000,
        system_sample_rate: 44100,
      },
      system_audio_supported: true,
    });

    const result = await enumerateDualStreamDevices();

    expect(invokeMock).toHaveBeenCalledWith("list_audio_devices");
    expect(Array.isArray(result.devices)).toBe(true);
    expect(result.devices).toEqual([
      {
        id: "in-1",
        name: "MacBook Pro Microphone",
        kind: "audioinput",
        isDefault: true,
        isHeadphoneOrAirPods: false,
        sampleRate: 48000,
      },
      {
        id: "out-1",
        name: "Minh's AirPods Pro",
        kind: "audiooutput",
        isDefault: true,
        isHeadphoneOrAirPods: true,
        sampleRate: 24000,
      },
    ]);
    expect(result.activeInputName).toBe("MacBook Pro Microphone");
    expect(result.activeOutputName).toBe("MacBook Pro Speakers");
    expect(result.isHeadphoneOrAirPodsActive).toBe(false);
    expect(result.inputSampleRate).toBe(48000);
    expect(result.systemSampleRate).toBe(44100);
    expect(result.systemAudioSupported).toBe(true);
  });

  it.each([
    ["false", { system_audio_supported: false }],
    ["missing", {}],
  ])("reports system audio unsupported when the flag is %s", async (_, flag) => {
    invokeMock.mockResolvedValue({ devices: [], routing: {}, ...flag });

    const result = await enumerateDualStreamDevices();

    expect(result.systemAudioSupported).toBe(false);
  });

  it("flags headphone mode from the routing flag or the active device names", async () => {
    invokeMock.mockResolvedValueOnce({
      devices: [],
      routing: { is_headphone_mode: true },
    });
    invokeMock.mockResolvedValueOnce({
      devices: [],
      routing: { active_output_device: "Sony WH-1000XM5" },
    });

    const byFlag = await enumerateDualStreamDevices();
    const byName = await enumerateDualStreamDevices();

    expect(byFlag.isHeadphoneOrAirPodsActive).toBe(true);
    expect(byName.isHeadphoneOrAirPodsActive).toBe(true);
    expect(byFlag.activeInputName).toBe("Default Microphone");
    expect(byFlag.inputSampleRate).toBe(48000);
  });

  it("falls back to a non-empty device list when the command fails", async () => {
    invokeMock.mockRejectedValue(new Error("ipc unavailable"));

    const result = await enumerateDualStreamDevices();

    expect(Array.isArray(result.devices)).toBe(true);
    expect(result.devices.length).toBeGreaterThan(0);
    expect(result.systemAudioSupported).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  it("reports system audio unsupported from the MediaDevices fallback", async () => {
    invokeMock.mockRejectedValue(new Error("ipc unavailable"));
    vi.stubGlobal("navigator", {
      mediaDevices: {
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: "audioinput", deviceId: "default", label: "Built-in Mic" },
        ]),
      },
    });

    const result = await enumerateDualStreamDevices();

    expect(result.devices.map((device) => device.name)).toEqual(["Built-in Mic"]);
    expect(result.systemAudioSupported).toBe(false);
  });
});
