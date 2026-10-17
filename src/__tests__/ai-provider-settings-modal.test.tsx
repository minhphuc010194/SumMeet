import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIProviderSettingsModal } from "@/components/settings/AIProviderSettingsModal";
import { getDictionary } from "@/i18n/dictionaries";
import { useMeetingStore } from "@/store/meeting-store";

const mocks = vi.hoisted(() => ({
  getAutostartEnabled: vi.fn(),
  setAutostartEnabled: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));
vi.mock("@/services/autostart", () => mocks);

const dict = getDictionary("en");

async function renderModal() {
  const onToast = vi.fn();
  const onClose = vi.fn();
  await act(async () => {
    render(
      <AIProviderSettingsModal
        isOpen
        onClose={onClose}
        dict={dict}
        onToast={onToast}
      />
    );
  });
  return { onToast, onClose };
}

function toggle(label: string) {
  return screen.getByLabelText(label) as HTMLInputElement;
}

function save() {
  fireEvent.click(screen.getByRole("button", { name: dict.settings.saveButton }));
}

describe("AI provider settings call detection toggle", () => {
  beforeEach(() => {
    localStorage.clear();
    useMeetingStore.getState().updateSettings({ callDetectionEnabled: true });
    mocks.getAutostartEnabled
      .mockReset()
      .mockResolvedValue({ success: true, data: false });
    mocks.setAutostartEnabled
      .mockReset()
      .mockResolvedValue({ success: true, data: null });
  });

  it("shows the saved setting", async () => {
    await renderModal();

    expect(toggle(dict.settings.callDetectionLabel).checked).toBe(true);
  });

  it("saves the switched-off setting", async () => {
    await renderModal();

    fireEvent.click(toggle(dict.settings.callDetectionLabel));
    save();

    expect(useMeetingStore.getState().settings.callDetectionEnabled).toBe(false);
  });

  it("leaves the setting unchanged when closed without saving", async () => {
    await renderModal();

    fireEvent.click(toggle(dict.settings.callDetectionLabel));

    expect(useMeetingStore.getState().settings.callDetectionEnabled).toBe(true);
  });
});

describe("AI provider settings open-at-login toggle", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.getAutostartEnabled
      .mockReset()
      .mockResolvedValue({ success: true, data: false });
    mocks.setAutostartEnabled
      .mockReset()
      .mockResolvedValue({ success: true, data: null });
  });

  it("is off when the operating system has it off", async () => {
    await renderModal();

    expect(toggle(dict.settings.autostartLabel).checked).toBe(false);
  });

  it("shows the operating system state when it is on", async () => {
    mocks.getAutostartEnabled.mockResolvedValue({ success: true, data: true });

    await renderModal();

    expect(toggle(dict.settings.autostartLabel).checked).toBe(true);
  });

  it("enables it on save when switched on", async () => {
    const { onToast, onClose } = await renderModal();

    fireEvent.click(toggle(dict.settings.autostartLabel));
    save();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mocks.setAutostartEnabled).toHaveBeenCalledTimes(1);
    expect(mocks.setAutostartEnabled).toHaveBeenCalledWith(true);
    expect(onToast).toHaveBeenCalledWith(dict.settings.savedToast);
  });

  it("disables it on save when switched off", async () => {
    mocks.getAutostartEnabled.mockResolvedValue({ success: true, data: true });
    const { onClose } = await renderModal();

    fireEvent.click(toggle(dict.settings.autostartLabel));
    save();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mocks.setAutostartEnabled).toHaveBeenCalledTimes(1);
    expect(mocks.setAutostartEnabled).toHaveBeenCalledWith(false);
  });

  it("leaves the operating system alone on save when unchanged", async () => {
    const { onClose } = await renderModal();

    save();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mocks.setAutostartEnabled).not.toHaveBeenCalled();
  });

  it("shows an error instead of the saved message when the change fails", async () => {
    mocks.setAutostartEnabled.mockResolvedValue({
      success: false,
      error: "denied",
    });
    const { onToast, onClose } = await renderModal();

    fireEvent.click(toggle(dict.settings.autostartLabel));
    save();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onToast).toHaveBeenCalledTimes(1);
    expect(onToast).toHaveBeenCalledWith(dict.settings.autostartSaveError);
  });

  it("still saves the other settings when the change fails", async () => {
    useMeetingStore.getState().updateSettings({
      callDetectionEnabled: true,
      openRouterModel: "old/model",
    });
    mocks.setAutostartEnabled.mockResolvedValue({
      success: false,
      error: "denied",
    });
    const { onClose } = await renderModal();

    fireEvent.click(toggle(dict.settings.autostartLabel));
    fireEvent.click(toggle(dict.settings.callDetectionLabel));
    fireEvent.change(screen.getByLabelText(dict.settings.modelLabel), {
      target: { value: "new/model" },
    });
    save();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useMeetingStore.getState().settings).toMatchObject({
      callDetectionEnabled: false,
      openRouterModel: "new/model",
    });
  });

  it("keeps a toggle made before the operating system state arrives", async () => {
    let resolveRead: (value: { success: boolean; data: boolean }) => void =
      () => {};
    mocks.getAutostartEnabled.mockReturnValue(
      new Promise((resolve) => {
        resolveRead = resolve;
      })
    );
    const { onClose } = await renderModal();

    fireEvent.click(toggle(dict.settings.autostartLabel));
    await act(async () => resolveRead({ success: true, data: false }));

    expect(toggle(dict.settings.autostartLabel).checked).toBe(true);
    save();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mocks.setAutostartEnabled).toHaveBeenCalledWith(true);
  });

  it("shows an error when the operating system state cannot be read", async () => {
    mocks.getAutostartEnabled.mockResolvedValue({
      success: false,
      error: "unreadable",
    });

    const { onToast } = await renderModal();

    expect(onToast).toHaveBeenCalledWith(dict.settings.autostartReadError);
    expect(toggle(dict.settings.autostartLabel).checked).toBe(false);
  });
});
