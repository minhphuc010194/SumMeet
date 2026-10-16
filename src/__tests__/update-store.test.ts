import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  check,
  type DownloadEvent,
  type Update,
} from "@tauri-apps/plugin-updater";
import { useUpdateStore } from "@/store/update-store";

vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));

const getVersionMock = vi.mocked(getVersion);
const isTauriMock = vi.mocked(isTauri);
const relaunchMock = vi.mocked(relaunch);
const checkMock = vi.mocked(check);

function fakeUpdate(
  version: string,
  downloadAndInstall: (
    onEvent: (event: DownloadEvent) => void
  ) => Promise<void> = async () => {}
) {
  return {
    version,
    body: `Notes for ${version}`,
    downloadAndInstall,
  } as unknown as Update;
}

describe("update store", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    isTauriMock.mockReset().mockReturnValue(true);
    getVersionMock.mockReset().mockResolvedValue("1.0.2");
    relaunchMock.mockReset().mockResolvedValue(undefined);
    checkMock.mockReset();
    useUpdateStore.setState({
      update: null,
      isDialogOpen: false,
      status: "idle",
      progress: null,
      dismissedVersion: null,
      checkPanel: "closed",
      appVersion: null,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("exposes the new version and notes when an update exists", async () => {
    checkMock.mockResolvedValue(fakeUpdate("1.1.0"));

    await useUpdateStore.getState().checkForUpdate();

    const state = useUpdateStore.getState();
    expect(state.update?.version).toBe("1.1.0");
    expect(state.update?.body).toBe("Notes for 1.1.0");
    expect(state.isDialogOpen).toBe(true);
    expect(state.status).toBe("idle");
  });

  it("shows nothing when no update exists", async () => {
    checkMock.mockResolvedValue(null);

    await useUpdateStore.getState().checkForUpdate();

    expect(useUpdateStore.getState().update).toBeNull();
    expect(useUpdateStore.getState().isDialogOpen).toBe(false);
  });

  it("shows nothing and logs when the check throws", async () => {
    const failure = new Error("404");
    checkMock.mockRejectedValue(failure);

    await useUpdateStore.getState().checkForUpdate();

    expect(useUpdateStore.getState().update).toBeNull();
    expect(console.error).toHaveBeenCalledWith("[Updater] Check failed:", {
      error: failure,
    });
  });

  it("keeps the found update and closes the dialog on dismiss", async () => {
    checkMock.mockResolvedValue(fakeUpdate("1.1.0"));
    await useUpdateStore.getState().checkForUpdate();

    useUpdateStore.getState().dismiss();

    const state = useUpdateStore.getState();
    expect(state.update?.version).toBe("1.1.0");
    expect(state.isDialogOpen).toBe(false);
    expect(state.dismissedVersion).toBe("1.1.0");
  });

  it("keeps a dismissed version closed but opens a newer one", async () => {
    checkMock.mockResolvedValue(fakeUpdate("1.1.0"));
    await useUpdateStore.getState().checkForUpdate();
    useUpdateStore.getState().dismiss();

    await useUpdateStore.getState().checkForUpdate();
    expect(useUpdateStore.getState().isDialogOpen).toBe(false);
    expect(useUpdateStore.getState().update?.version).toBe("1.1.0");

    checkMock.mockResolvedValue(fakeUpdate("1.2.0"));
    await useUpdateStore.getState().checkForUpdate();
    expect(useUpdateStore.getState().isDialogOpen).toBe(true);
    expect(useUpdateStore.getState().update?.version).toBe("1.2.0");
  });

  it("keeps a reopened dialog open when an automatic check finds the dismissed version again", async () => {
    checkMock.mockResolvedValue(fakeUpdate("1.1.0"));
    await useUpdateStore.getState().checkForUpdate();
    useUpdateStore.getState().dismiss();
    useUpdateStore.getState().openDialog();

    await useUpdateStore.getState().checkForUpdate();

    expect(useUpdateStore.getState().isDialogOpen).toBe(true);
  });

  it("opens the update dialog and closes the check panel on a manual check for a dismissed version", async () => {
    checkMock.mockResolvedValue(fakeUpdate("1.1.0"));
    await useUpdateStore.getState().checkForUpdate();
    useUpdateStore.getState().dismiss();

    await useUpdateStore.getState().checkForUpdateManually();

    const state = useUpdateStore.getState();
    expect(state.isDialogOpen).toBe(true);
    expect(state.checkPanel).toBe("closed");
    expect(state.update?.version).toBe("1.1.0");
  });

  it("shows the checking panel while a manual check runs, then the latest version", async () => {
    let resolveCheck: (update: Update | null) => void = () => {};
    checkMock.mockReturnValue(
      new Promise((resolve) => {
        resolveCheck = resolve;
      })
    );

    const pendingCheck = useUpdateStore.getState().checkForUpdateManually();
    expect(useUpdateStore.getState().checkPanel).toBe("checking");
    resolveCheck(null);
    await pendingCheck;

    const state = useUpdateStore.getState();
    expect(state.checkPanel).toBe("latest");
    expect(state.update).toBeNull();
    expect(state.isDialogOpen).toBe(false);
  });

  it("shows the failed panel and logs when a manual check throws", async () => {
    const failure = new Error("offline");
    checkMock.mockRejectedValue(failure);

    await useUpdateStore.getState().checkForUpdateManually();

    expect(useUpdateStore.getState().checkPanel).toBe("failed");
    expect(useUpdateStore.getState().isDialogOpen).toBe(false);
    expect(console.error).toHaveBeenCalledWith("[Updater] Check failed:", {
      error: failure,
    });
  });

  it.each(["installing", "failed"] as const)(
    "ignores a manual check while the install is %s",
    async (status) => {
      checkMock.mockResolvedValue(fakeUpdate("1.1.0"));
      await useUpdateStore.getState().checkForUpdate();
      useUpdateStore.setState({ status });
      checkMock.mockClear();

      await useUpdateStore.getState().checkForUpdateManually();

      expect(checkMock).not.toHaveBeenCalled();
      expect(useUpdateStore.getState().checkPanel).toBe("closed");
      expect(useUpdateStore.getState().isDialogOpen).toBe(true);
    }
  );

  it("ignores a second manual check while one is running", async () => {
    checkMock.mockReturnValue(new Promise(() => {}));
    void useUpdateStore.getState().checkForUpdateManually();

    await useUpdateStore.getState().checkForUpdateManually();

    expect(checkMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a found update known without opening the dialog when the panel was closed meanwhile", async () => {
    let resolveCheck: (update: Update | null) => void = () => {};
    checkMock.mockReturnValue(
      new Promise((resolve) => {
        resolveCheck = resolve;
      })
    );
    const pendingCheck = useUpdateStore.getState().checkForUpdateManually();

    useUpdateStore.getState().closeCheckPanel();
    resolveCheck(fakeUpdate("1.1.0"));
    await pendingCheck;

    const state = useUpdateStore.getState();
    expect(state.checkPanel).toBe("closed");
    expect(state.isDialogOpen).toBe(false);
    expect(state.update?.version).toBe("1.1.0");
  });

  it("does not reopen the panel when a manual check without an update resolves after it was closed", async () => {
    let resolveCheck: (update: Update | null) => void = () => {};
    checkMock.mockReturnValue(
      new Promise((resolve) => {
        resolveCheck = resolve;
      })
    );
    const pendingCheck = useUpdateStore.getState().checkForUpdateManually();

    useUpdateStore.getState().closeCheckPanel();
    resolveCheck(null);
    await pendingCheck;

    expect(useUpdateStore.getState().checkPanel).toBe("closed");
    expect(useUpdateStore.getState().update).toBeNull();
  });

  it("keeps the dialog open and closes the panel when a manual check finds the update already shown", async () => {
    checkMock.mockResolvedValue(fakeUpdate("1.1.0"));
    await useUpdateStore.getState().checkForUpdate();

    await useUpdateStore.getState().checkForUpdateManually();

    const state = useUpdateStore.getState();
    expect(state.isDialogOpen).toBe(true);
    expect(state.checkPanel).toBe("closed");
  });

  it("keeps the install state and closes the panel when a manual check resolves during an install", async () => {
    checkMock.mockResolvedValueOnce(
      fakeUpdate("1.1.0", () => new Promise(() => {}))
    );
    await useUpdateStore.getState().checkForUpdate();
    let resolveCheck: (update: Update | null) => void = () => {};
    checkMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCheck = resolve;
      })
    );
    const pendingCheck = useUpdateStore.getState().checkForUpdateManually();

    void useUpdateStore.getState().installUpdate();
    resolveCheck(fakeUpdate("1.2.0"));
    await pendingCheck;

    const state = useUpdateStore.getState();
    expect(state.status).toBe("installing");
    expect(state.update?.version).toBe("1.1.0");
    expect(state.checkPanel).toBe("closed");
  });

  it("loads the app version once", async () => {
    await useUpdateStore.getState().loadAppVersion();
    await useUpdateStore.getState().loadAppVersion();

    expect(useUpdateStore.getState().appVersion).toBe("1.0.2");
    expect(getVersionMock).toHaveBeenCalledTimes(1);
  });

  it("reads the app version once for concurrent loads", async () => {
    await Promise.all([
      useUpdateStore.getState().loadAppVersion(),
      useUpdateStore.getState().loadAppVersion(),
    ]);

    expect(useUpdateStore.getState().appVersion).toBe("1.0.2");
    expect(getVersionMock).toHaveBeenCalledTimes(1);
  });

  it("leaves the app version unknown outside Tauri and loads it later", async () => {
    isTauriMock.mockReturnValue(false);
    await useUpdateStore.getState().loadAppVersion();
    expect(useUpdateStore.getState().appVersion).toBeNull();
    expect(getVersionMock).not.toHaveBeenCalled();

    isTauriMock.mockReturnValue(true);
    await useUpdateStore.getState().loadAppVersion();
    expect(useUpdateStore.getState().appVersion).toBe("1.0.2");
  });

  it("reports download progress and relaunches after installing", async () => {
    checkMock.mockResolvedValue(
      fakeUpdate("1.1.0", async (onEvent) => {
        onEvent({ event: "Started", data: { contentLength: 200 } });
        onEvent({ event: "Progress", data: { chunkLength: 50 } });
        onEvent({ event: "Progress", data: { chunkLength: 150 } });
        onEvent({ event: "Finished" });
      })
    );
    await useUpdateStore.getState().checkForUpdate();
    const progressSeen: Array<number | null> = [];
    const unsubscribe = useUpdateStore.subscribe((state) =>
      progressSeen.push(state.progress)
    );

    await useUpdateStore.getState().installUpdate();
    unsubscribe();

    expect(progressSeen).toEqual([null, 25, 100, 100]);
    expect(useUpdateStore.getState().status).toBe("installing");
    expect(relaunchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps progress indeterminate when the content length is unknown", async () => {
    checkMock.mockResolvedValue(
      fakeUpdate("1.1.0", async (onEvent) => {
        onEvent({ event: "Started", data: {} });
        onEvent({ event: "Progress", data: { chunkLength: 50 } });
      })
    );
    await useUpdateStore.getState().checkForUpdate();

    await useUpdateStore.getState().installUpdate();

    expect(useUpdateStore.getState().progress).toBeNull();
  });

  it("ignores a dismiss request while installing", async () => {
    checkMock.mockResolvedValue(fakeUpdate("1.1.0"));
    await useUpdateStore.getState().checkForUpdate();
    useUpdateStore.setState({ status: "installing" });

    useUpdateStore.getState().dismiss();

    const state = useUpdateStore.getState();
    expect(state.update?.version).toBe("1.1.0");
    expect(state.isDialogOpen).toBe(true);
    expect(state.dismissedVersion).toBeNull();
  });

  it("enters the failed state without relaunching when installing fails", async () => {
    checkMock.mockResolvedValue(
      fakeUpdate("1.1.0", async () => {
        throw new Error("signature mismatch");
      })
    );
    await useUpdateStore.getState().checkForUpdate();

    await useUpdateStore.getState().installUpdate();

    const state = useUpdateStore.getState();
    expect(state.status).toBe("failed");
    expect(state.update?.version).toBe("1.1.0");
    expect(relaunchMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "[Updater] Install failed:",
      expect.objectContaining({ error: expect.any(Error) })
    );

    useUpdateStore.getState().dismiss();
    const dismissed = useUpdateStore.getState();
    expect(dismissed.update?.version).toBe("1.1.0");
    expect(dismissed.isDialogOpen).toBe(false);
    expect(dismissed.status).toBe("idle");
  });

  it("keeps the install state when a check resolves during an install", async () => {
    checkMock.mockResolvedValueOnce(
      fakeUpdate("1.1.0", () => new Promise(() => {}))
    );
    await useUpdateStore.getState().checkForUpdate();
    let resolveCheck: (update: Update | null) => void = () => {};
    checkMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCheck = resolve;
      })
    );
    const pendingCheck = useUpdateStore.getState().checkForUpdate();

    void useUpdateStore.getState().installUpdate();
    resolveCheck(fakeUpdate("1.2.0"));
    await pendingCheck;

    const state = useUpdateStore.getState();
    expect(state.status).toBe("installing");
    expect(state.update?.version).toBe("1.1.0");
  });

  it("keeps the failure visible when a periodic check runs after a failed install", async () => {
    checkMock.mockResolvedValue(fakeUpdate("1.1.0"));
    await useUpdateStore.getState().checkForUpdate();
    useUpdateStore.setState({ status: "failed" });
    checkMock.mockClear();

    await useUpdateStore.getState().checkForUpdate();

    expect(checkMock).not.toHaveBeenCalled();
    expect(useUpdateStore.getState().status).toBe("failed");
  });

  it("skips the check outside Tauri", async () => {
    isTauriMock.mockReturnValue(false);
    checkMock.mockResolvedValue(fakeUpdate("1.1.0"));

    await useUpdateStore.getState().checkForUpdate();

    expect(checkMock).not.toHaveBeenCalled();
    expect(useUpdateStore.getState().update).toBeNull();
  });

  it("skips the check outside production builds", async () => {
    vi.stubEnv("NODE_ENV", "development");
    checkMock.mockResolvedValue(fakeUpdate("1.1.0"));

    await useUpdateStore.getState().checkForUpdate();

    expect(checkMock).not.toHaveBeenCalled();
    expect(useUpdateStore.getState().update).toBeNull();
  });
});
