import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginListener } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";
import {
  isPermissionGranted,
  onAction,
  registerActionTypes,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import {
  requestCallAttention,
  subscribeCallActions,
  subscribeMicActivity,
} from "@/services/audio/mic-activity";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(),
  UserAttentionType: { Critical: 1, Informational: 2 },
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn(),
  onAction: vi.fn(),
  registerActionTypes: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}));

const listenMock = vi.mocked(listen);
const windowMock = vi.mocked(getCurrentWindow);
const grantedMock = vi.mocked(isPermissionGranted);
const requestPermissionMock = vi.mocked(requestPermission);
const sendMock = vi.mocked(sendNotification);
const onActionMock = vi.mocked(onAction);
const registerMock = vi.mocked(registerActionTypes);

const NOTIFICATION = { title: "In a call", body: "Open SumMeet to record" };
const SENT_NOTIFICATION = { ...NOTIFICATION, actionTypeId: "call-detected" };

describe("Mic activity service", () => {
  const errorSpy = vi.spyOn(console, "error");

  const requestUserAttention = vi.fn();
  const windowCalls: string[] = [];
  const show = vi.fn();
  const unminimize = vi.fn();
  const setFocus = vi.fn();

  function captureActionHandler() {
    let handler: (event: { actionId: string }) => Promise<void> = async () => {};
    const unregister = vi.fn().mockResolvedValue(undefined);
    onActionMock.mockImplementation(async (callback) => {
      handler = callback as typeof handler;
      return { unregister } as unknown as PluginListener;
    });
    return {
      perform: (actionId: string) => handler({ actionId }),
      unregister,
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    windowCalls.length = 0;
    errorSpy.mockImplementation(() => {});
    requestUserAttention.mockResolvedValue(undefined);
    show.mockImplementation(async () => {
      windowCalls.push("show");
    });
    unminimize.mockImplementation(async () => {
      windowCalls.push("unminimize");
    });
    setFocus.mockImplementation(async () => {
      windowCalls.push("setFocus");
    });
    windowMock.mockReturnValue({
      requestUserAttention,
      show,
      unminimize,
      setFocus,
    } as unknown as ReturnType<typeof getCurrentWindow>);
    grantedMock.mockResolvedValue(true);
    registerMock.mockResolvedValue(undefined);
  });

  it("forwards the other-app flag of each mic-activity event", async () => {
    const unlisten = vi.fn();
    let handler: (event: { payload: { otherAppActive: boolean } }) => void =
      () => {};
    listenMock.mockImplementation(async (_event, callback) => {
      handler = callback as typeof handler;
      return unlisten;
    });
    const onChange = vi.fn();

    const stop = await subscribeMicActivity(onChange);
    handler({ payload: { otherAppActive: true } });
    handler({ payload: { otherAppActive: false } });

    expect(listenMock.mock.calls[0][0]).toBe("mic-activity");
    expect(onChange.mock.calls).toEqual([[true], [false]]);
    expect(stop).toBe(unlisten);
  });

  it("logs and returns a no-op unsubscribe when listening fails", async () => {
    listenMock.mockRejectedValue(new Error("no ipc"));

    const stop = await subscribeMicActivity(vi.fn());

    expect(() => stop()).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith("[MicActivity] Operation failed:", {
      context: "listen",
      error: "no ipc",
    });
  });

  it("asks for informational attention on the current window", async () => {
    await requestCallAttention(NOTIFICATION);

    expect(requestUserAttention).toHaveBeenCalledWith(
      UserAttentionType.Informational
    );
  });

  it("logs instead of throwing when the window is unavailable", async () => {
    windowMock.mockImplementation(() => {
      throw new Error("no ipc");
    });

    await expect(requestCallAttention(NOTIFICATION)).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith("[MicActivity] Operation failed:", {
      context: "requestUserAttention",
      error: "no ipc",
    });
    expect(sendMock).toHaveBeenCalledWith(SENT_NOTIFICATION);
  });

  it("sends the notification without asking when permission is already granted", async () => {
    await requestCallAttention(NOTIFICATION);

    expect(requestPermissionMock).not.toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(SENT_NOTIFICATION);
  });

  it("asks for permission first and sends once the user grants it", async () => {
    grantedMock.mockResolvedValue(false);
    requestPermissionMock.mockResolvedValue("granted");

    await requestCallAttention(NOTIFICATION);

    expect(requestPermissionMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(SENT_NOTIFICATION);
  });

  it("logs and sends nothing when the permission is denied, keeping the Dock bounce", async () => {
    grantedMock.mockResolvedValue(false);
    requestPermissionMock.mockResolvedValue("denied");

    await expect(requestCallAttention(NOTIFICATION)).resolves.toBeUndefined();

    expect(requestUserAttention).toHaveBeenCalledWith(
      UserAttentionType.Informational
    );
    expect(sendMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith("[MicActivity] Operation failed:", {
      context: "sendNotification",
      error: "notification_permission_denied",
    });
  });

  it("logs instead of throwing when the notification plugin fails", async () => {
    sendMock.mockImplementation(() => {
      throw new Error("plugin down");
    });

    await expect(requestCallAttention(NOTIFICATION)).resolves.toBeUndefined();

    expect(requestUserAttention).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith("[MicActivity] Operation failed:", {
      context: "sendNotification",
      error: "plugin down",
    });
  });

  it("logs instead of throwing when the permission check fails", async () => {
    grantedMock.mockRejectedValue(new Error("no ipc"));

    await expect(requestCallAttention(NOTIFICATION)).resolves.toBeUndefined();

    expect(sendMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith("[MicActivity] Operation failed:", {
      context: "sendNotification",
      error: "no ipc",
    });
  });

  it("registers the record action with the localized title", async () => {
    captureActionHandler();

    await subscribeCallActions({ recordTitle: "Ghi âm", onRecord: vi.fn() });

    expect(registerMock).toHaveBeenCalledTimes(1);
    expect(registerMock).toHaveBeenCalledWith([
      {
        id: "call-detected",
        actions: [{ id: "record", title: "Ghi âm" }],
      },
    ]);
    expect(onActionMock).toHaveBeenCalledTimes(1);
  });

  it("focuses the window in order and does not record on a tap", async () => {
    const { perform } = captureActionHandler();
    const onRecord = vi.fn();
    await subscribeCallActions({ recordTitle: "Record", onRecord });

    await perform("tap");

    expect(windowCalls).toEqual(["show", "unminimize", "setFocus"]);
    expect(onRecord).not.toHaveBeenCalled();
  });

  it("focuses the window and records once on the record action", async () => {
    const { perform } = captureActionHandler();
    const onRecord = vi.fn();
    await subscribeCallActions({ recordTitle: "Record", onRecord });

    await perform("record");

    expect(windowCalls).toEqual(["show", "unminimize", "setFocus"]);
    expect(onRecord).toHaveBeenCalledTimes(1);
  });

  it("logs a focus failure and still records", async () => {
    unminimize.mockRejectedValue(new Error("window gone"));
    const { perform } = captureActionHandler();
    const onRecord = vi.fn();
    await subscribeCallActions({ recordTitle: "Record", onRecord });

    await perform("record");

    expect(errorSpy).toHaveBeenCalledWith("[MicActivity] Operation failed:", {
      context: "focusWindow",
      error: "window gone",
    });
    expect(onRecord).toHaveBeenCalledTimes(1);
  });

  it("removes the listener when the returned unsubscribe runs", async () => {
    const { unregister } = captureActionHandler();

    const stop = await subscribeCallActions({
      recordTitle: "Record",
      onRecord: vi.fn(),
    });
    expect(unregister).not.toHaveBeenCalled();
    stop();

    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it("logs when removing the listener fails", async () => {
    const { unregister } = captureActionHandler();
    unregister.mockRejectedValue(new Error("no ipc"));
    const stop = await subscribeCallActions({
      recordTitle: "Record",
      onRecord: vi.fn(),
    });

    stop();

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith("[MicActivity] Operation failed:", {
        context: "unregister",
        error: "no ipc",
      })
    );
  });

  it("logs a registration failure and still listens for taps", async () => {
    registerMock.mockRejectedValue(new Error("not allowed"));
    const { perform } = captureActionHandler();
    await subscribeCallActions({ recordTitle: "Record", onRecord: vi.fn() });

    await perform("tap");

    expect(errorSpy).toHaveBeenCalledWith("[MicActivity] Operation failed:", {
      context: "registerActionTypes",
      error: "not allowed",
    });
    expect(windowCalls).toEqual(["show", "unminimize", "setFocus"]);
  });

  it("logs and returns a no-op unsubscribe when listening for actions fails", async () => {
    onActionMock.mockRejectedValue(new Error("no ipc"));

    const stop = await subscribeCallActions({
      recordTitle: "Record",
      onRecord: vi.fn(),
    });

    expect(() => stop()).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith("[MicActivity] Operation failed:", {
      context: "onAction",
      error: "no ipc",
    });
  });
});
