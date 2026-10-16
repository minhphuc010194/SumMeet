import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";
import {
  isPermissionGranted,
  onAction,
  registerActionTypes,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

interface MicActivityPayload {
  otherAppActive: boolean;
}

const CALL_ACTION_TYPE_ID = "call-detected";
const RECORD_ACTION_ID = "record";

function logFailure(context: string, error: unknown) {
  console.error("[MicActivity] Operation failed:", {
    context,
    error: error instanceof Error ? error.message : String(error),
  });
}

export async function subscribeMicActivity(
  onChange: (otherAppActive: boolean) => void
): Promise<() => void> {
  try {
    return await listen<MicActivityPayload>("mic-activity", (event) =>
      onChange(event.payload.otherAppActive)
    );
  } catch (error) {
    logFailure("listen", error);
    return () => {};
  }
}

export async function subscribeCallActions(options: {
  recordTitle: string;
  onRecord: () => void;
}): Promise<() => void> {
  try {
    await registerActionTypes([
      {
        id: CALL_ACTION_TYPE_ID,
        actions: [{ id: RECORD_ACTION_ID, title: options.recordTitle }],
      },
    ]);
  } catch (error) {
    logFailure("registerActionTypes", error);
  }

  try {
    const listener = await onAction(async (event) => {
      try {
        const mainWindow = getCurrentWindow();
        await mainWindow.show();
        await mainWindow.unminimize();
        await mainWindow.setFocus();
      } catch (error) {
        logFailure("focusWindow", error);
      }
      if (event.actionId === RECORD_ACTION_ID) options.onRecord();
    });
    return () => {
      listener.unregister().catch((error) => logFailure("unregister", error));
    };
  } catch (error) {
    logFailure("onAction", error);
    return () => {};
  }
}

export async function announceCallDetection(notification: {
  title: string;
  body: string;
}): Promise<void> {
  try {
    sendNotification(notification);
  } catch (error) {
    logFailure("announceCallDetection", error);
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
    logFailure("requestUserAttention", error);
  }

  try {
    const hasPermission =
      (await isPermissionGranted()) || (await requestPermission()) === "granted";
    if (!hasPermission) throw new Error("notification_permission_denied");
    sendNotification({ ...notification, actionTypeId: CALL_ACTION_TYPE_ID });
  } catch (error) {
    logFailure("sendNotification", error);
  }
}
