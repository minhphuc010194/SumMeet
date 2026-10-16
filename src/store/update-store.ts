import { create } from "zustand";
import type { Update } from "@tauri-apps/plugin-updater";
import { checkForUpdate, installUpdate } from "@/services/updater";

interface UpdateStoreState {
  update: Update | null;
  status: "idle" | "installing" | "failed";
  progress: number | null;
  dismissedVersion: string | null;
  checkForUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  dismiss: () => void;
}

export const useUpdateStore = create<UpdateStoreState>()((set, get) => ({
  update: null,
  status: "idle",
  progress: null,
  dismissedVersion: null,
  checkForUpdate: async () => {
    if (get().status !== "idle") return;
    const result = await checkForUpdate();
    const found = result.data;
    if (!found) return;
    const isStillIdle = get().status === "idle";
    const isDismissed = found.version === get().dismissedVersion;
    if (!isStillIdle || isDismissed) return;
    set({ update: found, progress: null });
  },
  installUpdate: async () => {
    const { update } = get();
    if (!update) return;
    set({ status: "installing", progress: null });
    let totalBytes = 0;
    let downloadedBytes = 0;
    const result = await installUpdate({
      update,
      onEvent: (event) => {
        if (event.event === "Started") {
          totalBytes = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) {
            set({
              progress: Math.min(
                100,
                Math.round((downloadedBytes / totalBytes) * 100)
              ),
            });
          }
        } else {
          set({ progress: 100 });
        }
      },
    });
    if (!result.success) set({ status: "failed" });
  },
  dismiss: () => {
    const { update, status } = get();
    if (!update || status === "installing") return;
    set({ update: null, status: "idle", dismissedVersion: update.version });
  },
}));
