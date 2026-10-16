import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";

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

export async function requestCallAttention(): Promise<void> {
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
}
