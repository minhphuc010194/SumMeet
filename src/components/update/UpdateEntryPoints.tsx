"use client";

import React, { useEffect } from "react";
import Image from "next/image";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { ModalDialog } from "@/components/common/ModalDialog";
import { getDictionary } from "@/i18n/dictionaries";
import { setupUpdateMenu } from "@/services/updater";
import { useUpdateStore } from "@/store/update-store";
import type { SupportedLocale } from "@/types/meeting";

interface UpdateEntryProps {
  locale: SupportedLocale;
}

interface UpdateButtonProps extends UpdateEntryProps {
  className?: string;
}

export function UpdateButton({ locale, className = "" }: UpdateButtonProps) {
  const dict = getDictionary(locale).update;
  const update = useUpdateStore((state) => state.update);
  const isDialogOpen = useUpdateStore((state) => state.isDialogOpen);
  const openDialog = useUpdateStore((state) => state.openDialog);

  if (!update || isDialogOpen) return null;

  const label = dict.buttonLabel.replace("{version}", update.version);

  return (
    <button
      type="button"
      onClick={openDialog}
      title={label}
      aria-label={label}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-600 text-white shadow-md shadow-orange-600/30 transition hover:bg-orange-500 ${className}`}
    >
      <Download className="h-3.5 w-3.5" />
    </button>
  );
}

export function UpdateSettingsSection({ locale }: UpdateEntryProps) {
  const appDict = getDictionary(locale);
  const dict = appDict.update;
  const appVersion = useUpdateStore((state) => state.appVersion);
  const loadAppVersion = useUpdateStore((state) => state.loadAppVersion);
  const checkForUpdateManually = useUpdateStore(
    (state) => state.checkForUpdateManually
  );

  useEffect(() => {
    void loadAppVersion();
  }, [loadAppVersion]);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-3.5">
      <h3 className="mb-2 border-b border-slate-800 pb-2 text-xs font-bold text-slate-200">
        {dict.settingsTitle}
      </h3>
      <p className="mb-2.5 text-[11px] leading-relaxed text-slate-400">
        {appDict.appTagline}
      </p>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-300">
          {dict.currentVersion.replace("{version}", appVersion ?? "—")}
        </p>
        <button
          type="button"
          onClick={() => void checkForUpdateManually()}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-orange-500/40 bg-orange-500/15 px-3 text-xs font-semibold text-orange-200 transition hover:bg-orange-600 hover:text-white"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {dict.checkButton}
        </button>
      </div>
    </section>
  );
}

export function UpdateCheckPanel({ locale }: UpdateEntryProps) {
  const appDict = getDictionary(locale);
  const dict = appDict.update;
  const {
    checkPanel,
    appVersion,
    loadAppVersion,
    checkForUpdateManually,
    closeCheckPanel,
  } = useUpdateStore();

  useEffect(() => {
    void loadAppVersion();
  }, [loadAppVersion]);

  if (checkPanel === "closed") return null;

  return (
    <ModalDialog
      isOpen
      onClose={closeCheckPanel}
      title={dict.checkButton}
      maxWidthClass="max-w-sm"
    >
      <div className="flex flex-col items-center text-center">
        <Image
          src="/logo-mark.png"
          alt=""
          width={56}
          height={56}
          className="h-14 w-14 rounded-2xl shadow-md shadow-orange-600/20"
        />
        <h3 className="mt-2.5 text-sm font-bold text-slate-50">
          {appDict.appName}
        </h3>
        <p className="mt-0.5 text-xs text-slate-400">
          {dict.versionLabel.replace("{version}", appVersion ?? "—")}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
          {appDict.appTagline}
        </p>

        <div className="mt-4 flex min-h-5 items-center justify-center text-xs">
          {checkPanel === "checking" && (
            <p
              role="status"
              className="inline-flex items-center gap-2 text-slate-300"
            >
              <Loader2 className="h-4 w-4 animate-spin text-orange-400" />
              {dict.checkingStatus}
            </p>
          )}
          {checkPanel === "latest" && (
            <p role="status" className="text-emerald-300">
              {dict.upToDate}
            </p>
          )}
          {checkPanel === "failed" && (
            <p role="alert" className="text-rose-300">
              {dict.checkFailed}
            </p>
          )}
        </div>

        {checkPanel === "failed" && (
          <button
            type="button"
            onClick={() => void checkForUpdateManually()}
            className="mt-4 inline-flex h-8 items-center rounded-lg bg-orange-600 px-3.5 text-xs font-semibold text-white shadow-sm shadow-orange-600/20 transition hover:bg-orange-500"
          >
            {dict.tryAgain}
          </button>
        )}
      </div>
    </ModalDialog>
  );
}

export function UpdateMenu({ locale }: UpdateEntryProps) {
  const appDict = getDictionary(locale);
  const dict = appDict.update;
  const checkForUpdateManually = useUpdateStore(
    (state) => state.checkForUpdateManually
  );

  useEffect(() => {
    void setupUpdateMenu({
      label: dict.menuCheckForUpdates,
      aboutCredits: appDict.appTagline,
      onSelect: checkForUpdateManually,
    });
  }, [dict, appDict.appTagline, checkForUpdateManually]);

  return null;
}
