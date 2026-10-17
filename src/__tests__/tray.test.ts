import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isTauri: vi.fn(),
  getById: vi.fn(),
  newMenu: vi.fn(),
  newMenuItem: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: mocks.isTauri }));
vi.mock("@tauri-apps/api/menu", () => ({
  Menu: { new: mocks.newMenu },
  MenuItem: { new: mocks.newMenuItem },
}));
vi.mock("@tauri-apps/api/tray", () => ({
  TrayIcon: { getById: mocks.getById },
}));

const labels = { openLabel: "Open", quitLabel: "Quit" };

describe("tray menu service", () => {
  let tray: typeof import("@/services/tray");
  let trayIcon: { setMenu: ReturnType<typeof vi.fn> };
  let items: Record<string, { setText: ReturnType<typeof vi.fn> }>;
  const menu = { kind: "menu" };

  beforeEach(async () => {
    items = {};
    trayIcon = { setMenu: vi.fn().mockResolvedValue(undefined) };
    mocks.isTauri.mockReset().mockReturnValue(true);
    mocks.getById.mockReset().mockResolvedValue(trayIcon);
    mocks.newMenu.mockReset().mockResolvedValue(menu);
    mocks.newMenuItem.mockReset().mockImplementation(async ({ id }) => {
      items[id] = { setText: vi.fn().mockResolvedValue(undefined) };
      return items[id];
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.resetModules();
    tray = await import("@/services/tray");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("puts the open and quit items on the main tray icon", async () => {
    const result = await tray.setupTrayMenu(labels);

    expect(result).toEqual({ success: true, data: null });
    expect(mocks.getById).toHaveBeenCalledWith("main");
    expect(mocks.newMenuItem).toHaveBeenCalledWith({
      id: "show-main-window",
      text: "Open",
    });
    expect(mocks.newMenuItem).toHaveBeenCalledWith({ id: "quit", text: "Quit" });
    expect(mocks.newMenu).toHaveBeenCalledWith({
      items: [items["show-main-window"], items.quit],
    });
    expect(trayIcon.setMenu).toHaveBeenCalledWith(menu);
  });

  it("relabels the installed items without installing the menu again", async () => {
    await tray.setupTrayMenu(labels);

    const relabeled = await tray.setupTrayMenu({
      openLabel: "Mở",
      quitLabel: "Thoát",
    });

    expect(relabeled.success).toBe(true);
    expect(items["show-main-window"].setText).toHaveBeenLastCalledWith("Mở");
    expect(items.quit.setText).toHaveBeenLastCalledWith("Thoát");
    expect(mocks.getById).toHaveBeenCalledTimes(1);
    expect(mocks.newMenuItem).toHaveBeenCalledTimes(2);
    expect(trayIcon.setMenu).toHaveBeenCalledTimes(1);
  });

  it("installs one menu for concurrent setups and keeps the last labels", async () => {
    await Promise.all([
      tray.setupTrayMenu(labels),
      tray.setupTrayMenu({ openLabel: "Mở", quitLabel: "Thoát" }),
    ]);

    expect(trayIcon.setMenu).toHaveBeenCalledTimes(1);
    expect(items["show-main-window"].setText).toHaveBeenLastCalledWith("Mở");
    expect(items.quit.setText).toHaveBeenLastCalledWith("Thoát");
  });

  it("makes no Tauri calls outside Tauri", async () => {
    mocks.isTauri.mockReturnValue(false);

    const result = await tray.setupTrayMenu(labels);

    expect(result).toEqual({ success: true, data: null });
    expect(mocks.getById).not.toHaveBeenCalled();
    expect(mocks.newMenuItem).not.toHaveBeenCalled();
    expect(mocks.newMenu).not.toHaveBeenCalled();
  });

  it("reports and logs a missing tray icon, then installs on the next setup", async () => {
    mocks.getById.mockResolvedValueOnce(null);

    const failed = await tray.setupTrayMenu(labels);
    const retried = await tray.setupTrayMenu(labels);

    expect(failed.success).toBe(false);
    expect(console.error).toHaveBeenCalledWith("[Tray] Menu setup failed:", {
      error: expect.any(Error),
    });
    expect(retried.success).toBe(true);
    expect(trayIcon.setMenu).toHaveBeenCalledTimes(1);
  });

  it("reports and logs a failure to set the menu", async () => {
    const failure = new Error("set menu failed");
    trayIcon.setMenu.mockRejectedValueOnce(failure);

    const result = await tray.setupTrayMenu(labels);

    expect(result).toEqual({ success: false, error: String(failure) });
    expect(console.error).toHaveBeenCalledWith("[Tray] Menu setup failed:", {
      error: failure,
    });
  });

  it("reports and logs a failure to relabel an item", async () => {
    await tray.setupTrayMenu(labels);
    const failure = new Error("rename failed");
    items.quit.setText.mockRejectedValueOnce(failure);

    const result = await tray.setupTrayMenu(labels);

    expect(result.success).toBe(false);
    expect(console.error).toHaveBeenCalledWith("[Tray] Menu setup failed:", {
      error: failure,
    });
  });
});
