import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordingControlBar } from "@/components/recorder/RecordingControlBar";
import { getDictionary } from "@/i18n/dictionaries";
import { generateSummaryWithFallback } from "@/services/ai/provider-registry";
import {
  getActiveRecording,
  startMicRecording,
  stopMicRecording,
} from "@/services/audio/recording-commands";
import { transcribeRecordingTail } from "@/services/audio/recording-transcription";
import { useMeetingStore } from "@/store/meeting-store";
import type { MeetingSummary, TranscriptSegment } from "@/types/meeting";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `asset://${path}`,
}));
vi.mock("@/services/audio/recording-commands", () => ({
  getActiveRecording: vi.fn(),
  startMicRecording: vi.fn(),
  stopMicRecording: vi.fn(),
}));
vi.mock("@/services/audio/recording-transcription", () => ({
  transcribeRecordingSlice: vi.fn(),
  transcribeRecordingTail: vi.fn(),
}));
vi.mock("@/services/ai/provider-registry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/ai/provider-registry")>()),
  generateSummaryWithFallback: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);
const activeMock = vi.mocked(getActiveRecording);
const startMock = vi.mocked(startMicRecording);
const stopMock = vi.mocked(stopMicRecording);
const tailMock = vi.mocked(transcribeRecordingTail);
const summaryMock = vi.mocked(generateSummaryWithFallback);

type ActiveRecordingResult = Awaited<ReturnType<typeof getActiveRecording>>;

const dict = getDictionary("vi");
const WAV_PATH = "/recordings/mtg.wav";
const PERSISTED_OFFSET_SEC = 95;
const STORAGE_KEY = "summarize-bot-clean-v4";
const BUILT_IN_MIC = { id: "coreaudio:built-in", name: "MacBook Pro Microphone" };
const USB_MIC = { id: "coreaudio:usb", name: "USB Podcast Mic" };
const STARTED = {
  meetingId: "mtg-started",
  wavPath: WAV_PATH,
  startedAtMs: 0,
};
const DEVICE_INVENTORY = {
  devices: [
    { ...BUILT_IN_MIC, is_input: true, is_default: true },
    { ...USB_MIC, is_input: true, is_default: false },
    { id: "coreaudio:speakers", name: "MacBook Pro Speakers", is_output: true },
  ],
  routing: {
    active_input_device: BUILT_IN_MIC.name,
    active_output_device: "MacBook Pro Speakers",
  },
};

function segmentFor(meetingId: string): TranscriptSegment {
  return {
    id: "seg-tail",
    meetingId,
    speakerId: "spk_user_me",
    speakerName: "Bạn (Mic)",
    channel: "mic_user",
    text: "Phần cuối cuộc họp",
    startMs: 95_000,
    endMs: 99_000,
    confidence: 0.99,
  };
}

function summaryFor(meetingId: string): MeetingSummary {
  return {
    meetingId,
    templateId: "general",
    overview: "Tóm tắt",
    actionItems: [],
    keyDecisions: [],
    outline: [],
    keywords: [],
    sentiment: "focused",
    providerUsed: "OpenRouter",
    promptVersion: "v1",
    updatedAt: "2026-10-16T00:00:00Z",
  };
}

async function recoverAndStopRecording() {
  const meeting = useMeetingStore.getState().createMeetingSession({
    title: "Daily",
    audioDeviceUsed: "Mic",
    isHeadphoneSession: false,
    locale: "vi",
  });
  useMeetingStore.getState().setRecordingTranscribedSec(PERSISTED_OFFSET_SEC);
  activeMock.mockResolvedValue({
    success: true,
    data: {
      meetingId: meeting.id,
      wavPath: WAV_PATH,
      startedAtMs: 0,
      elapsedSec: 400,
      level: 0.1,
    },
  });
  stopMock.mockResolvedValue({
    success: true,
    data: {
      meetingId: meeting.id,
      fileName: "mtg.wav",
      wavPath: WAV_PATH,
      sizeBytes: 1,
      createdAtMs: 0,
      durationSec: 410,
    },
  });
  summaryMock.mockResolvedValue({ success: true, data: summaryFor(meeting.id) });

  const onToast = vi.fn();
  render(
    <RecordingControlBar dict={dict} locale="vi" onToast={onToast} />
  );
  fireEvent.click(
    await screen.findByRole("button", { name: dict.recorder.stopRecording })
  );
  await waitFor(() =>
    expect(
      useMeetingStore.getState().meetings.find((m) => m.id === meeting.id)
        ?.status
    ).toBe("completed")
  );
  return { meeting, onToast };
}

describe("Recording control bar after a reload", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    useMeetingStore.setState({ meetings: [], selectedMeetingId: "" });
  });

  it("drains the tail from the persisted offset instead of skipping recent audio", async () => {
    tailMock.mockResolvedValue({ success: true });

    const { meeting } = await recoverAndStopRecording();

    expect(tailMock).toHaveBeenCalledTimes(1);
    expect(tailMock.mock.calls[0][0]).toMatchObject({
      meetingId: meeting.id,
      startSec: PERSISTED_OFFSET_SEC,
      locale: "vi",
      transcriptionLanguage: "vi",
    });
  });

  it("still summarizes the transcript gathered so far when the tail fails", async () => {
    tailMock.mockImplementation(async ({ meetingId, onSegments }) => {
      onSegments([segmentFor(meetingId)]);
      return { success: false, error: "tail failed" };
    });

    const { meeting, onToast } = await recoverAndStopRecording();

    expect(onToast).toHaveBeenCalledWith("tail failed");
    expect(summaryMock).toHaveBeenCalledTimes(1);
    expect(summaryMock.mock.calls[0][0].segments).toEqual([
      segmentFor(meeting.id),
    ]);
    const saved = useMeetingStore
      .getState()
      .meetings.find((m) => m.id === meeting.id);
    expect(saved).toMatchObject({
      status: "completed",
      durationSeconds: 410,
      audioDataUrl: `asset://${WAV_PATH}`,
    });
    expect(saved?.summary.overview).toBe("Tóm tắt");
  });

  it("recovers a reload during device open from zero, not the previous meeting's offset", async () => {
    tailMock.mockResolvedValue({ success: true });
    activeMock.mockResolvedValue({ success: true, data: null });
    startMock.mockReturnValue(new Promise(() => {}));
    useMeetingStore.getState().setRecordingTranscribedSec(PERSISTED_OFFSET_SEC);

    const firstPage = render(
      <RecordingControlBar dict={dict} locale="vi" onToast={vi.fn()} />
    );
    fireEvent.click(
      await screen.findByRole("button", { name: dict.recorder.startRecording })
    );
    await waitFor(() => expect(startMock).toHaveBeenCalledTimes(1));
    const { meetingId } = startMock.mock.calls[0][0];
    const persisted = localStorage.getItem(STORAGE_KEY) ?? "";
    firstPage.unmount();

    useMeetingStore.setState({
      meetings: [],
      recordingTranscribedSec: PERSISTED_OFFSET_SEC,
    });
    localStorage.setItem(STORAGE_KEY, persisted);
    await useMeetingStore.persist.rehydrate();
    const recovered = useMeetingStore
      .getState()
      .meetings.find((m) => m.id === meetingId);
    expect(recovered?.segments).toEqual([]);
    expect(useMeetingStore.getState().recordingTranscribedSec).toBe(0);

    activeMock.mockResolvedValue({
      success: true,
      data: {
        meetingId,
        wavPath: WAV_PATH,
        startedAtMs: 0,
        elapsedSec: 12,
        level: 0.1,
      },
    });
    stopMock.mockResolvedValue({
      success: true,
      data: {
        meetingId,
        fileName: "mtg.wav",
        wavPath: WAV_PATH,
        sizeBytes: 1,
        createdAtMs: 0,
        durationSec: 15,
      },
    });
    summaryMock.mockResolvedValue({ success: true, data: summaryFor(meetingId) });
    render(<RecordingControlBar dict={dict} locale="vi" onToast={vi.fn()} />);
    fireEvent.click(
      await screen.findByRole("button", { name: dict.recorder.stopRecording })
    );
    await waitFor(() => expect(tailMock).toHaveBeenCalledTimes(1));

    expect(tailMock.mock.calls[0][0]).toMatchObject({ meetingId, startSec: 0 });
  });

  it("blocks Start until recovery finishes so the recovered offset is kept", async () => {
    const meeting = useMeetingStore.getState().createMeetingSession({
      title: "Daily",
      audioDeviceUsed: "Mic",
      isHeadphoneSession: false,
      locale: "vi",
    });
    useMeetingStore.getState().setRecordingTranscribedSec(PERSISTED_OFFSET_SEC);
    let finishRecovery: (value: ActiveRecordingResult) => void = () => {};
    activeMock.mockReturnValue(
      new Promise((resolve) => {
        finishRecovery = resolve;
      })
    );

    render(<RecordingControlBar dict={dict} locale="vi" onToast={vi.fn()} />);
    const startButton = await screen.findByRole("button", {
      name: dict.recorder.startRecording,
    });
    fireEvent.click(startButton);

    expect((startButton as HTMLButtonElement).disabled).toBe(true);
    expect(startMock).not.toHaveBeenCalled();
    expect(useMeetingStore.getState().recordingTranscribedSec).toBe(
      PERSISTED_OFFSET_SEC
    );

    finishRecovery({
      success: true,
      data: {
        meetingId: meeting.id,
        wavPath: WAV_PATH,
        startedAtMs: 0,
        elapsedSec: 400,
        level: 0.1,
      },
    });
    await screen.findByRole("button", { name: dict.recorder.stopRecording });

    expect(startMock).not.toHaveBeenCalled();
    expect(useMeetingStore.getState().recordingTranscribedSec).toBe(
      PERSISTED_OFFSET_SEC
    );
  });
});

describe("Recording microphone picker", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    useMeetingStore.setState({
      meetings: [],
      selectedMeetingId: "",
      preferredInputDeviceId: null,
    });
    invokeMock.mockResolvedValue(DEVICE_INVENTORY);
    activeMock.mockResolvedValue({ success: true, data: null });
    startMock.mockResolvedValue({ success: true, data: STARTED });
  });

  afterEach(() => {
    invokeMock.mockReset();
  });

  function optionLabels(select: HTMLElement) {
    return within(select)
      .getAllByRole("option")
      .map((option) => option.textContent);
  }

  async function renderPicker(onToast = vi.fn()) {
    render(<RecordingControlBar dict={dict} locale="vi" onToast={onToast} />);
    const select = (await screen.findByRole("combobox", {
      name: dict.recorder.inputDeviceLabel,
    })) as HTMLSelectElement;
    await waitFor(() => expect(optionLabels(select)).toHaveLength(3));
    return select;
  }

  async function clickStart() {
    const startButton = (await screen.findByRole("button", {
      name: dict.recorder.startRecording,
    })) as HTMLButtonElement;
    await waitFor(() => expect(startButton.disabled).toBe(false));
    fireEvent.click(startButton);
    await waitFor(() => expect(startMock).toHaveBeenCalledTimes(1));
  }

  it("lists the system default followed by the input devices only", async () => {
    const select = await renderPicker();

    expect(optionLabels(select)).toEqual([
      dict.recorder.systemDefaultDevice.replace("{device}", BUILT_IN_MIC.name),
      BUILT_IN_MIC.name,
      USB_MIC.name,
    ]);
    expect(select.value).toBe("");
  });

  it("is disabled while a recording is running", async () => {
    const select = await renderPicker();
    await waitFor(() => expect(select.disabled).toBe(false));

    await clickStart();
    await screen.findByRole("button", { name: dict.recorder.stopRecording });

    expect(select.disabled).toBe(true);
  });

  it("stores the chosen device and starts recording from it", async () => {
    const select = await renderPicker();

    fireEvent.change(select, { target: { value: USB_MIC.id } });
    await clickStart();

    expect(useMeetingStore.getState().preferredInputDeviceId).toBe(USB_MIC.id);
    expect(select.value).toBe(USB_MIC.id);
    expect(startMock.mock.calls[0][0]).toMatchObject({
      inputDeviceId: USB_MIC.id,
      locale: "vi",
    });
    expect(useMeetingStore.getState().meetings[0].audioDeviceUsed).toBe(
      USB_MIC.name
    );
  });

  it("falls back to the system default when the stored device is no longer listed", async () => {
    useMeetingStore.setState({ preferredInputDeviceId: "coreaudio:unplugged" });

    const select = await renderPicker();
    await clickStart();

    expect(select.value).toBe("");
    expect(startMock.mock.calls[0][0]).toMatchObject({ inputDeviceId: null });
    expect(useMeetingStore.getState().meetings[0].audioDeviceUsed).toBe(
      BUILT_IN_MIC.name
    );
  });

  it("toasts the unavailable-microphone error and keeps no meeting when Start fails", async () => {
    useMeetingStore.setState({ preferredInputDeviceId: USB_MIC.id });
    startMock.mockResolvedValue({
      success: false,
      error: dict.errors.inputDeviceUnavailable,
    });
    const onToast = vi.fn();

    await renderPicker(onToast);
    await clickStart();

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(dict.errors.inputDeviceUnavailable)
    );
    expect(startMock.mock.calls[0][0]).toMatchObject({
      inputDeviceId: USB_MIC.id,
    });
    expect(useMeetingStore.getState().meetings).toEqual([]);
  });

  it("keeps Start disabled until the device list resolves, then sends the saved device", async () => {
    useMeetingStore.setState({ preferredInputDeviceId: USB_MIC.id });
    let finishEnumeration: (value: typeof DEVICE_INVENTORY) => void = () => {};
    invokeMock.mockReturnValue(
      new Promise((resolve) => {
        finishEnumeration = resolve;
      })
    );

    render(<RecordingControlBar dict={dict} locale="vi" onToast={vi.fn()} />);
    const startButton = (await screen.findByRole("button", {
      name: dict.recorder.startRecording,
    })) as HTMLButtonElement;
    fireEvent.click(startButton);

    expect(startButton.disabled).toBe(true);
    expect(startMock).not.toHaveBeenCalled();

    finishEnumeration(DEVICE_INVENTORY);
    await waitFor(() => expect(startButton.disabled).toBe(false));
    fireEvent.click(startButton);

    await waitFor(() => expect(startMock).toHaveBeenCalledTimes(1));
    expect(startMock.mock.calls[0][0]).toMatchObject({
      inputDeviceId: USB_MIC.id,
    });
  });
});
