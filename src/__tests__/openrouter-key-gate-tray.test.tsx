import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenRouterKeyGate } from "@/components/onboarding/OpenRouterKeyGate";
import { getDictionary } from "@/i18n/dictionaries";
import { getStoredOpenRouterKey } from "@/services/ai/openrouter-key";
import { setupTrayMenu } from "@/services/tray";
import { useMeetingStore } from "@/store/meeting-store";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/services/ai/openrouter-key", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/ai/openrouter-key")>()),
  getStoredOpenRouterKey: vi.fn(),
}));
vi.mock("@/services/tray", () => ({ setupTrayMenu: vi.fn() }));

describe("OpenRouter key gate tray menu", () => {
  beforeEach(() => {
    vi.mocked(setupTrayMenu).mockReset();
    vi.mocked(getStoredOpenRouterKey).mockResolvedValue({
      success: true,
      data: null,
    });
    useMeetingStore.setState({ openRouterKey: "", openRouterKeyStatus: "missing" });
  });

  it.each(["vi", "en"] as const)(
    "sets up the %s tray menu while the key is missing",
    async (locale) => {
      const dict = getDictionary(locale);

      render(
        <OpenRouterKeyGate locale={locale}>
          <p>workspace</p>
        </OpenRouterKeyGate>
      );
      await screen.findByRole("heading", {
        level: 1,
        name: dict.onboarding.title,
      });

      expect(setupTrayMenu).toHaveBeenCalledWith({
        openLabel: dict.tray.openLabel,
        quitLabel: dict.tray.quitLabel,
      });
      expect(screen.queryByText("workspace")).toBeNull();
    }
  );

  it("relabels the tray menu when the locale changes", async () => {
    const { rerender } = render(
      <OpenRouterKeyGate locale="vi">
        <p>workspace</p>
      </OpenRouterKeyGate>
    );
    await screen.findByRole("heading", { level: 1 });

    rerender(
      <OpenRouterKeyGate locale="en">
        <p>workspace</p>
      </OpenRouterKeyGate>
    );

    expect(setupTrayMenu).toHaveBeenLastCalledWith({
      openLabel: getDictionary("en").tray.openLabel,
      quitLabel: getDictionary("en").tray.quitLabel,
    });
    expect(setupTrayMenu).toHaveBeenCalledTimes(2);
  });
});
