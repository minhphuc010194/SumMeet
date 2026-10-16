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
