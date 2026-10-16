"use client";

import React, { useState } from "react";
import {
  Bot,
  Clock,
  MessageSquarePlus,
  Send,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import type { Dictionary } from "@/i18n/dictionaries";
import type {
  ChatMessage,
  Meeting,
  SupportedLocale,
} from "@/types/meeting";
import { answerMeetingQuestion } from "@/services/ai/provider-registry";
import { formatTimestampMmSs } from "@/services/export/export-service";
import { useMeetingStore } from "@/store/meeting-store";

interface AskFredChatPanelProps {
  meeting: Meeting;
  dict: Dictionary;
  locale: SupportedLocale;
  onToast: (message: string) => void;
}

export function AskFredChatPanel({
  meeting,
  dict,
  locale,
  onToast,
}: AskFredChatPanelProps) {
  const {
    settings,
    openRouterKey,
    appendChatMessage,
    clearChatHistory,
    setCurrentAudioTimeMs,
  } = useMeetingStore();

  const [questionInput, setQuestionInput] = useState("");
  const [isAsking, setIsAsking] = useState(false);

  const handleAskQuestion = async (rawQuestion: string) => {
    const question = rawQuestion.trim();
    if (!question || isAsking) return;

    const userMessage: ChatMessage = {
      id: `chat-u-${Date.now()}`,
      meetingId: meeting.id,
      role: "user",
      content: question,
      createdAt: new Date().toISOString(),
    };

    appendChatMessage(meeting.id, userMessage);
    setQuestionInput("");
    setIsAsking(true);

    try {
      const result = await answerMeetingQuestion({
        apiKey: openRouterKey,
        model: settings.openRouterModel,
        meetingTitle: meeting.title,
        segments: meeting.segments,
        chatHistory: meeting.chatMessages,
        question,
        locale,
      });

      if (result.success && result.data) {
        appendChatMessage(meeting.id, {
          id: `chat-a-${Date.now()}`,
          meetingId: meeting.id,
          role: "assistant",
          content: result.data.answer,
          citations: result.data.citations,
          providerUsed: result.data.providerUsed,
          createdAt: new Date().toISOString(),
        });
      } else {
        const errorMessage = result.error ?? dict.errors.chatUnavailable;
        onToast(errorMessage);
        appendChatMessage(meeting.id, {
          id: `chat-err-${Date.now()}`,
          meetingId: meeting.id,
          role: "assistant",
          content: errorMessage,
          createdAt: new Date().toISOString(),
        });
      }
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-500/20 text-orange-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-50">
              {dict.askFred.title}
            </h3>
            <p className="text-[11px] text-slate-400">
              {dict.askFred.subtitle}
            </p>
          </div>
        </div>

        {meeting.chatMessages.length > 0 && (
          <button
            type="button"
            onClick={() => clearChatHistory(meeting.id)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-[11px] text-slate-400 hover:border-slate-700 hover:text-rose-300"
          >
            <Trash2 className="h-3 w-3" />
            {dict.askFred.clearHistory}
          </button>
        )}
      </div>

      {/* Suggested Prompts */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {dict.askFred.suggestedQuestions.map((promptText, idx) => (
          <button
            key={idx}
            type="button"
            disabled={isAsking}
            onClick={() => handleAskQuestion(promptText)}
            className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-950/30 px-2.5 py-1 text-[11px] text-orange-200 transition hover:border-orange-400 hover:bg-orange-900/40 disabled:opacity-50"
          >
            <MessageSquarePlus className="h-3 w-3 text-orange-400" />
            {promptText}
          </button>
        ))}
      </div>

      {/* Messages Container */}
      <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
        {meeting.chatMessages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2.5 rounded-xl border p-3 ${
              msg.role === "user"
                ? "ml-6 border-orange-500/30 bg-orange-950/30"
                : "mr-2 border-slate-800 bg-slate-950/70"
            }`}
          >
            <div
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                msg.role === "user"
                  ? "bg-orange-600 text-white"
                  : "bg-emerald-500/20 text-emerald-300"
              }`}
            >
              {msg.role === "user" ? (
                <User className="h-3.5 w-3.5" />
              ) : (
                <Bot className="h-3.5 w-3.5" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="whitespace-pre-line text-xs leading-relaxed text-slate-100">
                {msg.content}
              </div>

              {msg.citations && msg.citations.length > 0 && (
                <div className="mt-2.5 border-t border-slate-800/80 pt-2">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase">
                    {dict.askFred.citationsLabel}
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {msg.citations.map((cit) => (
                      <button
                        key={cit.segmentId}
                        type="button"
                        onClick={() => setCurrentAudioTimeMs(cit.timestampMs)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-[10px] text-orange-300 hover:border-orange-500 hover:bg-orange-950"
                      >
                        <Clock className="h-2.5 w-2.5" />
                        [{formatTimestampMmSs(cit.timestampMs)}]{" "}
                        {cit.speakerName}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {msg.providerUsed && (
                <div className="mt-1.5 text-[10px] text-slate-500">
                  ⚡ {msg.providerUsed}
                </div>
              )}
            </div>
          </div>
        ))}

        {isAsking && (
          <div className="mr-2 flex gap-2.5 rounded-xl border border-orange-500/30 bg-slate-950/80 p-3">
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300">
              <Bot className="h-3.5 w-3.5 animate-spin" />
            </div>
            <div className="flex-1 whitespace-pre-line text-xs leading-relaxed text-slate-200">
              {dict.askFred.thinking}
            </div>
          </div>
        )}
      </div>

      {/* Chat Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAskQuestion(questionInput);
        }}
        className="mt-3 flex items-center gap-2 border-t border-slate-800 pt-3"
      >
        <input
          type="text"
          value={questionInput}
          onChange={(e) => setQuestionInput(e.target.value)}
          placeholder={dict.askFred.inputPlaceholder}
          aria-label={dict.askFred.inputPlaceholder}
          className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-orange-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isAsking || !questionInput.trim()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-orange-500 disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
          {dict.askFred.sendButton}
        </button>
      </form>
    </div>
  );
}
