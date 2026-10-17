import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { isTauri } from "@tauri-apps/api/core";
import {
  getAutostartEnabled,
  setAutostartEnabled,
} from "@/services/autostart";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn() }));
vi.mock("@tauri-apps/plugin-autostart", () => ({
  disable: vi.fn(),
  enable: vi.fn(),
  isEnabled: vi.fn(),
}));

describe("autostart service", () => {
  beforeEach(() => {
    vi.mocked(isTauri).mockReset().mockReturnValue(true);
    vi.mocked(isEnabled).mockReset().mockResolvedValue(false);
    vi.mocked(enable).mockReset().mockResolvedValue(undefined);
    vi.mocked(disable).mockReset().mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads the operating system state", async () => {
    vi.mocked(isEnabled).mockResolvedValue(true);

    expect(await getAutostartEnabled()).toEqual({ success: true, data: true });
  });

  it("reports and logs a failed state read", async () => {
    const failure = new Error("read failed");
    vi.mocked(isEnabled).mockRejectedValue(failure);

    const result = await getAutostartEnabled();

    expect(result).toEqual({ success: false, error: String(failure) });
    expect(console.error).toHaveBeenCalledWith(
      "[Autostart] Status read failed:",
      { error: failure }
    );
  });

  it("enables launch at login", async () => {
    const result = await setAutostartEnabled(true);

    expect(result).toEqual({ success: true, data: null });
    expect(enable).toHaveBeenCalledTimes(1);
    expect(disable).not.toHaveBeenCalled();
  });

  it("disables launch at login", async () => {
    const result = await setAutostartEnabled(false);

    expect(result).toEqual({ success: true, data: null });
    expect(disable).toHaveBeenCalledTimes(1);
    expect(enable).not.toHaveBeenCalled();
  });

  it("reports and logs a failed update", async () => {
    const failure = new Error("denied");
    vi.mocked(enable).mockRejectedValue(failure);

    const result = await setAutostartEnabled(true);

    expect(result).toEqual({ success: false, error: String(failure) });
    expect(console.error).toHaveBeenCalledWith("[Autostart] Update failed:", {
      enabled: true,
      error: failure,
    });
  });

  it("makes no plugin calls outside Tauri", async () => {
    vi.mocked(isTauri).mockReturnValue(false);

    expect(await getAutostartEnabled()).toEqual({ success: true, data: false });
    expect(await setAutostartEnabled(true)).toEqual({
      success: true,
      data: null,
    });
    expect(isEnabled).not.toHaveBeenCalled();
    expect(enable).not.toHaveBeenCalled();
    expect(disable).not.toHaveBeenCalled();
  });
});
