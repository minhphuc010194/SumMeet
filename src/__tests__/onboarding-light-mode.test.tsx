import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenRouterKeyGate } from "@/components/onboarding/OpenRouterKeyGate";
import { getDictionary } from "@/i18n/dictionaries";
import { getStoredOpenRouterKey } from "@/services/ai/openrouter-key";
import { useMeetingStore } from "@/store/meeting-store";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/services/ai/openrouter-key", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/ai/openrouter-key")>()),
  getStoredOpenRouterKey: vi.fn(),
}));
vi.mock("@/services/tray", () => ({ setupTrayMenu: vi.fn() }));

const SOLID_FILL = /\bbg-(orange|rose|emerald)-[56]00\b/;

describe("Onboarding in light mode", () => {
  beforeEach(() => {
    vi.mocked(getStoredOpenRouterKey).mockResolvedValue({
      success: true,
      data: null,
    });
    useMeetingStore.setState({ openRouterKey: "", openRouterKeyStatus: "missing" });
  });

  it.each(["vi", "en"] as const)(
    "keeps the %s title on a remapped text step",
    async (locale) => {
      const dict = getDictionary(locale);
      render(
        <OpenRouterKeyGate locale={locale}>
          <p>workspace</p>
        </OpenRouterKeyGate>
      );

      const title = await screen.findByRole("heading", {
        level: 1,
        name: dict.onboarding.title,
      });

      expect(title.classList.contains("text-slate-50")).toBe(true);
      expect(title.classList.contains("text-white")).toBe(false);
    }
  );

  it("uses text-white and bg-white only on solid fills", async () => {
    const { container } = render(
      <OpenRouterKeyGate locale="vi">
        <p>workspace</p>
      </OpenRouterKeyGate>
    );
    await screen.findByRole("heading", { level: 1 });

    const unsafe = Array.from(container.querySelectorAll("[class]"))
      .map((element) => element.getAttribute("class") ?? "")
      .filter(
        (classes) =>
          /\b(text|bg)-white\b/.test(classes) && !SOLID_FILL.test(classes)
      );

    expect(unsafe).toEqual([]);
  });
});
