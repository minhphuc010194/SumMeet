import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Update } from "@tauri-apps/plugin-updater";
import { UpdateDialog } from "@/components/update/UpdateDialog";
import { getDictionary } from "@/i18n/dictionaries";
import { useUpdateStore } from "@/store/update-store";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn(() => false) }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));

const dict = getDictionary("en").update;
const UPDATE = { version: "1.1.0", body: "Faster exports" } as Update;

function showUpdate(
  state: Partial<ReturnType<typeof useUpdateStore.getState>> = {}
) {
  useUpdateStore.setState({
    update: UPDATE,
    status: "idle",
    progress: null,
    dismissedVersion: null,
    ...state,
  });
}

function button(name: string) {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

function renderDialog() {
  render(<UpdateDialog locale="en" />);
  return document.querySelector("dialog") as HTMLDialogElement;
}

describe("UpdateDialog", () => {
  beforeEach(() => {
    useUpdateStore.setState({
      update: null,
      status: "idle",
      progress: null,
      dismissedVersion: null,
    });
  });

  it("renders nothing when there is no update", () => {
    render(<UpdateDialog locale="en" />);

    expect(screen.queryByText(dict.title)).toBeNull();
  });

  it("shows the new version, the release notes and both actions", () => {
    showUpdate();
    renderDialog();

    expect(
      screen.getByText(dict.versionLine.replace("{version}", "1.1.0"))
    ).toBeTruthy();
    expect(screen.getByText("Faster exports")).toBeTruthy();
    expect(button(dict.updateNow).disabled).toBe(false);
    expect(button(dict.later).disabled).toBe(false);
  });

  it("labels the actions in Vietnamese", () => {
    showUpdate();
    render(<UpdateDialog locale="vi" />);

    const viDict = getDictionary("vi").update;
    expect(button(viDict.updateNow)).toBeTruthy();
    expect(button(viDict.later)).toBeTruthy();
  });

  it("hides the dialog for the version when Later is chosen", () => {
    showUpdate();
    renderDialog();

    fireEvent.click(button(dict.later));

    expect(screen.queryByText(dict.title)).toBeNull();
    expect(useUpdateStore.getState().dismissedVersion).toBe("1.1.0");
  });

  it("shows an indeterminate bar and locks the actions while the size is unknown", () => {
    showUpdate({ status: "installing", progress: null });
    renderDialog();

    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBeNull();
    expect(screen.getByText(dict.downloading)).toBeTruthy();
    expect(button(dict.updateNow).disabled).toBe(true);
    expect(button(dict.later).disabled).toBe(true);
  });

  it("shows the download percentage", () => {
    showUpdate({ status: "installing", progress: 40 });
    renderDialog();

    expect(
      screen.getByRole("progressbar").getAttribute("aria-valuenow")
    ).toBe("40");
    expect(screen.getByText(`${dict.downloading} 40%`)).toBeTruthy();
  });

  it("shows the localized failure and lets the user close the dialog", () => {
    showUpdate({ status: "failed", progress: 40 });
    renderDialog();

    expect(screen.getByRole("alert").textContent).toBe(dict.installFailed);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(button(dict.later).disabled).toBe(false);
    expect(screen.getByRole("button", { name: "Close modal" })).toBeTruthy();
  });

  it("cannot be dismissed while installing", () => {
    showUpdate({ status: "installing", progress: 40 });
    const dialog = renderDialog();
    dialog.close = vi.fn();

    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);
    fireEvent.click(dialog, { clientX: 1000, clientY: 1000 });
    dialog.dispatchEvent(new Event("close"));

    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog.getAttribute("closedby")).toBe("none");
    expect(dialog.close).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Close modal" })).toBeNull();
    expect(screen.getByText(dict.title)).toBeTruthy();
    expect(screen.getByRole("progressbar")).toBeTruthy();
  });

  it("can be dismissed with Escape or a backdrop click when idle", () => {
    showUpdate();
    const dialog = renderDialog();
    dialog.close = vi.fn();

    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);
    fireEvent.click(dialog, { clientX: 1000, clientY: 1000 });

    expect(cancel.defaultPrevented).toBe(false);
    expect(dialog.getAttribute("closedby")).toBe("any");
    expect(dialog.close).toHaveBeenCalledTimes(1);
  });
});
