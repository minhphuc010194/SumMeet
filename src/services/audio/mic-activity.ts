import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

interface MicActivityPayload {
  otherAppActive: boolean;
}

export async function subscribeMicActivity(
  onChange: (otherAppActive: boolean) => void
): Promise<() => void> {
  try {
    return await listen<MicActivityPayload>("mic-activity", (event) =>
      onChange(event.payload.otherAppActive)
    );
  } catch (error) {
    console.error("[MicActivity] Operation failed:", {
      context: "listen",
      error: error instanceof Error ? error.message : String(error),
    });
    return () => {};
  }
}

export async function requestCallAttention(notification: {
  title: string;
  body: string;
}): Promise<void> {
  try {
    await getCurrentWindow().requestUserAttention(
      UserAttentionType.Informational
    );
  } catch (error) {
    console.error("[MicActivity] Operation failed:", {
      context: "requestUserAttention",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const hasPermission =
      (await isPermissionGranted()) || (await requestPermission()) === "granted";
    if (!hasPermission) throw new Error("notification_permission_denied");
    sendNotification(notification);
  } catch (error) {
    console.error("[MicActivity] Operation failed:", {
      context: "sendNotification",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
