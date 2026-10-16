import { beforeEach, describe, expect, it, vi } from "vitest";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import {
  requestCallAttention,
  subscribeMicActivity,
} from "@/services/audio/mic-activity";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(),
  UserAttentionType: { Critical: 1, Informational: 2 },
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}));

const listenMock = vi.mocked(listen);
const windowMock = vi.mocked(getCurrentWindow);
const grantedMock = vi.mocked(isPermissionGranted);
const requestPermissionMock = vi.mocked(requestPermission);
const sendMock = vi.mocked(sendNotification);

const NOTIFICATION = { title: "In a call", body: "Open SumMeet to record" };

describe("Mic activity service", () => {
  const errorSpy = vi.spyOn(console, "error");

  const requestUserAttention = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    errorSpy.mockImplementation(() => {});
    requestUserAttention.mockResolvedValue(undefined);
    windowMock.mockReturnValue({
      requestUserAttention,
    } as unknown as ReturnType<typeof getCurrentWindow>);
    grantedMock.mockResolvedValue(true);
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
    expect(sendMock).toHaveBeenCalledWith(NOTIFICATION);
  });

  it("sends the notification without asking when permission is already granted", async () => {
    await requestCallAttention(NOTIFICATION);

    expect(requestPermissionMock).not.toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(NOTIFICATION);
  });

  it("asks for permission first and sends once the user grants it", async () => {
    grantedMock.mockResolvedValue(false);
    requestPermissionMock.mockResolvedValue("granted");

    await requestCallAttention(NOTIFICATION);

    expect(requestPermissionMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(NOTIFICATION);
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
});
