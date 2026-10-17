import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Menu, MenuItem } from "@tauri-apps/api/menu";
import type { Update } from "@tauri-apps/plugin-updater";
import { AIProviderSettingsModal } from "@/components/settings/AIProviderSettingsModal";
import { UpdateDialog } from "@/components/update/UpdateDialog";
import {
  UpdateButton,
  UpdateCheckPanel,
  UpdateSettingsSection,
} from "@/components/update/UpdateEntryPoints";
import { getDictionary } from "@/i18n/dictionaries";
import { useUpdateStore } from "@/store/update-store";

const mocks = vi.hoisted(() => ({
  isTauri: vi.fn(),
  getVersion: vi.fn(),
  check: vi.fn(),
  defaultMenu: vi.fn(),
  newMenuItem: vi.fn(),
  newPredefinedMenuItem: vi.fn(),
  FakeSubmenu: class {
    insert = vi.fn();
    removeAt = vi.fn();
    close = vi.fn();
  },
}));

vi.mock("@tauri-apps/api/app", () => ({ getVersion: mocks.getVersion }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: mocks.isTauri }));
vi.mock("@tauri-apps/api/menu", () => ({
  Submenu: mocks.FakeSubmenu,
  Menu: { default: mocks.defaultMenu },
  MenuItem: { new: mocks.newMenuItem },
  PredefinedMenuItem: { new: mocks.newPredefinedMenuItem },
}));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));

const MAC_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)";
const WINDOWS_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

const dict = getDictionary("en").update;
const viDict = getDictionary("vi").update;
const appName = getDictionary("en").appName;

function fakeUpdate(version: string) {
  return { version, body: `Notes for ${version}` } as unknown as Update;
}

function button(name: string) {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

function stubUserAgent(userAgent: string) {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(userAgent);
}

function knownUpdate(state: { isDialogOpen: boolean; dismissed: boolean }) {
  useUpdateStore.setState({
    update: fakeUpdate("1.1.0"),
    isDialogOpen: state.isDialogOpen,
    dismissedVersion: state.dismissed ? "1.1.0" : null,
  });
}

function deferCheck() {
  let resolveCheck: (update: Update | null) => void = () => {};
  mocks.check.mockReturnValue(
    new Promise((resolve) => {
      resolveCheck = resolve;
    })
  );
  return (update: Update | null) => act(async () => resolveCheck(update));
}

function panelHeading(name: string) {
  return screen.queryByRole("heading", { name, level: 2 });
}

describe("update entry points", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.isTauri.mockReset().mockReturnValue(true);
    mocks.getVersion.mockReset().mockResolvedValue("1.0.2");
    mocks.check.mockReset().mockResolvedValue(null);
    mocks.defaultMenu.mockReset();
    mocks.newMenuItem.mockReset();
    mocks.newPredefinedMenuItem
      .mockReset()
      .mockResolvedValue({ close: vi.fn() });
    useUpdateStore.setState({
      update: null,
      isDialogOpen: false,
      status: "idle",
      progress: null,
      dismissedVersion: null,
      checkPanel: "closed",
      appVersion: null,
    });
    stubUserAgent(MAC_USER_AGENT);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("round update button", () => {
    const label = dict.buttonLabel.replace("{version}", "1.1.0");

    it("is hidden when no update is known", () => {
      render(<UpdateButton locale="en" />);

      expect(screen.queryByRole("button", { name: label })).toBeNull();
    });

    it("is hidden while the dialog is open", () => {
      knownUpdate({ isDialogOpen: true, dismissed: false });
      render(<UpdateButton locale="en" />);

      expect(screen.queryByRole("button", { name: label })).toBeNull();
    });

    it("shows the version in its label and title when the dialog is closed", () => {
      knownUpdate({ isDialogOpen: false, dismissed: true });
      render(<UpdateButton locale="vi" />);

      const viLabel = viDict.buttonLabel.replace("{version}", "1.1.0");
      expect(button(viLabel).title).toBe(viLabel);
    });

    it("appears after Later and reopens the dialog on click", () => {
      knownUpdate({ isDialogOpen: true, dismissed: false });
      render(
        <>
          <UpdateDialog locale="en" />
          <UpdateButton locale="en" />
        </>
      );
      expect(screen.queryByRole("button", { name: label })).toBeNull();

      fireEvent.click(button(dict.later));
      expect(screen.queryByText(dict.title)).toBeNull();

      fireEvent.click(button(label));
      expect(screen.getByText(dict.title)).toBeTruthy();
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    });

    it("appears after the close button and keeps the update known", () => {
      knownUpdate({ isDialogOpen: true, dismissed: false });
      render(
        <>
          <UpdateDialog locale="en" />
          <UpdateButton locale="en" />
        </>
      );

      fireEvent.click(button("Close modal"));

      expect(screen.queryByText(dict.title)).toBeNull();
      expect(button(label)).toBeTruthy();
      expect(useUpdateStore.getState().update?.version).toBe("1.1.0");
    });

    it("appears after the dialog closes through Escape and keeps the update known", () => {
      knownUpdate({ isDialogOpen: true, dismissed: false });
      render(
        <>
          <UpdateDialog locale="en" />
          <UpdateButton locale="en" />
        </>
      );
      const dialog = document.querySelector("dialog") as HTMLDialogElement;

      fireEvent(dialog, new Event("close"));

      expect(screen.queryByText(dict.title)).toBeNull();
      expect(button(label)).toBeTruthy();
      expect(useUpdateStore.getState().update?.version).toBe("1.1.0");
    });
  });

  describe("automatic checks", () => {
    it("keep the dialog closed for the dismissed version and open it for a newer one", async () => {
      mocks.check.mockResolvedValue(fakeUpdate("1.1.0"));
      knownUpdate({ isDialogOpen: false, dismissed: true });
      await act(async () => {
        render(
          <>
            <UpdateDialog locale="en" />
            <UpdateButton locale="en" />
          </>
        );
      });

      expect(mocks.check).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(dict.title)).toBeNull();
      expect(
        screen.getByRole("button", {
          name: dict.buttonLabel.replace("{version}", "1.1.0"),
        })
      ).toBeTruthy();

      mocks.check.mockResolvedValue(fakeUpdate("1.2.0"));
      await act(() => useUpdateStore.getState().checkForUpdate());

      expect(screen.getByText(dict.title)).toBeTruthy();
      expect(
        screen.getByText(dict.versionLine.replace("{version}", "1.2.0"))
      ).toBeTruthy();
    });

    it("keep the round button when a check finds no update while one is known", async () => {
      knownUpdate({ isDialogOpen: false, dismissed: true });
      await act(async () => {
        render(
          <>
            <UpdateDialog locale="en" />
            <UpdateButton locale="en" />
          </>
        );
      });

      expect(mocks.check).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole("button", {
          name: dict.buttonLabel.replace("{version}", "1.1.0"),
        })
      ).toBeTruthy();
      expect(screen.queryByText(dict.title)).toBeNull();
    });
  });

  describe("settings section", () => {
    it("shows the running app version inside the AI settings modal", async () => {
      render(
        <AIProviderSettingsModal
          isOpen
          onClose={() => {}}
          dict={getDictionary("en")}
          onToast={() => {}}
        />
      );

      expect(
        await screen.findByText(dict.currentVersion.replace("{version}", "1.0.2"))
      ).toBeTruthy();
      expect(screen.getByText(dict.settingsTitle)).toBeTruthy();
      expect(screen.getByText(getDictionary("en").appTagline)).toBeTruthy();
      expect(button(dict.checkButton)).toBeTruthy();
    });

    it("shows a dash instead of the version outside Tauri", async () => {
      mocks.isTauri.mockReturnValue(false);
      render(<UpdateSettingsSection locale="en" />);

      expect(
        await screen.findByText(dict.currentVersion.replace("{version}", "—"))
      ).toBeTruthy();
      expect(mocks.getVersion).not.toHaveBeenCalled();
    });

    it("shows a dash and logs when the version cannot be read", async () => {
      const failure = new Error("denied");
      mocks.getVersion.mockRejectedValue(failure);
      render(<UpdateSettingsSection locale="en" />);

      expect(
        await screen.findByText(dict.currentVersion.replace("{version}", "—"))
      ).toBeTruthy();
      expect(console.error).toHaveBeenCalledWith(
        "[Updater] Version read failed:",
        { error: failure }
      );
    });

    it("shows no inline result after a check and leaves the feedback to the panel", async () => {
      render(<UpdateSettingsSection locale="en" />);

      await act(async () => {
        fireEvent.click(button(dict.checkButton));
      });

      expect(screen.queryByText(dict.upToDate)).toBeNull();
      expect(useUpdateStore.getState().checkPanel).toBe("latest");
    });
  });

  describe("check panel", () => {
    it("opens from the settings button in the checking state with the app version", async () => {
      deferCheck();
      render(
        <>
          <UpdateCheckPanel locale="en" />
          <UpdateSettingsSection locale="en" />
        </>
      );
      expect(panelHeading(dict.checkButton)).toBeNull();
      await screen.findByText(dict.currentVersion.replace("{version}", "1.0.2"));

      fireEvent.click(button(dict.checkButton));

      expect(panelHeading(dict.checkButton)).toBeTruthy();
      expect(screen.getByText(appName)).toBeTruthy();
      expect(
        screen.getAllByText(getDictionary("en").appTagline).length
      ).toBeGreaterThanOrEqual(2);
      expect(
        screen.getByText(dict.versionLabel.replace("{version}", "1.0.2"))
      ).toBeTruthy();
      expect(screen.getByRole("status").textContent).toBe(dict.checkingStatus);
    });

    it("shows a dash for the version when it is unknown", async () => {
      mocks.isTauri.mockReturnValue(false);
      await act(async () => {
        render(<UpdateCheckPanel locale="en" />);
      });

      await act(() => useUpdateStore.getState().checkForUpdateManually());

      expect(
        screen.getByText(dict.versionLabel.replace("{version}", "—"))
      ).toBeTruthy();
    });

    it("moves from checking to the latest version and closes through Escape", async () => {
      const resolveCheck = deferCheck();
      render(<UpdateCheckPanel locale="en" />);
      await act(async () => {
        void useUpdateStore.getState().checkForUpdateManually();
      });
      expect(screen.getByRole("status").textContent).toBe(dict.checkingStatus);

      await resolveCheck(null);

      expect(screen.getByRole("status").textContent).toBe(dict.upToDate);
      expect(screen.queryByRole("button", { name: "OK" })).toBeNull();
      fireEvent(
        document.querySelector("dialog") as HTMLDialogElement,
        new Event("close")
      );
      expect(panelHeading(dict.checkButton)).toBeNull();
    });

    it("moves from checking to a localized failure, then to the latest version with Try again", async () => {
      mocks.check.mockRejectedValue(new Error("offline"));
      render(<UpdateCheckPanel locale="vi" />);

      await act(() => useUpdateStore.getState().checkForUpdateManually());

      expect(screen.getByRole("alert").textContent).toBe(viDict.checkFailed);
      mocks.check.mockReset().mockResolvedValue(null);
      await act(async () => {
        fireEvent.click(button(viDict.tryAgain));
      });

      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByRole("status").textContent).toBe(viDict.upToDate);
      expect(screen.queryByRole("button", { name: viDict.tryAgain })).toBeNull();
    });

    it("closes and opens the update dialog when an update is found, even for a dismissed version", async () => {
      mocks.check.mockResolvedValue(fakeUpdate("1.1.0"));
      knownUpdate({ isDialogOpen: false, dismissed: true });
      await act(async () => {
        render(
          <>
            <UpdateDialog locale="en" />
            <UpdateCheckPanel locale="en" />
            <UpdateSettingsSection locale="en" />
          </>
        );
      });
      expect(screen.queryByText(dict.title)).toBeNull();

      await act(async () => {
        fireEvent.click(button(dict.checkButton));
      });

      expect(screen.getByText(dict.title)).toBeTruthy();
      expect(panelHeading(dict.checkButton)).toBeNull();
    });

    it("closes with the close button while keeping the app usable", async () => {
      render(<UpdateCheckPanel locale="en" />);
      await act(() => useUpdateStore.getState().checkForUpdateManually());

      fireEvent.click(button("Close modal"));

      expect(panelHeading(dict.checkButton)).toBeNull();
      expect(useUpdateStore.getState().checkPanel).toBe("closed");
    });

    it("shows again after being closed through Escape", async () => {
      render(<UpdateCheckPanel locale="en" />);
      await act(() => useUpdateStore.getState().checkForUpdateManually());
      fireEvent(
        document.querySelector("dialog") as HTMLDialogElement,
        new Event("close")
      );
      expect(panelHeading(dict.checkButton)).toBeNull();

      await act(() => useUpdateStore.getState().checkForUpdateManually());
      expect(panelHeading(dict.checkButton)).toBeTruthy();

      fireEvent(
        document.querySelector("dialog") as HTMLDialogElement,
        new Event("close")
      );
      expect(panelHeading(dict.checkButton)).toBeNull();
    });

    it("shows the round button after the panel closes mid-check and an update is found", async () => {
      const resolveCheck = deferCheck();
      render(
        <>
          <UpdateCheckPanel locale="en" />
          <UpdateButton locale="en" />
        </>
      );
      await act(async () => {
        void useUpdateStore.getState().checkForUpdateManually();
      });

      fireEvent.click(button("Close modal"));
      await resolveCheck(fakeUpdate("1.1.0"));

      expect(panelHeading(dict.checkButton)).toBeNull();
      expect(
        screen.getByRole("button", {
          name: dict.buttonLabel.replace("{version}", "1.1.0"),
        })
      ).toBeTruthy();
    });
  });

  describe("macOS app menu", () => {
    type UpdaterModule = typeof import("@/services/updater");
    type EntryPointsModule = typeof import("@/components/update/UpdateEntryPoints");
    type DialogModule = typeof import("@/components/update/UpdateDialog");
    type StoreModule = typeof import("@/store/update-store");

    let updater: UpdaterModule;
    let entryPoints: EntryPointsModule;
    let dialogModule: DialogModule;
    let freshStore: StoreModule["useUpdateStore"];
    let appMenu: InstanceType<typeof mocks.FakeSubmenu>;
    let siblingMenu: InstanceType<typeof mocks.FakeSubmenu>;
    let replacedMenu: { close: ReturnType<typeof vi.fn> };
    let setAsAppMenu: ReturnType<typeof vi.fn>;
    let menuItem: {
      close: ReturnType<typeof vi.fn>;
      setText: ReturnType<typeof vi.fn>;
    };

    function menuAction() {
      const [options] = mocks.newMenuItem.mock.calls[0] as [
        { action: (id: string) => void },
      ];
      return options.action;
    }

    beforeEach(async () => {
      appMenu = new mocks.FakeSubmenu();
      siblingMenu = new mocks.FakeSubmenu();
      replacedMenu = { close: vi.fn() };
      setAsAppMenu = vi.fn().mockResolvedValue(replacedMenu);
      menuItem = { close: vi.fn(), setText: vi.fn() };
      mocks.defaultMenu.mockResolvedValue({
        items: async () => [appMenu, siblingMenu],
        setAsAppMenu,
      } as unknown as Menu);
      mocks.newMenuItem.mockResolvedValue(menuItem as unknown as MenuItem);
      vi.resetModules();
      updater = await import("@/services/updater");
      entryPoints = await import("@/components/update/UpdateEntryPoints");
      dialogModule = await import("@/components/update/UpdateDialog");
      ({ useUpdateStore: freshStore } = await import("@/store/update-store"));
    });

    it("inserts the check item after About, releases the menu handles and sets the app menu", async () => {
      const result = await updater.setupUpdateMenu({
        label: "Check",
        onSelect: vi.fn(),
      });

      expect(result).toEqual({ success: true, data: null });
      expect(mocks.newMenuItem).toHaveBeenCalledWith({
        id: "check-for-updates",
        text: "Check",
        action: expect.any(Function),
      });
      expect(appMenu.insert).toHaveBeenCalledWith(menuItem, 1);
      expect(setAsAppMenu).toHaveBeenCalledTimes(1);
      expect(replacedMenu.close).toHaveBeenCalledTimes(1);
      expect(appMenu.close).toHaveBeenCalledTimes(1);
      expect(siblingMenu.close).toHaveBeenCalledTimes(1);
      expect(appMenu.close.mock.invocationCallOrder[0]).toBeGreaterThan(
        appMenu.insert.mock.invocationCallOrder[0]
      );
      expect(menuItem.close).not.toHaveBeenCalled();
    });

    it("does not touch the menu on other platforms", async () => {
      stubUserAgent(WINDOWS_USER_AGENT);

      const result = await updater.setupUpdateMenu({
        label: "Check",
        onSelect: vi.fn(),
      });

      expect(result).toEqual({ success: true, data: null });
      expect(mocks.defaultMenu).not.toHaveBeenCalled();
      expect(setAsAppMenu).not.toHaveBeenCalled();
    });

    it("does not touch the menu outside Tauri", async () => {
      mocks.isTauri.mockReturnValue(false);

      const result = await updater.setupUpdateMenu({
        label: "Check",
        onSelect: vi.fn(),
      });

      expect(result).toEqual({ success: true, data: null });
      expect(mocks.defaultMenu).not.toHaveBeenCalled();
      expect(setAsAppMenu).not.toHaveBeenCalled();
    });

    it("reports and logs a failure, then builds the menu on the next setup", async () => {
      const failure = new Error("menu unavailable");
      mocks.defaultMenu.mockRejectedValueOnce(failure);

      const failed = await updater.setupUpdateMenu({
        label: "Check",
        onSelect: vi.fn(),
      });
      const retried = await updater.setupUpdateMenu({
        label: "Check",
        onSelect: vi.fn(),
      });

      expect(failed.success).toBe(false);
      expect(console.error).toHaveBeenCalledWith("[Updater] Menu setup failed:", {
        error: failure,
      });
      expect(retried.success).toBe(true);
      expect(setAsAppMenu).toHaveBeenCalledTimes(1);
    });

    it("keeps the installed item when renaming it fails and does not rebuild the menu", async () => {
      const failure = new Error("rename failed");
      await updater.setupUpdateMenu({ label: "Check", onSelect: vi.fn() });
      menuItem.setText.mockRejectedValueOnce(failure);

      const failed = await updater.setupUpdateMenu({
        label: "Kiểm tra",
        onSelect: vi.fn(),
      });
      const retried = await updater.setupUpdateMenu({
        label: "Kiểm tra",
        onSelect: vi.fn(),
      });

      expect(failed.success).toBe(false);
      expect(console.error).toHaveBeenCalledWith("[Updater] Menu setup failed:", {
        error: failure,
      });
      expect(retried.success).toBe(true);
      expect(mocks.defaultMenu).toHaveBeenCalledTimes(1);
      expect(mocks.newMenuItem).toHaveBeenCalledTimes(1);
      expect(menuItem.close).not.toHaveBeenCalled();
    });

    it("fails without setting the app menu when the first entry is not a submenu", async () => {
      mocks.defaultMenu.mockResolvedValue({
        items: async () => [],
        setAsAppMenu,
      } as unknown as Menu);

      const result = await updater.setupUpdateMenu({
        label: "Check",
        onSelect: vi.fn(),
      });

      expect(result.success).toBe(false);
      expect(setAsAppMenu).not.toHaveBeenCalled();
    });

    it("reuses the installed item on later setups and only updates its text", async () => {
      await updater.setupUpdateMenu({ label: "Check", onSelect: vi.fn() });

      await updater.setupUpdateMenu({ label: "Kiểm tra", onSelect: vi.fn() });

      expect(mocks.defaultMenu).toHaveBeenCalledTimes(1);
      expect(mocks.newMenuItem).toHaveBeenCalledTimes(1);
      expect(setAsAppMenu).toHaveBeenCalledTimes(1);
      expect(menuItem.setText).toHaveBeenLastCalledWith("Kiểm tra");
      expect(menuItem.close).not.toHaveBeenCalled();
    });

    it("runs the handler of the latest setup when the item is chosen", async () => {
      const firstSelect = vi.fn();
      const secondSelect = vi.fn();
      await updater.setupUpdateMenu({ label: "Check", onSelect: firstSelect });
      await updater.setupUpdateMenu({ label: "Check", onSelect: secondSelect });

      menuAction()("check-for-updates");

      expect(secondSelect).toHaveBeenCalledTimes(1);
      expect(firstSelect).not.toHaveBeenCalled();
    });

    it("builds one menu for concurrent setups and lets the last one win", async () => {
      const firstSelect = vi.fn();
      const secondSelect = vi.fn();

      await Promise.all([
        updater.setupUpdateMenu({ label: "First", onSelect: firstSelect }),
        updater.setupUpdateMenu({ label: "Second", onSelect: secondSelect }),
      ]);

      expect(mocks.defaultMenu).toHaveBeenCalledTimes(1);
      expect(mocks.newMenuItem).toHaveBeenCalledTimes(1);
      expect(menuItem.setText).toHaveBeenLastCalledWith("Second");
      menuAction()("check-for-updates");
      expect(secondSelect).toHaveBeenCalledTimes(1);
      expect(firstSelect).not.toHaveBeenCalled();
    });

    it("labels the item in the current locale and only renames it when the locale changes", async () => {
      const { UpdateMenu } = entryPoints;
      const { rerender } = render(<UpdateMenu locale="en" />);
      await waitFor(() =>
        expect(menuItem.setText).toHaveBeenLastCalledWith(dict.menuCheckForUpdates)
      );
      expect(mocks.newMenuItem).toHaveBeenCalledWith(
        expect.objectContaining({ text: dict.menuCheckForUpdates })
      );
      expect(mocks.newPredefinedMenuItem).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "About SumMeet",
          item: {
            About: expect.objectContaining({
              name: "SumMeet",
              credits: getDictionary("en").appTagline,
            }),
          },
        })
      );

      rerender(<UpdateMenu locale="vi" />);

      await waitFor(() =>
        expect(menuItem.setText).toHaveBeenLastCalledWith(
          viDict.menuCheckForUpdates
        )
      );
      await waitFor(() =>
        expect(mocks.newPredefinedMenuItem).toHaveBeenLastCalledWith(
          expect.objectContaining({
            text: "About SumMeet",
            item: {
              About: expect.objectContaining({
                name: "SumMeet",
                credits: getDictionary("vi").appTagline,
              }),
            },
          })
        )
      );
      await Promise.all([
        updater.setupUpdateMenu({
          label: viDict.menuCheckForUpdates,
          aboutCredits: getDictionary("vi").appTagline,
          onSelect: vi.fn(),
        }),
        updater.setupUpdateMenu({
          label: viDict.menuCheckForUpdates,
          aboutCredits: getDictionary("vi").appTagline,
          onSelect: vi.fn(),
        }),
      ]);
      expect(appMenu.removeAt).toHaveBeenCalledTimes(2);
      expect(mocks.defaultMenu).toHaveBeenCalledTimes(1);
      expect(mocks.newMenuItem).toHaveBeenCalledTimes(1);
    });

    it("does not rebuild the native menu on an unrelated re-render", async () => {
      const { UpdateMenu } = entryPoints;
      const { rerender } = render(<UpdateMenu locale="en" />);
      await waitFor(() => expect(menuItem.setText).toHaveBeenCalledTimes(1));

      await act(async () => rerender(<UpdateMenu locale="en" />));

      expect(mocks.defaultMenu).toHaveBeenCalledTimes(1);
      expect(mocks.newMenuItem).toHaveBeenCalledTimes(1);
      expect(menuItem.setText).toHaveBeenCalledTimes(1);
    });

    it("opens the check panel in the checking state when the item is chosen", async () => {
      const { UpdateMenu, UpdateCheckPanel: FreshPanel } = entryPoints;
      const resolveCheck = deferCheck();
      render(
        <>
          <UpdateMenu locale="en" />
          <FreshPanel locale="en" />
        </>
      );
      await waitFor(() => expect(mocks.newMenuItem).toHaveBeenCalledTimes(1));

      await act(async () => {
        menuAction()("check-for-updates");
      });
      expect(panelHeading(dict.checkButton)).toBeTruthy();
      expect(screen.getByRole("status").textContent).toBe(dict.checkingStatus);

      await resolveCheck(null);
      expect(screen.getByRole("status").textContent).toBe(dict.upToDate);
    });

    it("closes the panel and keeps the update dialog when the item is chosen while it is open", async () => {
      const { UpdateMenu, UpdateCheckPanel: FreshPanel } = entryPoints;
      const { UpdateDialog: FreshDialog } = dialogModule;
      mocks.check.mockResolvedValue(fakeUpdate("1.1.0"));
      freshStore.setState({ update: fakeUpdate("1.1.0"), isDialogOpen: true });
      await act(async () => {
        render(
          <>
            <UpdateMenu locale="en" />
            <FreshDialog locale="en" />
            <FreshPanel locale="en" />
          </>
        );
      });
      await waitFor(() => expect(mocks.newMenuItem).toHaveBeenCalledTimes(1));
      expect(screen.getByText(dict.title)).toBeTruthy();

      await act(async () => {
        menuAction()("check-for-updates");
      });

      expect(panelHeading(dict.checkButton)).toBeNull();
      expect(screen.getByText(dict.title)).toBeTruthy();
      expect(freshStore.getState().isDialogOpen).toBe(true);
    });
  });
});
