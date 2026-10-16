import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "summeet-theme";
export const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export function applyTheme(theme: ThemePreference) {
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia(DARK_MEDIA_QUERY).matches);
  document.documentElement.classList.toggle("dark", isDark);
}

interface ThemeStoreState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

export const useThemeStore = create<ThemeStoreState>()(
  persist(
    (set) => ({
      theme: "system",
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
    }),
    { name: THEME_STORAGE_KEY, skipHydration: true }
  )
);
