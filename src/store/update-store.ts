import { create } from "zustand";
import type { Update } from "@tauri-apps/plugin-updater";
import {
  checkForUpdate,
  getAppVersion,
  installUpdate,
} from "@/services/updater";

let isLoadingAppVersion = false;

interface UpdateStoreState {
  update: Update | null;
  isDialogOpen: boolean;
  status: "idle" | "installing" | "failed";
  progress: number | null;
  dismissedVersion: string | null;
  checkPanel: "closed" | "checking" | "latest" | "failed";
  appVersion: string | null;
  checkForUpdate: () => Promise<void>;
  checkForUpdateManually: () => Promise<void>;
  closeCheckPanel: () => void;
  loadAppVersion: () => Promise<void>;
  installUpdate: () => Promise<void>;
  openDialog: () => void;
  dismiss: () => void;
}

export const useUpdateStore = create<UpdateStoreState>()((set, get) => ({
  update: null,
  isDialogOpen: false,
  status: "idle",
  progress: null,
  dismissedVersion: null,
  checkPanel: "closed",
  appVersion: null,
  checkForUpdate: async () => {
    if (get().status !== "idle") return;
    const result = await checkForUpdate();
    const found = result.data;
    if (!found) return;
    if (get().status !== "idle") return;
    const isDismissed = found.version === get().dismissedVersion;
    set((state) => ({
      update: found,
      progress: null,
      isDialogOpen: state.isDialogOpen || !isDismissed,
    }));
  },
  checkForUpdateManually: async () => {
    const isBusy = get().status !== "idle" || get().checkPanel === "checking";
    if (isBusy) return;
    set({ checkPanel: "checking" });
    const result = await checkForUpdate();
    if (get().status !== "idle") {
      set({ checkPanel: "closed" });
      return;
    }
    const found = result.data;
    if (found) set({ update: found, progress: null });
    if (get().checkPanel !== "checking") return;
    if (!result.success) {
      set({ checkPanel: "failed" });
      return;
    }
    if (!found) {
      set({ checkPanel: "latest" });
      return;
    }
    set({ isDialogOpen: true, checkPanel: "closed" });
  },
  closeCheckPanel: () => set({ checkPanel: "closed" }),
  loadAppVersion: async () => {
    if (get().appVersion !== null || isLoadingAppVersion) return;
    isLoadingAppVersion = true;
    const result = await getAppVersion();
    isLoadingAppVersion = false;
    if (result.success) set({ appVersion: result.data ?? null });
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
  openDialog: () => set({ isDialogOpen: true }),
  dismiss: () => {
    const { update, status } = get();
    if (!update || status === "installing") return;
    set({
      isDialogOpen: false,
      status: "idle",
      dismissedVersion: update.version,
    });
  },
}));
