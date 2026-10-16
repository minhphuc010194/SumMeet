import { isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  check,
  type DownloadEvent,
  type Update,
} from "@tauri-apps/plugin-updater";
import type { ApiResponse } from "@/types/meeting";

export async function checkForUpdate(): Promise<ApiResponse<Update | null>> {
  if (!isTauri() || process.env.NODE_ENV !== "production") {
    return { success: true, data: null };
  }
  try {
    return { success: true, data: await check() };
  } catch (error) {
    console.error("[Updater] Check failed:", { error });
    return { success: false, error: String(error) };
  }
}

export async function installUpdate(params: {
  update: Update;
  onEvent: (event: DownloadEvent) => void;
}): Promise<ApiResponse<null>> {
  try {
    await params.update.downloadAndInstall(params.onEvent);
    await relaunch();
    return { success: true, data: null };
  } catch (error) {
    console.error("[Updater] Install failed:", { error });
    return { success: false, error: String(error) };
  }
}
