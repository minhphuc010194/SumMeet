"use client";

import React, { useId, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import type { Dictionary } from "@/i18n/dictionaries";
import { useMeetingStore } from "@/store/meeting-store";

interface OpenRouterKeyFormProps {
  dict: Dictionary;
  label: string;
  submitLabel: string;
  onSaved?: () => void;
}

const KEY_ACTION_BUTTON_CLASS =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-orange-500/40 bg-orange-500/15 px-3.5 text-xs font-semibold text-orange-200 transition hover:bg-orange-500/25 disabled:opacity-50";

export function OpenRouterKeyForm({
  dict,
  label,
  submitLabel,
  onSaved,
}: OpenRouterKeyFormProps) {
  const saveOpenRouterKey = useMeetingStore((state) => state.saveOpenRouterKey);
  const verifyOpenRouterKey = useMeetingStore(
    (state) => state.verifyOpenRouterKey
  );
  const [keyInput, setKeyInput] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isKeyValid, setIsKeyValid] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const inputId = useId();
  const errorId = useId();
  const isBusy = isSaving || isChecking;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage("");
    setIsKeyValid(false);

    const result = await saveOpenRouterKey({
      key: keyInput,
      locale: dict.locale,
    });

    setIsSaving(false);
    if (!result.success) {
      setErrorMessage(result.error ?? dict.errors.keychainError);
      return;
    }
    setKeyInput("");
    setIsKeyValid(true);
    onSaved?.();
  };

  const handleCheckKey = async () => {
    setIsChecking(true);
    setErrorMessage("");
    setIsKeyValid(false);

    const result = await verifyOpenRouterKey({
      key: keyInput,
      locale: dict.locale,
    });

    setIsChecking(false);
    if (!result.success) {
      setErrorMessage(result.error ?? dict.errors.networkError);
      return;
    }
    setIsKeyValid(true);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5">
      <div className="flex flex-col">
        <label
          htmlFor={inputId}
          className="mb-1 text-xs font-medium text-slate-300"
        >
          {label}
        </label>
        <input
          id={inputId}
          type="password"
          value={keyInput}
          onChange={(e) => {
            setKeyInput(e.target.value);
            if (errorMessage) setErrorMessage("");
            if (isKeyValid) setIsKeyValid(false);
          }}
          placeholder={dict.onboarding.keyPlaceholder}
          autoComplete="off"
          spellCheck={false}
          required
          aria-invalid={errorMessage !== ""}
          aria-describedby={errorMessage ? errorId : undefined}
          className="h-8 w-full rounded-lg border border-slate-700/90 bg-slate-950 px-3 text-xs text-slate-100 placeholder-slate-500 transition focus:border-orange-500 focus:outline-none"
        />
      </div>

      {errorMessage && (
        <p
          id={errorId}
          role="alert"
          className="flex items-center gap-1.5 text-xs text-rose-300"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {errorMessage}
        </p>
      )}

      {isKeyValid && !errorMessage && (
        <p
          role="status"
          className="flex items-center gap-1.5 text-xs text-emerald-300"
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          {dict.settings.keyValidStatus}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={isBusy}
          className={KEY_ACTION_BUTTON_CLASS}
        >
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <KeyRound className="h-3.5 w-3.5" />
          )}
          {isSaving ? dict.onboarding.validating : submitLabel}
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={() => void handleCheckKey()}
          className={KEY_ACTION_BUTTON_CLASS}
        >
          {isChecking ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" />
          )}
          {isChecking ? dict.onboarding.validating : dict.settings.keyCheckButton}
        </button>
      </div>
    </form>
  );
}
