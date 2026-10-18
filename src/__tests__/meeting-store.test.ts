import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDictionary } from "@/i18n/dictionaries";
import { useMeetingStore } from "@/store/meeting-store";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const STORAGE_KEY = "summarize-bot-clean-v4";
const SESSION_PARAMS = {
  title: "Weekly sync",
  audioDeviceUsed: "MacBook Pro Microphone",
  isHeadphoneSession: false,
};

describe("Meeting session defaults", () => {
  beforeEach(() => {
    localStorage.clear();
    useMeetingStore.setState({ meetings: [], selectedMeetingId: "" });
  });

  it.each(["vi", "en"] as const)(
    "resolves the default participants and live overview for the %s locale",
    (locale) => {
      const dict = getDictionary(locale);

      const meeting = useMeetingStore
        .getState()
        .createMeetingSession({ ...SESSION_PARAMS, locale });

      expect(meeting.participants).toEqual([
        dict.transcript.defaultMicSpeaker,
        dict.session.systemAudioParticipant,
      ]);
      expect(meeting.summary.overview).toBe(dict.session.liveOverview);
    }
  );

  it.each(["vi", "en"] as const)(
    "labels the live keywords and provider in the %s locale",
    (locale) => {
      const { session } = getDictionary(locale);
      const { createMeetingSession } = useMeetingStore.getState();

      const speaker = createMeetingSession({ ...SESSION_PARAMS, locale });
      const headphones = createMeetingSession({
        ...SESSION_PARAMS,
        isHeadphoneSession: true,
        locale,
      });

      expect(speaker.summary.keywords).toEqual([
        session.liveKeyword,
        session.speakerKeyword,
      ]);
      expect(headphones.summary.keywords).toEqual([
        session.liveKeyword,
        session.headphoneKeyword,
      ]);
      expect(speaker.summary.providerUsed).toBe(session.liveProvider);
    }
  );

  it("does not leak English labels into the Vietnamese live summary", () => {
    const { summary } = useMeetingStore
      .getState()
      .createMeetingSession({ ...SESSION_PARAMS, locale: "vi" });

    expect(summary.keywords).not.toContain("Live Recording");
    expect(summary.keywords).not.toContain("Speaker Mode");
    expect(summary.providerUsed).not.toBe("Live Stream");
  });

  it("keeps the participants given by the caller", () => {
    const meeting = useMeetingStore.getState().createMeetingSession({
      ...SESSION_PARAMS,
      locale: "en",
      participants: ["Ann", "Bob"],
    });

    expect(meeting.participants).toEqual(["Ann", "Bob"]);
  });

  it("preserves explicit id and createdAt when restoring a disk recording", () => {
    const meeting = useMeetingStore.getState().createMeetingSession({
      ...SESSION_PARAMS,
      id: "mtg-1792242085270",
      createdAt: "2026-10-17T13:01:25.270Z",
      locale: "en",
    });

    expect(meeting.id).toBe("mtg-1792242085270");
    expect(meeting.createdAt).toBe("2026-10-17T13:01:25.270Z");
  });
});

describe("Live transcription offset", () => {
  beforeEach(() => {
    localStorage.clear();
    useMeetingStore.getState().setRecordingTranscribedSec(0);
  });

  it("is persisted and restored after a reload", async () => {
    useMeetingStore.getState().setRecordingTranscribedSec(95);
    const persisted = localStorage.getItem(STORAGE_KEY) ?? "";
    expect(JSON.parse(persisted).state.recordingTranscribedSec).toBe(95);

    useMeetingStore.getState().setRecordingTranscribedSec(0);
    localStorage.setItem(STORAGE_KEY, persisted);
    await useMeetingStore.persist.rehydrate();

    expect(useMeetingStore.getState().recordingTranscribedSec).toBe(95);
  });

  it("defaults to zero for state saved before the offset existed", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: {
          meetings: [],
          selectedMeetingId: "",
          calendarEvents: [],
          settings: {
            openRouterModel: "google/gemini-3.1-flash-lite",
            transcriptionLanguage: "vi",
          },
        },
      })
    );

    await useMeetingStore.persist.rehydrate();

    expect(useMeetingStore.getState().recordingTranscribedSec).toBe(0);
  });
});

describe("Preferred input device", () => {
  beforeEach(() => {
    localStorage.clear();
    useMeetingStore.getState().setPreferredInputDeviceId(null);
  });

  it("is persisted and restored after a reload", async () => {
    useMeetingStore.getState().setPreferredInputDeviceId("coreaudio:usb-mic");
    const persisted = localStorage.getItem(STORAGE_KEY) ?? "";
    expect(JSON.parse(persisted).state.preferredInputDeviceId).toBe(
      "coreaudio:usb-mic"
    );

    useMeetingStore.getState().setPreferredInputDeviceId(null);
    localStorage.setItem(STORAGE_KEY, persisted);
    await useMeetingStore.persist.rehydrate();

    expect(useMeetingStore.getState().preferredInputDeviceId).toBe(
      "coreaudio:usb-mic"
    );
  });

  it("defaults to null for state saved before the device choice existed", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: {
          meetings: [],
          selectedMeetingId: "",
          calendarEvents: [],
          settings: {
            openRouterModel: "google/gemini-3.1-flash-lite",
            transcriptionLanguage: "vi",
          },
          recordingTranscribedSec: 0,
        },
      })
    );

    await useMeetingStore.persist.rehydrate();

    expect(useMeetingStore.getState().preferredInputDeviceId).toBeNull();
  });
});

describe("Call detection announcement", () => {
  beforeEach(() => {
    localStorage.clear();
    useMeetingStore.setState({ hasAnnouncedCallDetection: false });
  });

  it("starts unannounced and is marked once announced", () => {
    expect(useMeetingStore.getState().hasAnnouncedCallDetection).toBe(false);

    useMeetingStore.getState().markCallDetectionAnnounced();

    expect(useMeetingStore.getState().hasAnnouncedCallDetection).toBe(true);
  });

  it("is persisted and restored after a reload", async () => {
    useMeetingStore.getState().markCallDetectionAnnounced();
    const persisted = localStorage.getItem(STORAGE_KEY) ?? "";
    expect(JSON.parse(persisted).state.hasAnnouncedCallDetection).toBe(true);

    useMeetingStore.setState({ hasAnnouncedCallDetection: false });
    localStorage.setItem(STORAGE_KEY, persisted);
    await useMeetingStore.persist.rehydrate();

    expect(useMeetingStore.getState().hasAnnouncedCallDetection).toBe(true);
  });

  it("defaults to false for state saved before the announcement existed", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        state: {
          meetings: [],
          selectedMeetingId: "",
          calendarEvents: [],
          settings: {
            openRouterModel: "google/gemini-3.1-flash-lite",
            transcriptionLanguage: "vi",
            callDetectionEnabled: true,
          },
          recordingTranscribedSec: 0,
          preferredInputDeviceId: null,
        },
      })
    );

    await useMeetingStore.persist.rehydrate();

    expect(useMeetingStore.getState().hasAnnouncedCallDetection).toBe(false);
  });

  it("never persists the OpenRouter key alongside the flag", () => {
    useMeetingStore.setState({ openRouterKey: "sk-or-v1-secret-value" });
    useMeetingStore.getState().markCallDetectionAnnounced();

    const persisted = localStorage.getItem(STORAGE_KEY) ?? "";
    expect(JSON.parse(persisted).state).not.toHaveProperty("openRouterKey");
    expect(persisted).not.toContain("sk-or-v1-secret");
  });
});

describe("Call detection setting", () => {
  const SAVED_SETTINGS = {
    openRouterModel: "custom/model",
    transcriptionLanguage: "en",
  };

  function rehydrateFrom(version: number, settings: object) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version,
        state: {
          meetings: [],
          selectedMeetingId: "",
          calendarEvents: [],
          settings,
        },
      })
    );
    return useMeetingStore.persist.rehydrate();
  }

  beforeEach(() => {
    localStorage.clear();
    useMeetingStore.getState().updateSettings({ callDetectionEnabled: true });
  });

  it("turns on for saved settings that predate it without losing the saved ones", async () => {
    await rehydrateFrom(1, SAVED_SETTINGS);

    expect(useMeetingStore.getState().settings).toMatchObject({
      ...SAVED_SETTINGS,
      callDetectionEnabled: true,
    });
  });

  it("is persisted and restored when switched off", async () => {
    useMeetingStore.getState().updateSettings({ callDetectionEnabled: false });
    const persisted = localStorage.getItem(STORAGE_KEY) ?? "";
    expect(JSON.parse(persisted).state.settings.callDetectionEnabled).toBe(
      false
    );

    useMeetingStore.getState().updateSettings({ callDetectionEnabled: true });
    localStorage.setItem(STORAGE_KEY, persisted);
    await useMeetingStore.persist.rehydrate();

    expect(useMeetingStore.getState().settings.callDetectionEnabled).toBe(
      false
    );
  });

  it("never persists the OpenRouter key", () => {
    useMeetingStore.setState({ openRouterKey: "sk-or-v1-secret-value" });
    useMeetingStore.getState().updateSettings({ callDetectionEnabled: true });

    expect(localStorage.getItem(STORAGE_KEY)).not.toContain("sk-or-v1-secret");
  });
});

describe("System audio capture settings", () => {
  const LEGACY_STATE = {
    version: 1,
    state: {
      meetings: [],
      selectedMeetingId: "",
      calendarEvents: [],
      settings: {
        openRouterModel: "google/gemini-3.1-flash-lite",
        transcriptionLanguage: "vi",
      },
      recordingTranscribedSec: 0,
      preferredInputDeviceId: null,
    },
  };

  beforeEach(() => {
    localStorage.clear();
    useMeetingStore.getState().setIncludeSystemAudio(false);
    useMeetingStore.getState().setRecordingSystemTranscribedSec(0);
  });

  it("persists the include-system-audio choice across a reload", async () => {
    useMeetingStore.getState().setIncludeSystemAudio(true);
    const persisted = localStorage.getItem(STORAGE_KEY) ?? "";
    expect(JSON.parse(persisted).state.includeSystemAudio).toBe(true);

    useMeetingStore.getState().setIncludeSystemAudio(false);
    localStorage.setItem(STORAGE_KEY, persisted);
    await useMeetingStore.persist.rehydrate();

    expect(useMeetingStore.getState().includeSystemAudio).toBe(true);
  });

  it("persists the system track offset next to the mic offset", async () => {
    useMeetingStore.getState().setRecordingTranscribedSec(95);
    useMeetingStore.getState().setRecordingSystemTranscribedSec(40);
    const persisted = localStorage.getItem(STORAGE_KEY) ?? "";
    expect(JSON.parse(persisted).state).toMatchObject({
      recordingTranscribedSec: 95,
      recordingSystemTranscribedSec: 40,
    });

    useMeetingStore.getState().setRecordingTranscribedSec(0);
    useMeetingStore.getState().setRecordingSystemTranscribedSec(0);
    localStorage.setItem(STORAGE_KEY, persisted);
    await useMeetingStore.persist.rehydrate();

    expect(useMeetingStore.getState().recordingTranscribedSec).toBe(95);
    expect(useMeetingStore.getState().recordingSystemTranscribedSec).toBe(40);
  });

  it("keeps the saved recording fields when an older state version migrates", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: {
          ...LEGACY_STATE.state,
          preferredInputDeviceId: "coreaudio:usb-mic",
          includeSystemAudio: true,
          recordingTranscribedSec: 95,
          recordingSystemTranscribedSec: 40,
        },
      })
    );

    await useMeetingStore.persist.rehydrate();

    expect(useMeetingStore.getState()).toMatchObject({
      preferredInputDeviceId: "coreaudio:usb-mic",
      includeSystemAudio: true,
      recordingTranscribedSec: 95,
      recordingSystemTranscribedSec: 40,
    });
  });

  it("defaults to off and zero for state saved before system audio existed", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(LEGACY_STATE));

    await useMeetingStore.persist.rehydrate();

    expect(useMeetingStore.getState().includeSystemAudio).toBe(false);
    expect(useMeetingStore.getState().recordingSystemTranscribedSec).toBe(0);
  });
});

describe("Transcript segment ordering and clearing", () => {
  beforeEach(() => {
    localStorage.clear();
    useMeetingStore.setState({ meetings: [], selectedMeetingId: "" });
  });

  it("keeps segments sorted by startMs when mic_user and system_remote arrive out of order", () => {
    const { createMeetingSession, appendTranscriptSegment } =
      useMeetingStore.getState();
    const meeting = createMeetingSession({ ...SESSION_PARAMS, locale: "en" });

    appendTranscriptSegment(meeting.id, {
      id: "seg-mic-late",
      meetingId: meeting.id,
      speakerId: "spk_user_me",
      speakerName: "You (Mic)",
      channel: "mic_user",
      text: "Third utterance",
      startMs: 12000,
      endMs: 15000,
      confidence: 0.95,
    });
    appendTranscriptSegment(meeting.id, {
      id: "seg-sys-early",
      meetingId: meeting.id,
      speakerId: "spk_remote_1",
      speakerName: "Speaker 1",
      channel: "system_remote",
      text: "First utterance",
      startMs: 4000,
      endMs: 8000,
      confidence: 0.95,
    });
    appendTranscriptSegment(meeting.id, {
      id: "seg-mic-mid",
      meetingId: meeting.id,
      speakerId: "spk_user_me",
      speakerName: "You (Mic)",
      channel: "mic_user",
      text: "Second utterance",
      startMs: 9000,
      endMs: 11000,
      confidence: 0.95,
    });

    const stored = useMeetingStore
      .getState()
      .meetings.find((m) => m.id === meeting.id);
    expect(stored?.segments.map((s) => [s.id, s.channel, s.startMs])).toEqual([
      ["seg-sys-early", "system_remote", 4000],
      ["seg-mic-mid", "mic_user", 9000],
      ["seg-mic-late", "mic_user", 12000],
    ]);
  });

  it("clears transcript segments only for the target meeting", () => {
    const {
      createMeetingSession,
      appendTranscriptSegment,
      clearTranscriptSegments,
    } = useMeetingStore.getState();
    const target = createMeetingSession({
      ...SESSION_PARAMS,
      id: "mtg-target",
      locale: "en",
    });
    const other = createMeetingSession({
      ...SESSION_PARAMS,
      id: "mtg-other",
      locale: "en",
    });

    appendTranscriptSegment(target.id, {
      id: "seg-target",
      meetingId: target.id,
      speakerId: "spk_user_me",
      speakerName: "You (Mic)",
      channel: "mic_user",
      text: "Legacy mixed segment",
      startMs: 1000,
      endMs: 3000,
      confidence: 0.95,
    });
    appendTranscriptSegment(other.id, {
      id: "seg-other",
      meetingId: other.id,
      speakerId: "spk_user_me",
      speakerName: "You (Mic)",
      channel: "mic_user",
      text: "Keep me",
      startMs: 1000,
      endMs: 3000,
      confidence: 0.95,
    });

    clearTranscriptSegments(target.id);

    const meetings = useMeetingStore.getState().meetings;
    expect(meetings.find((m) => m.id === target.id)?.segments).toEqual([]);
    expect(
      meetings.find((m) => m.id === other.id)?.segments.map((s) => s.id)
    ).toEqual(["seg-other"]);
  });
});

