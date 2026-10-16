import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIProviderSettingsModal } from "@/components/settings/AIProviderSettingsModal";
import { getDictionary } from "@/i18n/dictionaries";
import { useMeetingStore } from "@/store/meeting-store";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const dict = getDictionary("en");

describe("AI provider settings call detection toggle", () => {
  beforeEach(() => {
    localStorage.clear();
    useMeetingStore.getState().updateSettings({ callDetectionEnabled: true });
  });

  function renderModal() {
    const onToast = vi.fn();
    render(
      <AIProviderSettingsModal
        isOpen
        onClose={vi.fn()}
        dict={dict}
        onToast={onToast}
      />
    );
    return screen.getByLabelText(
      dict.settings.callDetectionLabel
    ) as HTMLInputElement;
  }

  it("shows the saved setting", () => {
    expect(renderModal().checked).toBe(true);
  });

  it("saves the switched-off setting", () => {
    const toggle = renderModal();

    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: dict.settings.saveButton }));

    expect(useMeetingStore.getState().settings.callDetectionEnabled).toBe(false);
  });

  it("leaves the setting unchanged when closed without saving", () => {
    const toggle = renderModal();

    fireEvent.click(toggle);

    expect(useMeetingStore.getState().settings.callDetectionEnabled).toBe(true);
  });
});
