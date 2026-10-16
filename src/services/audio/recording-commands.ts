import { invoke } from "@tauri-apps/api/core";
import type { ApiResponse, SupportedLocale } from "@/types/meeting";
import { getDictionary } from "@/i18n/dictionaries";

export interface RecordingFile {
  meetingId: string;
  fileName: string;
  wavPath: string;
  sizeBytes: number;
  createdAtMs: number;
  durationSec: number;
}

export interface RecordingStart {
  meetingId: string;
  wavPath: string;
  startedAtMs: number;
}

export interface ActiveRecordingStatus extends RecordingStart {
  elapsedSec: number;
  level: number;
}

export interface RecordingsListing {
  recordingsDir: string;
  files: RecordingFile[];
}

async function invokeRecordingCommand<T>(params: {
  command: string;
  locale: SupportedLocale;
  args?: Record<string, unknown>;
}): Promise<ApiResponse<T>> {
  try {
    return {
      success: true,
      data: await invoke<T>(params.command, params.args),
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    console.error("[RecordingCommands] Command failed:", {
      command: params.command,
      error: code,
    });
    const errors = getDictionary(params.locale).errors;
    if (code === "no_input_device") {
      return { success: false, error: errors.noInputDevice };
    }
    if (code === "recording_active") {
      return { success: false, error: errors.recordingActive };
    }
    if (code === "input_device_unavailable") {
      return { success: false, error: errors.inputDeviceUnavailable };
    }
    return { success: false, error: errors.recordingFailed };
  }
}

export function startMicRecording(params: {
  meetingId: string;
  inputDeviceId: string | null;
  locale: SupportedLocale;
}): Promise<ApiResponse<RecordingStart>> {
  return invokeRecordingCommand({
    command: "start_mic_recording",
    locale: params.locale,
    args: {
      meetingId: params.meetingId,
      options: { inputDeviceId: params.inputDeviceId },
    },
  });
}

export async function getActiveRecording(
  locale: SupportedLocale
): Promise<ApiResponse<ActiveRecordingStatus | null>> {
  const status = await invokeRecordingCommand<{
    active: ActiveRecordingStatus | null;
  }>({ command: "get_recording_status", locale });
  return status.success
    ? { success: true, data: status.data?.active ?? null }
    : { success: false, error: status.error };
}

export function stopMicRecording(
  locale: SupportedLocale
): Promise<ApiResponse<RecordingFile>> {
  return invokeRecordingCommand({ command: "stop_mic_recording", locale });
}

export function readRecordingSlice(params: {
  meetingId: string;
  startSec: number;
  maxSec: number;
  locale: SupportedLocale;
}): Promise<ApiResponse<string>> {
  return invokeRecordingCommand({
    command: "read_recording_slice",
    locale: params.locale,
    args: {
      meetingId: params.meetingId,
      startSec: params.startSec,
      maxSec: params.maxSec,
    },
  });
}

export function listRecordings(
  locale: SupportedLocale
): Promise<ApiResponse<RecordingsListing>> {
  return invokeRecordingCommand({ command: "list_recordings", locale });
}

export function deleteRecording(params: {
  meetingId: string;
  locale: SupportedLocale;
}): Promise<ApiResponse<null>> {
  return invokeRecordingCommand({
    command: "delete_recording",
    locale: params.locale,
    args: { meetingId: params.meetingId },
  });
}

export function deleteAllRecordings(
  locale: SupportedLocale
): Promise<ApiResponse<null>> {
  return invokeRecordingCommand({ command: "delete_all_recordings", locale });
}
