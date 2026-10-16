export type SupportedLocale = "vi" | "en";

export type AudioSourceChannel = "mic_user" | "system_remote";

export type MeetingStatus = "recording" | "processing" | "completed" | "error";

export type SummaryTemplateId = "general" | "sales" | "standup" | "interview";

export type OpenRouterAudioFormat =
  | "wav"
  | "mp3"
  | "aac"
  | "m4a"
  | "ogg"
  | "flac";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  stack?: string;
}

export interface AudioDeviceItem {
  id: string;
  name: string;
  kind: "audioinput" | "audiooutput";
  isDefault: boolean;
  isHeadphoneOrAirPods: boolean;
  sampleRate: number;
}

export interface DualStreamStatus {
  isRecording: boolean;
  isPaused: boolean;
  durationSeconds: number;
  activeInputDeviceName: string;
  activeOutputDeviceName: string;
  isHeadphoneOrAirPodsActive: boolean;
  inputSampleRate: number;
  systemSampleRate: number;
  echoGateEnabled: boolean;
  micLevel: number;
  systemLevel: number;
  systemAudioConnected: boolean;
  hotSwapCount: number;
  lastHotSwapMessage: string | null;
}

export interface TranscriptSegment {
  id: string;
  meetingId: string;
  speakerId: string;
  speakerName: string;
  channel: AudioSourceChannel;
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

export interface ActionItem {
  id: string;
  task: string;
  assignee: string;
  dueDate: string;
  completed: boolean;
  timestampMs?: number;
}

export interface OutlineSection {
  id: string;
  title: string;
  timestampMs: number;
  bullets: string[];
}

export interface MeetingSummary {
  meetingId: string;
  templateId: SummaryTemplateId;
  overview: string;
  actionItems: ActionItem[];
  keyDecisions: string[];
  outline: OutlineSection[];
  keywords: string[];
  sentiment: "positive" | "neutral" | "focused";
  providerUsed: string;
  promptVersion: string;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  meetingId: string;
  role: "user" | "assistant";
  content: string;
  citations?: Array<{
    segmentId: string;
    speakerName: string;
    timestampMs: number;
    snippet: string;
  }>;
  providerUsed?: string;
  createdAt: string;
}

export interface CalendarMeetingEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  platform: "Google Meet" | "Zoom" | "MS Teams" | "In-Person / System";
  meetingUrl?: string;
  participants: string[];
}

export interface Meeting {
  id: string;
  title: string;
  createdAt: string;
  durationSeconds: number;
  status: MeetingStatus;
  audioDeviceUsed: string;
  isHeadphoneSession: boolean;
  audioDataUrl?: string;
  participants: string[];
  segments: TranscriptSegment[];
  summary: MeetingSummary;
  chatMessages: ChatMessage[];
  calendarEventId?: string;
}

export interface AIProviderSettings {
  openRouterModel: string;
  transcriptionLanguage: "vi" | "en" | "auto";
  callDetectionEnabled: boolean;
}
