import React from "react";
import { SumMeetWorkspace } from "@/components/dashboard/SumMeetWorkspace";
import { OpenRouterKeyGate } from "@/components/onboarding/OpenRouterKeyGate";
import type { SupportedLocale } from "@/types/meeting";

export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "vi" }];
}

export default async function LocaleHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const resolved = await params;
  const locale: SupportedLocale = resolved.locale === "vi" ? "vi" : "en";

  return (
    <OpenRouterKeyGate locale={locale}>
      <SumMeetWorkspace locale={locale} />
    </OpenRouterKeyGate>
  );
}
