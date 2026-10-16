"use client";

import React, { useEffect } from "react";
import { ModalDialog } from "@/components/common/ModalDialog";
import { getDictionary } from "@/i18n/dictionaries";
import { useUpdateStore } from "@/store/update-store";
import type { SupportedLocale } from "@/types/meeting";

interface UpdateDialogProps {
  locale: SupportedLocale;
}

export function UpdateDialog({ locale }: UpdateDialogProps) {
  const dict = getDictionary(locale).update;
  const {
    update,
    isDialogOpen,
    status,
    progress,
    checkForUpdate,
    installUpdate,
    dismiss,
  } = useUpdateStore();

  useEffect(() => {
    void checkForUpdate();
    const timer = setInterval(
      () => void checkForUpdate(),
      6 * 60 * 60 * 1000
    );
    return () => clearInterval(timer);
  }, [checkForUpdate]);

  if (!update || !isDialogOpen) return null;

  const isInstalling = status === "installing";

  return (
    <ModalDialog
      isOpen
      onClose={dismiss}
      title={dict.title}
      subtitle={dict.versionLine.replace("{version}", update.version)}
      maxWidthClass="max-w-md"
      isDismissible={!isInstalling}
    >
      {update.body && (
        <div className="mb-4">
          <h3 className="mb-1.5 text-xs font-semibold text-slate-200">
            {dict.notesHeading}
          </h3>
          <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-300">
            {update.body}
          </p>
        </div>
      )}

      {isInstalling && (
        <div className="mb-4">
          <div
            role="progressbar"
            aria-label={dict.downloading}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress ?? undefined}
            className="h-2 overflow-hidden rounded-full bg-slate-800"
          >
            <div
              className={`h-full rounded-full bg-orange-500 transition-all ${
                progress === null ? "w-1/3 animate-pulse" : ""
              }`}
              style={progress === null ? undefined : { width: `${progress}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            {progress === null
              ? dict.downloading
              : `${dict.downloading} ${progress}%`}
          </p>
        </div>
      )}

      {status === "failed" && (
        <p role="alert" className="mb-4 text-xs text-rose-300">
          {dict.installFailed}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={dismiss}
          disabled={isInstalling}
          className="inline-flex h-10 items-center rounded-lg border border-slate-700/90 bg-slate-950 px-5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-slate-50 disabled:opacity-50"
        >
          {dict.later}
        </button>
        <button
          type="button"
          onClick={() => void installUpdate()}
          disabled={isInstalling}
          className="inline-flex h-10 items-center rounded-lg bg-orange-600 px-5 text-xs font-semibold text-white shadow-md shadow-orange-600/20 transition hover:bg-orange-500 disabled:opacity-50"
        >
          {dict.updateNow}
        </button>
      </div>
    </ModalDialog>
  );
}
