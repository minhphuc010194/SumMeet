import { isTauri } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import type { ApiResponse } from "@/types/meeting";

export async function getAutostartEnabled(): Promise<ApiResponse<boolean>> {
  if (!isTauri()) {
    return { success: true, data: false };
  }
  try {
    return { success: true, data: await isEnabled() };
  } catch (error) {
    console.error("[Autostart] Status read failed:", { error });
    return { success: false, error: String(error) };
  }
}

export async function setAutostartEnabled(
  enabled: boolean
): Promise<ApiResponse<null>> {
  if (!isTauri()) {
    return { success: true, data: null };
  }
  try {
    await (enabled ? enable() : disable());
    return { success: true, data: null };
  } catch (error) {
    console.error("[Autostart] Update failed:", { enabled, error });
    return { success: false, error: String(error) };
  }
}
