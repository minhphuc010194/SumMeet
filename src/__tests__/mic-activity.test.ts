import { beforeEach, describe, expect, it, vi } from "vitest";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";
import {
  requestCallAttention,
  subscribeMicActivity,
} from "@/services/audio/mic-activity";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(),
  UserAttentionType: { Critical: 1, Informational: 2 },
}));

const listenMock = vi.mocked(listen);
const windowMock = vi.mocked(getCurrentWindow);

describe("Mic activity service", () => {
  const errorSpy = vi.spyOn(console, "error");

  beforeEach(() => {
    vi.resetAllMocks();
    errorSpy.mockImplementation(() => {});
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
    const requestUserAttention = vi.fn().mockResolvedValue(undefined);
    windowMock.mockReturnValue({
      requestUserAttention,
    } as unknown as ReturnType<typeof getCurrentWindow>);

    await requestCallAttention();

    expect(requestUserAttention).toHaveBeenCalledWith(
      UserAttentionType.Informational
    );
  });

  it("logs instead of throwing when the window is unavailable", async () => {
    windowMock.mockImplementation(() => {
      throw new Error("no ipc");
    });

    await expect(requestCallAttention()).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith("[MicActivity] Operation failed:", {
      context: "requestUserAttention",
      error: "no ipc",
    });
  });
});
