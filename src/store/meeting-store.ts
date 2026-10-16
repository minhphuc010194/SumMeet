import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AIProviderSettings,
  ApiResponse,
  CalendarMeetingEvent,
  ChatMessage,
  Meeting,
  MeetingSummary,
  SummaryTemplateId,
  SupportedLocale,
  TranscriptSegment,
} from "@/types/meeting";
import { getDictionary } from "@/i18n/dictionaries";
import {
  checkOpenRouterKey,
  deleteStoredOpenRouterKey,
  getStoredOpenRouterKey,
  storeOpenRouterKey,
} from "@/services/ai/openrouter-key";
import { DEFAULT_OPENROUTER_MODEL } from "@/services/ai/provider-registry";

const INITIAL_MEETINGS: Meeting[] = [];

const INITIAL_CALENDAR_EVENTS: CalendarMeetingEvent[] = [];

const DEFAULT_SETTINGS: AIProviderSettings = {
  openRouterModel: DEFAULT_OPENROUTER_MODEL,
  transcriptionLanguage: "vi",
  callDetectionEnabled: true,
};

export type OpenRouterKeyStatus = "loading" | "missing" | "ready";

type PersistedMeetingState = Pick<
  MeetingStoreState,
  | "meetings"
  | "selectedMeetingId"
  | "calendarEvents"
  | "settings"
  | "recordingTranscribedSec"
  | "recordingSystemTranscribedSec"
  | "preferredInputDeviceId"
  | "includeSystemAudio"
  | "hasAnnouncedCallDetection"
>;

interface MeetingStoreState {
  meetings: Meeting[];
  selectedMeetingId: string;
  calendarEvents: CalendarMeetingEvent[];
  settings: AIProviderSettings;
  openRouterKey: string;
  openRouterKeyStatus: OpenRouterKeyStatus;
  currentAudioTimeMs: number;
  recordingTranscribedSec: number;
  recordingSystemTranscribedSec: number;
  preferredInputDeviceId: string | null;
  includeSystemAudio: boolean;
  hasAnnouncedCallDetection: boolean;
  selectMeeting: (meetingId: string) => void;
  setCurrentAudioTimeMs: (ms: number) => void;
  setRecordingTranscribedSec: (sec: number) => void;
  setRecordingSystemTranscribedSec: (sec: number) => void;
  setPreferredInputDeviceId: (id: string | null) => void;
  setIncludeSystemAudio: (include: boolean) => void;
  markCallDetectionAnnounced: () => void;
  createMeetingSession: (params: {
    title: string;
    audioDeviceUsed: string;
    isHeadphoneSession: boolean;
    locale: SupportedLocale;
    participants?: string[];
    calendarEventId?: string;
  }) => Meeting;
  deleteMeeting: (meetingId: string) => void;
  clearAllMeetings: () => void;
  appendTranscriptSegment: (meetingId: string, segment: TranscriptSegment) => void;
  renameSpeaker: (meetingId: string, speakerId: string, newName: string) => void;
  toggleActionItem: (meetingId: string, actionItemId: string) => void;
  updateMeetingSummary: (meetingId: string, summary: MeetingSummary) => void;
  completeMeetingRecording: (
    meetingId: string,
    durationSeconds: number,
    summary?: MeetingSummary,
    audioDataUrl?: string
  ) => void;
  appendChatMessage: (meetingId: string, message: ChatMessage) => void;
  clearChatHistory: (meetingId: string) => void;
  updateSettings: (partial: Partial<AIProviderSettings>) => void;
  loadOpenRouterKey: () => Promise<void>;
  saveOpenRouterKey: (params: {
    key: string;
    locale: SupportedLocale;
  }) => Promise<ApiResponse<null>>;
  removeOpenRouterKey: (locale: SupportedLocale) => Promise<ApiResponse<null>>;
  addCalendarEvent: (event: CalendarMeetingEvent) => void;
}

export const useMeetingStore = create<MeetingStoreState>()(
  persist(
    (set) => ({
      meetings: INITIAL_MEETINGS,
      selectedMeetingId: "",
      calendarEvents: INITIAL_CALENDAR_EVENTS,
      settings: DEFAULT_SETTINGS,
      openRouterKey: "",
      openRouterKeyStatus: "loading",
      currentAudioTimeMs: 0,
      recordingTranscribedSec: 0,
      recordingSystemTranscribedSec: 0,
      preferredInputDeviceId: null,
      includeSystemAudio: false,
      hasAnnouncedCallDetection: false,

      selectMeeting: (meetingId) =>
        set({ selectedMeetingId: meetingId, currentAudioTimeMs: 0 }),

      setCurrentAudioTimeMs: (ms) => set({ currentAudioTimeMs: ms }),

      setRecordingTranscribedSec: (sec) => set({ recordingTranscribedSec: sec }),

      setRecordingSystemTranscribedSec: (sec) =>
        set({ recordingSystemTranscribedSec: sec }),

      setPreferredInputDeviceId: (id) => set({ preferredInputDeviceId: id }),

      setIncludeSystemAudio: (include) => set({ includeSystemAudio: include }),

      markCallDetectionAnnounced: () => set({ hasAnnouncedCallDetection: true }),

      createMeetingSession: ({
        title,
        audioDeviceUsed,
        isHeadphoneSession,
        locale,
        participants,
        calendarEventId,
      }) => {
        const dict = getDictionary(locale);
        const id = `mtg-${Date.now()}`;
        const now = new Date().toISOString();
        const newMeeting: Meeting = {
          id,
          title,
          createdAt: now,
          durationSeconds: 0,
          status: "recording",
          audioDeviceUsed,
          isHeadphoneSession,
          participants: participants ?? [
            dict.transcript.defaultMicSpeaker,
            dict.session.systemAudioParticipant,
          ],
          calendarEventId,
          segments: [],
          summary: {
            meetingId: id,
            templateId: "general" as SummaryTemplateId,
            overview: dict.session.liveOverview,
            actionItems: [],
            keyDecisions: [],
            outline: [],
            keywords: [
              dict.session.liveKeyword,
              isHeadphoneSession
                ? dict.session.headphoneKeyword
                : dict.session.speakerKeyword,
            ],
            sentiment: "focused",
            providerUsed: dict.session.liveProvider,
            promptVersion: "v1.2.0",
            updatedAt: now,
          },
          chatMessages: [],
        };

        set((state) => ({
          meetings: [newMeeting, ...state.meetings],
          selectedMeetingId: id,
          currentAudioTimeMs: 0,
        }));

        return newMeeting;
      },

      deleteMeeting: (meetingId) =>
        set((state) => {
          const remaining = state.meetings.filter((m) => m.id !== meetingId);
          const nextSelected =
            state.selectedMeetingId === meetingId
              ? remaining[0]?.id ?? ""
              : state.selectedMeetingId;
          return {
            meetings: remaining,
            selectedMeetingId: nextSelected,
            currentAudioTimeMs: 0,
          };
        }),

      clearAllMeetings: () =>
        set({
          meetings: [],
          selectedMeetingId: "",
          currentAudioTimeMs: 0,
        }),

      appendTranscriptSegment: (meetingId, segment) =>
        set((state) => ({
          meetings: state.meetings.map((m) => {
            if (m.id !== meetingId) return m;
            const participantsSet = new Set([
              ...m.participants,
              segment.speakerName,
            ]);
            return {
              ...m,
              participants: Array.from(participantsSet),
              segments: [...m.segments, segment],
            };
          }),
        })),

      renameSpeaker: (meetingId, speakerId, newName) => {
        const trimmed = newName.trim();
        if (!trimmed) return;
        set((state) => ({
          meetings: state.meetings.map((m) => {
            if (m.id !== meetingId) return m;
            const updatedSegments = m.segments.map((seg) =>
              seg.speakerId === speakerId
                ? { ...seg, speakerName: trimmed }
                : seg
            );
            const uniqueSpeakers = Array.from(
              new Set(updatedSegments.map((s) => s.speakerName))
            );
            return {
              ...m,
              participants: uniqueSpeakers,
              segments: updatedSegments,
            };
          }),
        }));
      },

      toggleActionItem: (meetingId, actionItemId) =>
        set((state) => ({
          meetings: state.meetings.map((m) => {
            if (m.id !== meetingId) return m;
            return {
              ...m,
              summary: {
                ...m.summary,
                actionItems: m.summary.actionItems.map((item) =>
                  item.id === actionItemId
                    ? { ...item, completed: !item.completed }
                    : item
                ),
              },
            };
          }),
        })),

      updateMeetingSummary: (meetingId, summary) =>
        set((state) => ({
          meetings: state.meetings.map((m) =>
            m.id === meetingId
              ? { ...m, status: "completed", summary }
              : m
          ),
        })),

      completeMeetingRecording: (
        meetingId,
        durationSeconds,
        summary,
        audioDataUrl
      ) =>
        set((state) => ({
          meetings: state.meetings.map((m) =>
            m.id === meetingId
              ? {
                  ...m,
                  status: "completed",
                  durationSeconds: Math.max(
                    durationSeconds,
                    m.durationSeconds,
                    1
                  ),
                  summary: summary ?? m.summary,
                  audioDataUrl: audioDataUrl ?? m.audioDataUrl,
                }
              : m
          ),
        })),

      appendChatMessage: (meetingId, message) =>
        set((state) => ({
          meetings: state.meetings.map((m) =>
            m.id === meetingId
              ? { ...m, chatMessages: [...m.chatMessages, message] }
              : m
          ),
        })),

      clearChatHistory: (meetingId) =>
        set((state) => ({
          meetings: state.meetings.map((m) =>
            m.id === meetingId ? { ...m, chatMessages: [] } : m
          ),
        })),

      updateSettings: (partial) =>
        set((state) => ({
          settings: { ...state.settings, ...partial },
        })),

      addCalendarEvent: (event) =>
        set((state) => ({
          calendarEvents: [event, ...state.calendarEvents],
        })),

      loadOpenRouterKey: async () => {
        const result = await getStoredOpenRouterKey();
        const key = result.data ?? "";
        set({
          openRouterKey: key,
          openRouterKeyStatus: key ? "ready" : "missing",
        });
      },

      saveOpenRouterKey: async ({ key, locale }) => {
        const apiKey = key.trim();
        if (!apiKey) {
          return { success: false, error: getDictionary(locale).errors.emptyKey };
        }

        const checked = await checkOpenRouterKey({ apiKey, locale });
        if (!checked.success) return checked;

        const stored = await storeOpenRouterKey({ apiKey, locale });
        if (!stored.success) return stored;

        set({ openRouterKey: apiKey, openRouterKeyStatus: "ready" });
        return { success: true };
      },

      removeOpenRouterKey: async (locale) => {
        const result = await deleteStoredOpenRouterKey(locale);
        if (result.success) {
          set({ openRouterKey: "", openRouterKeyStatus: "missing" });
        }
        return result;
      },
    }),
    {
      name: "summarize-bot-clean-v4",
      version: 2,
      migrate: (persisted, version) => {
        const previous = persisted as PersistedMeetingState;
        const keepsSavedSettings = version >= 1;
        return {
          ...previous,
          settings: {
            ...DEFAULT_SETTINGS,
            ...(keepsSavedSettings ? previous.settings : {}),
            transcriptionLanguage:
              previous.settings?.transcriptionLanguage ??
              DEFAULT_SETTINGS.transcriptionLanguage,
          },
        };
      },
      partialize: (state): PersistedMeetingState => ({
        meetings: state.meetings,
        selectedMeetingId: state.selectedMeetingId,
        calendarEvents: state.calendarEvents,
        settings: state.settings,
        recordingTranscribedSec: state.recordingTranscribedSec,
        recordingSystemTranscribedSec: state.recordingSystemTranscribedSec,
        preferredInputDeviceId: state.preferredInputDeviceId,
        includeSystemAudio: state.includeSystemAudio,
        hasAnnouncedCallDetection: state.hasAnnouncedCallDetection,
      }),
    }
  )
);
