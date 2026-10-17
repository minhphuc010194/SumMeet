"use client";

import React, { useEffect, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { ModalDialog } from "@/components/common/ModalDialog";
import { OpenRouterKeyForm } from "@/components/onboarding/OpenRouterKeyForm";
import { UpdateSettingsSection } from "@/components/update/UpdateEntryPoints";
import type { Dictionary } from "@/i18n/dictionaries";
import { DEFAULT_OPENROUTER_MODEL } from "@/services/ai/provider-registry";
import {
  getAutostartEnabled,
  setAutostartEnabled,
} from "@/services/autostart";
import type { AIProviderSettings } from "@/types/meeting";
import { useMeetingStore } from "@/store/meeting-store";

interface AIProviderSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  dict: Dictionary;
  onToast: (message: string) => void;
}

type EditableSettings = Pick<
  AIProviderSettings,
  "openRouterModel" | "transcriptionLanguage" | "callDetectionEnabled"
>;

const FIELD_CLASS =
  "h-8 w-full rounded-lg border border-slate-700/90 bg-slate-950 px-3 text-xs text-slate-100 placeholder-slate-500 transition focus:border-orange-500 focus:outline-none";

const LABEL_CLASS = "mb-1.5 flex items-center text-xs font-medium text-slate-300";

export function AIProviderSettingsModal({
  isOpen,
  onClose,
  dict,
  onToast,
}: AIProviderSettingsModalProps) {
  const { settings, updateSettings, removeOpenRouterKey } = useMeetingStore();
  const [formState, setFormState] = useState<EditableSettings>(settings);
  const [osAutostart, setOsAutostart] = useState(false);
  const [autostartChoice, setAutostartChoice] = useState<boolean | null>(null);
  const autostart = autostartChoice ?? osAutostart;

  useEffect(() => {
    if (isOpen) {
      setFormState(settings);
      setAutostartChoice(null);
    }
  }, [settings, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    void getAutostartEnabled().then((result) => {
      if (!result.success) {
        onToast(dict.settings.autostartReadError);
        return;
      }
      setOsAutostart(result.data ?? false);
    });
  }, [isOpen, onToast, dict.settings.autostartReadError]);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    updateSettings({
      openRouterModel:
        formState.openRouterModel.trim() || DEFAULT_OPENROUTER_MODEL,
      transcriptionLanguage: formState.transcriptionLanguage,
      callDetectionEnabled: formState.callDetectionEnabled,
    });
    const autostartResult =
      autostart === osAutostart
        ? { success: true }
        : await setAutostartEnabled(autostart);
    onToast(
      autostartResult.success
        ? dict.settings.savedToast
        : dict.settings.autostartSaveError
    );
    onClose();
  };

  const handleRemoveKey = async () => {
    const result = await removeOpenRouterKey(dict.locale);
    if (!result.success) {
      onToast(result.error ?? dict.errors.keychainError);
    }
  };

  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={onClose}
      title={dict.settings.title}
      subtitle={dict.settings.subtitle}
    >
      <div className="space-y-3.5">
        <section className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-3.5">
          <h3 className="mb-2.5 border-b border-emerald-500/20 pb-2 text-xs font-bold text-emerald-300">
            {dict.settings.keyTitle}
          </h3>
          <OpenRouterKeyForm
            dict={dict}
            label={dict.settings.keyChangeLabel}
            submitLabel={dict.settings.keyChangeButton}
            onSaved={() => onToast(dict.settings.keySavedToast)}
          />
          <button
            type="button"
            onClick={handleRemoveKey}
            className="mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/20 px-3 text-xs font-medium text-rose-300 transition hover:bg-rose-900/40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {dict.settings.keyRemoveButton}
          </button>
        </section>

        <UpdateSettingsSection locale={dict.locale} />

        <form onSubmit={handleSave} className="space-y-3.5">
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            <div className="flex flex-col">
              <label htmlFor="settings-openrouter-model" className={LABEL_CLASS}>
                {dict.settings.modelLabel}
              </label>
              <input
                id="settings-openrouter-model"
                type="text"
                value={formState.openRouterModel}
                onChange={(e) =>
                  setFormState({ ...formState, openRouterModel: e.target.value })
                }
                placeholder={DEFAULT_OPENROUTER_MODEL}
                spellCheck={false}
                className={FIELD_CLASS}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                {dict.settings.modelHint}
              </p>
            </div>

            <div className="flex flex-col">
              <label htmlFor="settings-language" className={LABEL_CLASS}>
                {dict.settings.languageLabel}
              </label>
              <select
                id="settings-language"
                value={formState.transcriptionLanguage}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    transcriptionLanguage: e.target
                      .value as AIProviderSettings["transcriptionLanguage"],
                  })
                }
                className={FIELD_CLASS}
              >
                <option value="vi">{dict.settings.languageOptions.vi}</option>
                <option value="en">{dict.settings.languageOptions.en}</option>
                <option value="auto">{dict.settings.languageOptions.auto}</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col">
            <label
              htmlFor="settings-call-detection"
              className="flex items-center gap-2 text-xs font-medium text-slate-300"
            >
              <input
                id="settings-call-detection"
                type="checkbox"
                checked={formState.callDetectionEnabled}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    callDetectionEnabled: e.target.checked,
                  })
                }
                className="h-3.5 w-3.5 accent-orange-500"
              />
              {dict.settings.callDetectionLabel}
            </label>
            <p className="mt-0.5 pl-5.5 text-[11px] text-slate-500">
              {dict.settings.callDetectionHint}
            </p>
          </div>

          <div className="flex flex-col">
            <label
              htmlFor="settings-autostart"
              className="flex items-center gap-2 text-xs font-medium text-slate-300"
            >
              <input
                id="settings-autostart"
                type="checkbox"
                checked={autostart}
                onChange={(e) => setAutostartChoice(e.target.checked)}
                className="h-3.5 w-3.5 accent-orange-500"
              />
              {dict.settings.autostartLabel}
            </label>
            <p className="mt-0.5 pl-5.5 text-[11px] text-slate-500">
              {dict.settings.autostartHint}
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-lg border border-slate-700 bg-slate-800 px-3.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700"
            >
              {dict.settings.closeButton}
            </button>
            <button
              type="submit"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-orange-600 px-4 text-xs font-semibold text-white shadow-sm shadow-orange-600/20 transition hover:bg-orange-500"
            >
              <Save className="h-3.5 w-3.5" />
              {dict.settings.saveButton}
            </button>
          </div>
        </form>
      </div>
    </ModalDialog>
  );
}
