"use client";

import React, { useState } from "react";
import {
  CheckCircle2,
  Circle,
  Clock,
  Cpu,
  FileText,
  ListChecks,
  Sparkles,
  Tag,
  Target,
} from "lucide-react";
import type { Dictionary } from "@/i18n/dictionaries";
import type {
  Meeting,
  SummaryTemplateId,
  SupportedLocale,
} from "@/types/meeting";
import { generateSummaryWithFallback } from "@/services/ai/provider-registry";
import { formatTimestampMmSs } from "@/services/export/export-service";
import { useMeetingStore } from "@/store/meeting-store";

interface SmartSummaryPanelProps {
  meeting: Meeting;
  dict: Dictionary;
  locale: SupportedLocale;
  onToast: (message: string) => void;
}

export function SmartSummaryPanel({
  meeting,
  dict,
  locale,
  onToast,
}: SmartSummaryPanelProps) {
  const {
    settings,
    openRouterKey,
    toggleActionItem,
    updateMeetingSummary,
    setCurrentAudioTimeMs,
  } = useMeetingStore();

  const [selectedTemplate, setSelectedTemplate] = useState<SummaryTemplateId>(
    meeting.summary.templateId || "general"
  );
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleRegenerateSummary = async (templateOverride?: SummaryTemplateId) => {
    const targetTemplate = templateOverride ?? selectedTemplate;
    setIsRegenerating(true);

    try {
      const result = await generateSummaryWithFallback({
        apiKey: openRouterKey,
        model: settings.openRouterModel,
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        templateId: targetTemplate,
        segments: meeting.segments,
        locale,
      });

      if (result.success && result.data) {
        updateMeetingSummary(meeting.id, result.data);
        onToast(
          dict.summary.updatedToast.replace(
            "{template}",
            dict.summary.templates[targetTemplate]
          )
        );
      } else {
        onToast(result.error ?? dict.errors.invalidRequest);
      }
    } finally {
      setIsRegenerating(false);
    }
  };

  const { summary } = meeting;

  return (
    <div className="flex h-full flex-col space-y-4 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      {/* Top Template Selector & Regenerate Control */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor="summary-template-select"
            className="text-xs font-medium text-slate-400"
          >
            {dict.summary.templateLabel}
          </label>
          <select
            id="summary-template-select"
            value={selectedTemplate}
            onChange={(e) => {
              const nextTemplate = e.target.value as SummaryTemplateId;
              setSelectedTemplate(nextTemplate);
              handleRegenerateSummary(nextTemplate);
            }}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-100 focus:border-orange-500 focus:outline-none"
          >
            <option value="general">{dict.summary.templates.general}</option>
            <option value="sales">{dict.summary.templates.sales}</option>
            <option value="standup">{dict.summary.templates.standup}</option>
            <option value="interview">{dict.summary.templates.interview}</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-lg border border-slate-700/80 bg-slate-950 px-2.5 py-1 text-[11px] text-slate-400">
            <Cpu className="h-3 w-3 text-orange-400" />
            {dict.summary.providerBadge} {summary.providerUsed}
          </span>

          <button
            type="button"
            disabled={isRegenerating}
            onClick={() => handleRegenerateSummary()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-orange-500 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {isRegenerating
              ? dict.summary.regenerating
              : dict.summary.regenerateButton}
          </button>
        </div>
      </div>

      {/* Executive Overview */}
      <div className="rounded-xl border border-slate-800/90 bg-slate-950/60 p-4">
        <h3 className="flex items-center gap-2 text-xs font-bold tracking-wider text-orange-400 uppercase">
          <FileText className="h-4 w-4" />
          {dict.summary.overviewTitle}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-200">
          {summary.overview}
        </p>
      </div>

      {/* Action Items with Checkboxes & Assignees */}
      <div className="rounded-xl border border-slate-800/90 bg-slate-950/60 p-4">
        <h3 className="flex items-center gap-2 text-xs font-bold tracking-wider text-emerald-400 uppercase">
          <ListChecks className="h-4 w-4" />
          {dict.summary.actionItemsTitle} ({summary.actionItems.length})
        </h3>

        <div className="mt-3 space-y-2.5">
          {summary.actionItems.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-900/70 p-3 transition hover:border-slate-700"
            >
              <button
                type="button"
                onClick={() => toggleActionItem(meeting.id, item.id)}
                className="mt-0.5 flex items-start gap-2.5 text-left"
              >
                {item.completed ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-slate-500" />
                )}
                <div>
                  <p
                    className={`text-xs font-medium ${
                      item.completed
                        ? "text-slate-500 line-through"
                        : "text-slate-100"
                    }`}
                  >
                    {item.task}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                    <span className="rounded-md bg-orange-500/15 px-2 py-0.5 font-medium text-orange-300">
                      @{item.assignee}
                    </span>
                    <span>• {item.dueDate}</span>
                  </div>
                </div>
              </button>

              {typeof item.timestampMs === "number" && (
                <button
                  type="button"
                  onClick={() => setCurrentAudioTimeMs(item.timestampMs!)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-slate-300 hover:bg-orange-600 hover:text-white"
                >
                  <Clock className="h-3 w-3" />
                  {formatTimestampMmSs(item.timestampMs)}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Key Decisions */}
      <div className="rounded-xl border border-slate-800/90 bg-slate-950/60 p-4">
        <h3 className="flex items-center gap-2 text-xs font-bold tracking-wider text-amber-400 uppercase">
          <Target className="h-4 w-4" />
          {dict.summary.keyDecisionsTitle}
        </h3>
        <ul className="mt-2.5 space-y-2">
          {summary.keyDecisions.map((decision, idx) => (
            <li
              key={`dec-${idx}`}
              className="flex items-start gap-2 text-xs leading-relaxed text-slate-200"
            >
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              <span>{decision}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Time-stamped Outline */}
      <div className="rounded-xl border border-slate-800/90 bg-slate-950/60 p-4">
        <h3 className="flex items-center gap-2 text-xs font-bold tracking-wider text-orange-400 uppercase">
          <Clock className="h-4 w-4" />
          {dict.summary.outlineTitle}
        </h3>
        <div className="mt-3 space-y-3">
          {summary.outline.map((sec) => (
            <div
              key={sec.id}
              className="rounded-xl border border-slate-800/70 bg-slate-900/50 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold text-slate-50">
                  {sec.title}
                </h4>
                <button
                  type="button"
                  onClick={() => setCurrentAudioTimeMs(sec.timestampMs)}
                  className="rounded-md bg-orange-500/15 px-2 py-0.5 font-mono text-[11px] text-orange-300 hover:bg-orange-500/30"
                >
                  {formatTimestampMmSs(sec.timestampMs)}
                </button>
              </div>
              <ul className="mt-1.5 space-y-1">
                {sec.bullets.map((b, bIdx) => (
                  <li key={bIdx} className="text-xs text-slate-300">
                    • {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Keywords */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
          <Tag className="h-3.5 w-3.5" />
          {dict.summary.keywordsTitle}:
        </span>
        {summary.keywords.map((kw, idx) => (
          <span
            key={idx}
            className="rounded-full border border-slate-700 bg-slate-800/80 px-2.5 py-0.5 text-[11px] text-slate-300"
          >
            #{kw}
          </span>
        ))}
      </div>
    </div>
  );
}
