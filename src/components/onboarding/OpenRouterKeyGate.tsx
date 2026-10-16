"use client";

import React, { useEffect, type ReactNode } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { OpenRouterKeyForm } from "@/components/onboarding/OpenRouterKeyForm";
import { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/types/meeting";
import { useMeetingStore } from "@/store/meeting-store";

interface OpenRouterKeyGateProps {
  locale: SupportedLocale;
  children: ReactNode;
}

export function OpenRouterKeyGate({ locale, children }: OpenRouterKeyGateProps) {
  const dict = getDictionary(locale);
  const keyStatus = useMeetingStore((state) => state.openRouterKeyStatus);
  const loadOpenRouterKey = useMeetingStore((state) => state.loadOpenRouterKey);

  useEffect(() => {
    void loadOpenRouterKey();
  }, [loadOpenRouterKey]);

  if (keyStatus === "loading") {
    return (
      <main
        role="status"
        className="flex min-h-screen items-center justify-center gap-2 text-xs text-slate-400"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        {dict.onboarding.loading}
      </main>
    );
  }

  if (keyStatus === "missing") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/20 text-orange-400">
              <KeyRound className="h-4 w-4" />
            </div>
            <h1 className="text-lg font-semibold text-slate-50">
              {dict.onboarding.title}
            </h1>
          </div>
          <p className="mb-5 text-xs leading-relaxed text-slate-400">
            {dict.onboarding.subtitle}
          </p>
          <OpenRouterKeyForm
            dict={dict}
            label={dict.onboarding.keyLabel}
            submitLabel={dict.onboarding.saveButton}
          />
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
