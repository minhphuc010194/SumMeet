import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  check,
  type DownloadEvent,
  type Update,
} from "@tauri-apps/plugin-updater";
import { useUpdateStore } from "@/store/update-store";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));

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
    relaunchMock.mockReset().mockResolvedValue(undefined);
    checkMock.mockReset();
    useUpdateStore.setState({
      update: null,
      status: "idle",
      progress: null,
      dismissedVersion: null,
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
    expect(state.status).toBe("idle");
  });

  it("shows nothing when no update exists", async () => {
    checkMock.mockResolvedValue(null);

    await useUpdateStore.getState().checkForUpdate();

    expect(useUpdateStore.getState().update).toBeNull();
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

  it("keeps a dismissed version hidden but shows a newer one", async () => {
    checkMock.mockResolvedValue(fakeUpdate("1.1.0"));
    await useUpdateStore.getState().checkForUpdate();
    useUpdateStore.getState().dismiss();
    expect(useUpdateStore.getState().update).toBeNull();

    await useUpdateStore.getState().checkForUpdate();
    expect(useUpdateStore.getState().update).toBeNull();

    checkMock.mockResolvedValue(fakeUpdate("1.2.0"));
    await useUpdateStore.getState().checkForUpdate();
    expect(useUpdateStore.getState().update?.version).toBe("1.2.0");
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

    expect(useUpdateStore.getState().update?.version).toBe("1.1.0");
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
    expect(useUpdateStore.getState().update).toBeNull();
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
