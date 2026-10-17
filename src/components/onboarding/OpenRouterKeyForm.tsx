"use client";

import React, { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Dictionary } from "@/i18n/dictionaries";
import { useMeetingStore } from "@/store/meeting-store";

interface OpenRouterKeyFormProps {
  dict: Dictionary;
  label: string;
  submitLabel: string;
  onSaved?: () => void;
}

export function OpenRouterKeyForm({
  dict,
  label,
  submitLabel,
  onSaved,
}: OpenRouterKeyFormProps) {
  const saveOpenRouterKey = useMeetingStore((state) => state.saveOpenRouterKey);
  const [keyInput, setKeyInput] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const inputId = useId();
  const errorId = useId();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage("");

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
    onSaved?.();
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
          onChange={(e) => setKeyInput(e.target.value)}
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
        <p id={errorId} role="alert" className="text-xs text-rose-300">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={isSaving}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-orange-600 px-3.5 text-xs font-semibold text-white shadow-sm shadow-orange-600/20 transition hover:bg-orange-500 disabled:opacity-50"
      >
        {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {isSaving ? dict.onboarding.validating : submitLabel}
      </button>
    </form>
  );
}
