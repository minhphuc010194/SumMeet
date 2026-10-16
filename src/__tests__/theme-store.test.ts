import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_STORAGE_KEY, useThemeStore } from "@/store/theme-store";

function stubSystemDark(matches: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches, media: query }));
}

describe("theme store", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.classList.remove("dark");
    localStorage.clear();
  });

  it("applies dark and light regardless of the system setting", () => {
    stubSystemDark(false);
    useThemeStore.getState().setTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    stubSystemDark(true);
    useThemeStore.getState().setTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("follows the system setting in system mode", () => {
    stubSystemDark(true);
    useThemeStore.getState().setTheme("system");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    stubSystemDark(false);
    useThemeStore.getState().setTheme("system");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("persists the preference under the key the startup script reads", () => {
    stubSystemDark(false);
    useThemeStore.getState().setTheme("dark");
    const stored = JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) ?? "{}");
    expect(stored.state.theme).toBe("dark");
  });
});
