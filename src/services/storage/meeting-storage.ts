import { invoke } from "@tauri-apps/api/core";
import type { StateStorage } from "zustand/middleware";

export function isTauriRuntime(): boolean {
  return Boolean((globalThis as { isTauri?: unknown }).isTauri);
}

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return null;
  }
  return window.localStorage;
}

function safeLocalStorageGet(name: string): string | null {
  try {
    return getLocalStorage()?.getItem(name) ?? null;
  } catch (error) {
    console.error("[MeetingStorage] Operation failed:", {
      context: "localStorage.getItem",
      name,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function safeLocalStorageSet(name: string, value: string): void {
  try {
    getLocalStorage()?.setItem(name, value);
  } catch (error) {
    console.error("[MeetingStorage] Operation failed:", {
      context: "localStorage.setItem",
      name,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function safeLocalStorageRemove(name: string): void {
  try {
    getLocalStorage()?.removeItem(name);
  } catch (error) {
    console.error("[MeetingStorage] Operation failed:", {
      context: "localStorage.removeItem",
      name,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function createMeetingStorage(options?: {
  isWriteAllowed?: () => boolean;
}): StateStorage {
  let pendingPayload: string | null = null;
  let clearQueued = false;
  let writeInFlight: Promise<void> | null = null;

  const flushWriteQueue = (): Promise<void> => {
    if (writeInFlight) {
      return writeInFlight;
    }

    writeInFlight = (async () => {
      await Promise.resolve();
      while (pendingPayload !== null || clearQueued) {
        if (pendingPayload !== null) {
          const payload = pendingPayload;
          pendingPayload = null;
          try {
            await invoke("write_meeting_store", { payload });
          } catch (error) {
            console.error("[MeetingStorage] Operation failed:", {
              context: "write_meeting_store",
              error: error instanceof Error ? error.message : String(error),
            });
          }
        } else if (clearQueued) {
          clearQueued = false;
          try {
            await invoke("clear_meeting_store");
          } catch (error) {
            console.error("[MeetingStorage] Operation failed:", {
              context: "clear_meeting_store",
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    })().finally(() => {
      writeInFlight = null;
      if (pendingPayload !== null || clearQueued) {
        void flushWriteQueue();
      }
    });

    return writeInFlight;
  };

  return {
    getItem: (name) => {
      if (!isTauriRuntime()) {
        return safeLocalStorageGet(name);
      }

      return (async () => {
        try {
          const diskValue = await invoke<string | null>("read_meeting_store");
          if (diskValue !== null) {
            safeLocalStorageRemove(name);
            return diskValue;
          }

          const legacy = safeLocalStorageGet(name);
          if (legacy === null) {
            return null;
          }

          try {
            await invoke("write_meeting_store", { payload: legacy });
            safeLocalStorageRemove(name);
          } catch (error) {
            console.error("[MeetingStorage] Operation failed:", {
              context: "migrate_legacy_store",
              error: error instanceof Error ? error.message : String(error),
            });
          }
          return legacy;
        } catch (error) {
          console.error("[MeetingStorage] Operation failed:", {
            context: "read_meeting_store",
            error: error instanceof Error ? error.message : String(error),
          });
          return safeLocalStorageGet(name);
        }
      })();
    },

    setItem: (name, value) => {
      if (!isTauriRuntime()) {
        safeLocalStorageSet(name, value);
        return;
      }
      if (options?.isWriteAllowed && !options.isWriteAllowed()) {
        return;
      }
      pendingPayload = value;
      clearQueued = false;
      return flushWriteQueue();
    },

    removeItem: (name) => {
      safeLocalStorageRemove(name);
      if (!isTauriRuntime()) {
        return;
      }
      pendingPayload = null;
      clearQueued = true;
      return flushWriteQueue();
    },
  };
}
