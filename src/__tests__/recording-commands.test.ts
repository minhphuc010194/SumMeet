import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { getDictionary } from "@/i18n/dictionaries";
import {
  deleteAllRecordings,
  deleteRecording,
  getActiveRecording,
  listRecordings,
  readRecordingSlice,
  startMicRecording,
  stopMicRecording,
} from "@/services/audio/recording-commands";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const invokeMock = vi.mocked(invoke);

const RECORDING_FILE = {
  meetingId: "mtg-1",
  fileName: "mtg-1.wav",
  wavPath: "/data/recordings/mtg-1.wav",
  sizeBytes: 64000,
  createdAtMs: 1700000000000,
  durationSec: 2,
};

describe("Recording command wrappers", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["the chosen device id", "coreaudio:usb-mic"],
    ["null for the system default", null],
  ])("starts a recording with the meeting id and %s", async (_, inputDeviceId) => {
    const started = {
      meetingId: "mtg-1",
      wavPath: RECORDING_FILE.wavPath,
      startedAtMs: 1700000000000,
    };
    invokeMock.mockResolvedValue(started);

    const result = await startMicRecording({
      meetingId: "mtg-1",
      inputDeviceId,
      locale: "en",
    });

    expect(invokeMock).toHaveBeenCalledWith("start_mic_recording", {
      meetingId: "mtg-1",
      options: { inputDeviceId },
    });
    expect(result).toEqual({ success: true, data: started });
  });

  it("returns the active recording or null from get_recording_status", async () => {
    const active = {
      meetingId: "mtg-1",
      wavPath: RECORDING_FILE.wavPath,
      startedAtMs: 1700000000000,
      elapsedSec: 12.5,
      level: 0.3,
    };
    invokeMock.mockResolvedValueOnce({ active });
    invokeMock.mockResolvedValueOnce({ active: null });

    expect(await getActiveRecording("vi")).toEqual({
      success: true,
      data: active,
    });
    expect(await getActiveRecording("vi")).toEqual({
      success: true,
      data: null,
    });
    expect(invokeMock).toHaveBeenCalledWith("get_recording_status", undefined);
  });

  it("stops the recording and returns the finalized file", async () => {
    invokeMock.mockResolvedValue(RECORDING_FILE);

    const result = await stopMicRecording("vi");

    expect(invokeMock).toHaveBeenCalledWith("stop_mic_recording", undefined);
    expect(result).toEqual({ success: true, data: RECORDING_FILE });
  });

  it("reads a slice with camelCase arguments", async () => {
    invokeMock.mockResolvedValue("UklGRg==");

    const result = await readRecordingSlice({
      meetingId: "mtg-1",
      startSec: 30,
      maxSec: 180,
      locale: "vi",
    });

    expect(invokeMock).toHaveBeenCalledWith("read_recording_slice", {
      meetingId: "mtg-1",
      startSec: 30,
      maxSec: 180,
    });
    expect(result).toEqual({ success: true, data: "UklGRg==" });
  });

  it("lists recordings with the recordings directory", async () => {
    const listing = { recordingsDir: "/data/recordings", files: [RECORDING_FILE] };
    invokeMock.mockResolvedValue(listing);

    const result = await listRecordings("en");

    expect(invokeMock).toHaveBeenCalledWith("list_recordings", undefined);
    expect(result).toEqual({ success: true, data: listing });
  });

  it("deletes one recording by id and all recordings", async () => {
    invokeMock.mockResolvedValue(null);

    const single = await deleteRecording({ meetingId: "mtg-1", locale: "vi" });
    const all = await deleteAllRecordings("vi");

    expect(invokeMock).toHaveBeenNthCalledWith(1, "delete_recording", {
      meetingId: "mtg-1",
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "delete_all_recordings", undefined);
    expect(single.success).toBe(true);
    expect(all.success).toBe(true);
  });

  it.each([
    ["no_input_device", "noInputDevice"],
    ["recording_active", "recordingActive"],
    ["input_device_unavailable", "inputDeviceUnavailable"],
    ["capture_thread_panicked", "recordingFailed"],
  ] as const)("maps the %s error code to a localized message", async (code, key) => {
    invokeMock.mockRejectedValue(code);

    const vietnamese = await startMicRecording({
      meetingId: "mtg-1",
      inputDeviceId: null,
      locale: "vi",
    });
    const english = await startMicRecording({
      meetingId: "mtg-1",
      inputDeviceId: null,
      locale: "en",
    });

    expect(vietnamese).toEqual({
      success: false,
      error: getDictionary("vi").errors[key],
    });
    expect(english).toEqual({
      success: false,
      error: getDictionary("en").errors[key],
    });
  });

  it("reports a localized failure when the command throws an Error", async () => {
    invokeMock.mockRejectedValue(new Error("ipc unavailable"));

    const result = await listRecordings("en");

    expect(result).toEqual({
      success: false,
      error: getDictionary("en").errors.recordingFailed,
    });
  });
});
