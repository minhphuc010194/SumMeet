import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useMeetingStore } from "@/store/meeting-store";
import type { TranscriptSegment } from "@/types/meeting";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const invokeMock = vi.mocked(invoke);
const STORAGE_KEY = "summarize-bot-clean-v4";
const SECRET_KEY = "sk-or-v1-secret-value";

function setTauriFlag(enabled: boolean) {
  if (enabled) {
    (globalThis as { isTauri?: boolean }).isTauri = true;
  } else {
    delete (globalThis as { isTauri?: boolean }).isTauri;
  }
}

function makeSegment(meetingId: string, index: number): TranscriptSegment {
  return {
    id: `seg-${index}`,
    meetingId,
    speakerId: "spk_user_me",
    speakerName: "You (Mic)",
    channel: "mic_user",
    text: `Segment ${index}`,
    startMs: index * 1000,
    endMs: (index + 1) * 1000,
    confidence: 0.99,
  };
}

function persistedPayload(meetings: unknown[]) {
  return JSON.stringify({
    version: 3,
    state: {
      meetings,
      selectedMeetingId: (meetings[0] as { id?: string } | undefined)?.id ?? "",
      calendarEvents: [],
      settings: {
        openRouterModel: "google/gemini-3.1-flash-lite",
        openRouterTextModel: "openai/gpt-6-luna",
        transcriptionLanguage: "vi",
        callDetectionEnabled: true,
      },
      recordingTranscribedSec: 0,
      recordingSystemTranscribedSec: 0,
      preferredInputDeviceId: null,
      includeSystemAudio: false,
      hasAnnouncedCallDetection: false,
    },
  });
}

describe("Meeting storage persistence and migration", () => {
  beforeEach(() => {
    setTauriFlag(false);
    localStorage.clear();
    invokeMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    useMeetingStore.setState({
      meetings: [],
      selectedMeetingId: "",
      openRouterKey: "",
      openRouterKeyStatus: "loading",
    });
  });

  afterEach(() => {
    setTauriFlag(false);
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("loads state from read_meeting_store on Tauri and removes any leftover legacy localStorage entry", async () => {
    setTauriFlag(true);
    const diskMeetings = [{ id: "mtg-disk", title: "Disk Meeting" }];
    const legacyMeetings = [{ id: "mtg-old", title: "Legacy Meeting" }];
    localStorage.setItem(STORAGE_KEY, persistedPayload(legacyMeetings));

    invokeMock.mockImplementation(async (cmd) => {
      if (cmd === "read_meeting_store") {
        return persistedPayload(diskMeetings);
      }
      return null;
    });

    await useMeetingStore.persist.rehydrate();

    expect(invokeMock).toHaveBeenCalledWith("read_meeting_store");
    expect(useMeetingStore.getState().meetings.map((m) => m.id)).toEqual([
      "mtg-disk",
    ]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("migrates legacy localStorage payload to write_meeting_store when disk store is empty and cleans up after success", async () => {
    setTauriFlag(true);
    const legacyPayload = persistedPayload([
      { id: "mtg-legacy", title: "Migrated Meeting" },
    ]);
    localStorage.setItem(STORAGE_KEY, legacyPayload);

    invokeMock.mockImplementation(async (cmd) => {
      if (cmd === "read_meeting_store") return null;
      if (cmd === "write_meeting_store") return null;
      return null;
    });

    await useMeetingStore.persist.rehydrate();

    expect(invokeMock).toHaveBeenCalledWith("read_meeting_store");
    expect(invokeMock).toHaveBeenCalledWith("write_meeting_store", {
      payload: legacyPayload,
    });
    expect(useMeetingStore.getState().meetings.map((m) => m.id)).toEqual([
      "mtg-legacy",
    ]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("preserves legacy localStorage payload when write_meeting_store fails during migration", async () => {
    setTauriFlag(true);
    const legacyPayload = persistedPayload([
      { id: "mtg-keep-legacy", title: "Keep Legacy" },
    ]);
    localStorage.setItem(STORAGE_KEY, legacyPayload);

    invokeMock.mockImplementation(async (cmd) => {
      if (cmd === "read_meeting_store") return null;
      if (cmd === "write_meeting_store") {
        throw new Error("disk_write_failed");
      }
      return null;
    });

    await useMeetingStore.persist.rehydrate();

    expect(useMeetingStore.getState().meetings.map((m) => m.id)).toEqual([
      "mtg-keep-legacy",
    ]);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(legacyPayload);
    expect(console.error).toHaveBeenCalled();
  });

  it("does not overwrite disk store while async rehydration is pending and keeps openRouterKey in memory", async () => {
    setTauriFlag(true);
    let resolveDiskRead!: (value: string | null) => void;
    const diskPayload = persistedPayload([
      { id: "mtg-saved", title: "Saved Meeting" },
    ]);

    invokeMock.mockImplementation((cmd) => {
      if (cmd === "read_meeting_store") {
        return new Promise<string | null>((resolve) => {
          resolveDiskRead = resolve;
        });
      }
      if (cmd === "get_openrouter_key") {
        return Promise.resolve(SECRET_KEY);
      }
      return Promise.resolve(null);
    });

    const rehydratePromise = useMeetingStore.persist.rehydrate();
    await useMeetingStore.getState().loadOpenRouterKey();
    await Promise.resolve();

    expect(invokeMock).not.toHaveBeenCalledWith(
      "write_meeting_store",
      expect.anything()
    );

    resolveDiskRead(diskPayload);
    await rehydratePromise;

    expect(useMeetingStore.getState().meetings.map((m) => m.id)).toEqual([
      "mtg-saved",
    ]);
    expect(useMeetingStore.getState().openRouterKey).toBe(SECRET_KEY);
    expect(useMeetingStore.getState().openRouterKeyStatus).toBe("ready");
  });

  it("coalesces burst segment writes in the same tick into a single write_meeting_store call without openRouterKey", async () => {
    setTauriFlag(true);
    const writtenPayloads: string[] = [];

    invokeMock.mockImplementation(async (cmd, args) => {
      if (cmd === "read_meeting_store") return null;
      if (cmd === "write_meeting_store") {
        writtenPayloads.push((args as { payload: string }).payload);
      }
      return null;
    });

    await useMeetingStore.persist.rehydrate();
    useMeetingStore.setState({ openRouterKey: SECRET_KEY });
    writtenPayloads.length = 0;

    const meeting = useMeetingStore.getState().createMeetingSession({
      id: "mtg-burst",
      title: "Burst Test",
      audioDeviceUsed: "Mic",
      isHeadphoneSession: false,
      locale: "en",
    });
    useMeetingStore
      .getState()
      .appendTranscriptSegment(meeting.id, makeSegment(meeting.id, 1));
    useMeetingStore
      .getState()
      .appendTranscriptSegment(meeting.id, makeSegment(meeting.id, 2));
    useMeetingStore
      .getState()
      .appendTranscriptSegment(meeting.id, makeSegment(meeting.id, 3));

    await vi.waitFor(() => expect(writtenPayloads.length).toBe(1));

    const parsed = JSON.parse(writtenPayloads[0]);
    expect(parsed.state.meetings[0].segments).toHaveLength(3);
    expect(parsed.state).not.toHaveProperty("openRouterKey");
    expect(writtenPayloads[0]).not.toContain(SECRET_KEY);
  });

  it("keeps in-memory transcript and summary updates working when localStorage throws QuotaExceededError", () => {
    setTauriFlag(false);
    const meeting = useMeetingStore.getState().createMeetingSession({
      id: "mtg-quota",
      title: "Quota Test",
      audioDeviceUsed: "Mic",
      isHeadphoneSession: false,
      locale: "en",
    });

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    useMeetingStore
      .getState()
      .appendTranscriptSegment(meeting.id, makeSegment(meeting.id, 1));
    useMeetingStore.getState().updateMeetingSummary(meeting.id, {
      ...meeting.summary,
      overview: "Updated overview despite quota error",
    });

    const updated = useMeetingStore
      .getState()
      .meetings.find((m) => m.id === meeting.id);
    expect(updated?.segments).toHaveLength(1);
    expect(updated?.summary.overview).toBe("Updated overview despite quota error");
    expect(console.error).toHaveBeenCalled();
  });
});
