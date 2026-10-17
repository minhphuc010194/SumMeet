import type { Metadata } from "next";
import { DARK_MEDIA_QUERY, THEME_STORAGE_KEY } from "@/store/theme-store";
import "./globals.css";

export const metadata: Metadata = {
  title: "SumMeet Desktop — AI Meeting Recorder & Copilot",
  description:
    "Bot-free Dual-Stream AI Meeting Recorder, Live Transcription, Speaker Diarization, and AskBot Copilot (AirPods & Headphone Optimized)",
};

const THEME_INIT_SCRIPT = `(() => {
  let theme;
  try {
    theme = JSON.parse(localStorage.getItem("${THEME_STORAGE_KEY}")).state.theme;
  } catch (error) {
    theme = "system";
  }
  const isDark = theme === "dark" || (theme === "system" && matchMedia("${DARK_MEDIA_QUERY}").matches);
  document.documentElement.classList.toggle("dark", isDark);
})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
