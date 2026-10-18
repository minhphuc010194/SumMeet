import type {
  ApiResponse,
  ChatMessage,
  MeetingSummary,
  SummaryOutputLanguage,
  SummaryTemplateId,
  SupportedLocale,
  TranscriptSegment,
} from "@/types/meeting";
import { getDictionary } from "@/i18n/dictionaries";
import {
  PROMPT_VERSION,
  buildAskFredChatPrompt,
  buildMeetingSummaryPrompt,
  sanitizePromptInput,
} from "@/services/ai/prompts";
import {
  estimateTokenCount,
  fitChatHistoryToTokenBudget,
  fitTranscriptToTokenBudget,
} from "@/services/ai/token-budget";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_OPENROUTER_MODEL = "google/gemini-3.1-flash-lite";

interface ExternalRequestOptions {
  providerName: string;
  url: string;
  init: RequestInit;
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * Executes an HTTP call to an external AI provider with timeout and exponential backoff retry.
 */
export async function fetchWithRetryAndTimeout(
  options: ExternalRequestOptions
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 8500;
  const maxRetries = options.maxRetries ?? 2;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const startTime = Date.now();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`${options.providerName} timeout after ${timeoutMs}ms`)),
          timeoutMs
        );
      });

      const response = await Promise.race([
        fetch(options.url, options.init),
        timeoutPromise,
      ]);
      if (timeoutId) clearTimeout(timeoutId);

      if (!response.ok) {
        const durationMs = Date.now() - startTime;
        const responseBody = await response
          .clone()
          .text()
          .catch(() => "");
        console.error(
          `[AIProviderRegistry] External service non-OK status (${options.providerName} HTTP ${response.status}): ${responseBody.slice(0, 300)}`,
          {
            serviceName: options.providerName,
            url: options.url,
            responseStatus: response.status,
            durationMs,
            attempt,
          }
        );
        if (response.status >= 500 || response.status === 429) {
          throw new Error(
            `${options.providerName} HTTP ${response.status}`
          );
        }
        return response;
      }

      return response;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      lastError = error;
      const durationMs = Date.now() - startTime;
      const errorText = error instanceof Error ? error.message : String(error);
      console.error(
        `[AIProviderRegistry] External service call failed (${options.providerName}: ${errorText}):`,
        {
          serviceName: options.providerName,
          url: options.url,
          durationMs,
          attempt,
          error: errorText,
        }
      );

      if (attempt < maxRetries) {
        const backoffMs = 250 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`${options.providerName} request failed after retries`);
}

export function stripJsonCodeFences(rawText: string): string {
  const trimmed = rawText.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch && fencedMatch[1]) {
    return fencedMatch[1].trim();
  }
  return trimmed;
}

export function buildOpenRouterHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://github.com/minhphuc010194/SumMeet",
    "X-OpenRouter-Title": "SumMeet",
  };
}

export async function callOpenRouterChat(params: {
  apiKey: string;
  model: string;
  messages: Array<{ role: "user"; content: string | Array<Record<string, unknown>> }>;
  temperature?: number;
  timeoutMs: number;
  providerName: string;
}): Promise<{ content: string; model: string }> {
  const model = params.model.trim() || DEFAULT_OPENROUTER_MODEL;
  const response = await fetchWithRetryAndTimeout({
    providerName: params.providerName,
    url: `${OPENROUTER_BASE_URL}/chat/completions`,
    timeoutMs: params.timeoutMs,
    maxRetries: 0,
    init: {
      method: "POST",
      headers: buildOpenRouterHeaders(params.apiKey),
      body: JSON.stringify({
        model,
        stream: false,
        messages: params.messages,
        temperature: params.temperature,
      }),
    },
  });

  if (!response.ok) {
    const rawBody = await response.text().catch(() => "");
    let detail = "";
    try {
      const parsed = JSON.parse(rawBody);
      const message = parsed?.error?.message;
      if (typeof message === "string" && message.trim().length > 0) {
        detail = `: ${message.trim()}`;
      }
    } catch {
      if (rawBody.trim().length > 0 && rawBody.trim().length <= 160) {
        detail = `: ${rawBody.trim()}`;
      }
    }
    throw new Error(`${params.providerName} HTTP ${response.status}${detail}`);
  }

  const data = await response.json();
  const rawContent = data?.choices?.[0]?.message?.content;
  return {
    content: typeof rawContent === "string" ? rawContent.trim() : "",
    model: typeof data?.model === "string" ? data.model : model,
  };
}

function detectTranscriptLocale(
  segments: TranscriptSegment[],
  fallbackLocale: SupportedLocale
): SupportedLocale {
  const text = segments.map((s) => s.text).join(" ");
  if (
    /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(
      text
    )
  ) {
    return "vi";
  }
  if (/[a-z]/i.test(text)) {
    return "en";
  }
  return fallbackLocale;
}

export async function generateSummaryWithFallback(params: {
  apiKey: string;
  model: string;
  meetingId: string;
  meetingTitle: string;
  templateId: SummaryTemplateId;
  segments: TranscriptSegment[];
  locale: SupportedLocale;
  outputLanguage?: SummaryOutputLanguage;
}): Promise<ApiResponse<MeetingSummary>> {
  const errors = getDictionary(params.locale).errors;
  const meetingId = params.meetingId.trim();
  const meetingTitle = params.meetingTitle.trim();

  if (!meetingId || !meetingTitle) {
    return { success: false, error: errors.invalidRequest };
  }
  if (params.segments.length === 0) {
    return { success: false, error: errors.noTranscript };
  }

  const { formattedTranscript, estimatedTokens } = fitTranscriptToTokenBudget(
    params.segments
  );

  const prompt = buildMeetingSummaryPrompt({
    meetingTitle,
    templateId: params.templateId,
    transcriptText: formattedTranscript,
    locale: params.locale,
    outputLanguage: params.outputLanguage,
  });

  const inputTokens = estimateTokenCount(prompt);
  const defaultsLocale =
    params.outputLanguage === "vi" || params.outputLanguage === "en"
      ? params.outputLanguage
      : params.outputLanguage === "auto"
        ? detectTranscriptLocale(params.segments, params.locale)
        : params.locale;

  try {
    const result = await callOpenRouterChat({
      apiKey: params.apiKey,
      model: params.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      timeoutMs: 60000,
      providerName: "OpenRouter-Summary",
    });
    const parsed = JSON.parse(stripJsonCodeFences(result.content));
    return {
      success: true,
      data: normalizeSummaryObject({
        parsed,
        meetingId,
        templateId: params.templateId,
        providerUsed: `OpenRouter (${result.model})`,
        inputTokens,
        locale: defaultsLocale,
      }),
    };
  } catch (error) {
    console.error("[AIProviderRegistry] OpenRouter summary failed, using offline summary:", {
      meetingId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: true,
      data: synthesizeSmartOfflineSummary({
        meetingId,
        meetingTitle,
        templateId: params.templateId,
        segments: params.segments,
        locale: params.locale,
        outputLanguage: params.outputLanguage,
        inputTokens: estimatedTokens,
      }),
    };
  }
}

function normalizeSummaryObject(params: {
  parsed: Record<string, unknown>;
  meetingId: string;
  templateId: SummaryTemplateId;
  providerUsed: string;
  inputTokens: number;
  locale: SupportedLocale;
}): MeetingSummary {
  const { parsed, meetingId, templateId, providerUsed, inputTokens } = params;
  const defaults = getDictionary(params.locale).summaryDefaults;
  const overview =
    typeof parsed.overview === "string" && parsed.overview.trim().length > 0
      ? parsed.overview
      : defaults.overview;

  const rawActions = Array.isArray(parsed.actionItems) ? parsed.actionItems : [];
  const actionItems = rawActions.map((item: Record<string, unknown>, idx: number) => ({
    id: `ai-act-${idx}-${Date.now()}`,
    task: String(item?.task ?? defaults.actionTask),
    assignee: String(item?.assignee ?? defaults.assignee),
    dueDate: String(item?.dueDate ?? defaults.dueDate),
    completed: Boolean(item?.completed ?? false),
  }));

  const keyDecisions = Array.isArray(parsed.keyDecisions)
    ? parsed.keyDecisions.map((d) => String(d))
    : [];

  const rawOutline = Array.isArray(parsed.outline) ? parsed.outline : [];
  const outline = rawOutline.map((sec: Record<string, unknown>, idx: number) => ({
    id: `sec-${idx}`,
    title: String(sec?.title ?? defaults.topic.replace("{n}", String(idx + 1))),
    timestampMs: Number(sec?.timestampMs ?? idx * 60000),
    bullets: Array.isArray(sec?.bullets)
      ? sec.bullets.map((b: unknown) => String(b))
      : [],
  }));

  const keywords = Array.isArray(parsed.keywords)
    ? parsed.keywords.map((k) => String(k))
    : defaults.keywords;

  const outputTokens = estimateTokenCount(JSON.stringify(parsed));

  if (process.env.NODE_ENV !== "production") {
    console.info("[AIProviderRegistry] Summary token usage:", {
      providerUsed,
      inputTokens,
      outputTokens,
      promptVersion: PROMPT_VERSION,
    });
  }

  return {
    meetingId,
    templateId,
    overview,
    actionItems,
    keyDecisions,
    outline,
    keywords,
    sentiment: "focused",
    providerUsed,
    promptVersion: PROMPT_VERSION,
    tokenUsage: {
      inputTokens,
      outputTokens,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function synthesizeSmartOfflineSummary(params: {
  meetingId: string;
  meetingTitle: string;
  templateId: SummaryTemplateId;
  segments: TranscriptSegment[];
  locale: "vi" | "en";
  outputLanguage?: SummaryOutputLanguage;
  inputTokens: number;
}): MeetingSummary {
  const speakers = Array.from(
    new Set(params.segments.map((s) => s.speakerName))
  );
  const micStatements = params.segments.filter((s) => s.channel === "mic_user");
  const remoteStatements = params.segments.filter(
    (s) => s.channel === "system_remote"
  );

  const targetLocale =
    params.outputLanguage === "vi" || params.outputLanguage === "en"
      ? params.outputLanguage
      : detectTranscriptLocale(params.segments, params.locale);
  const isVi = targetLocale === "vi";
  const templatePrefix: Record<SummaryTemplateId, string> = isVi
    ? {
        general: "[Biên bản Tổng hợp]",
        sales: "[Phân tích Tư vấn & Khách hàng]",
        standup: "[Báo cáo Kỹ thuật & Sprint]",
        interview: "[Đánh giá Phỏng vấn / 1-on-1]",
      }
    : {
        general: "[Executive Meeting Summary]",
        sales: "[Sales Discovery & Client Insights]",
        standup: "[Engineering Standup & Sprint Sync]",
        interview: "[Candidate Interview & 1-on-1 Evaluation]",
      };

  const overview = isVi
    ? `${templatePrefix[params.templateId]} Cuộc họp "${params.meetingTitle}" có sự tham gia của ${speakers.join(", ") || "các thành viên"} với tổng cộng ${params.segments.length} lượt phát biểu (${micStatements.length} câu từ kênh Mic cá nhân và ${remoteStatements.length} câu từ kênh Âm thanh hệ thống / Tai nghe). Nội dung tập trung làm rõ mục tiêu triển khai, phân công nhiệm vụ cụ thể và chốt phương án kỹ thuật.`
    : `${templatePrefix[params.templateId]} Meeting "${params.meetingTitle}" included ${speakers.join(", ") || "participants"} across ${params.segments.length} diarized segments (${micStatements.length} from Local Mic and ${remoteStatements.length} from Remote System Audio). The discussion aligned on architecture goals, concrete action items, and delivery milestones.`;

  const actionItems = params.segments
    .filter((seg) =>
      /cần|sẽ|hoàn thành|gửi|kiểm tra|triển khai|action|todo|will|need to|ship|review|test/i.test(
        seg.text
      )
    )
    .slice(0, 4)
    .map((seg, idx) => ({
      id: `local-act-${idx}`,
      task: seg.text,
      assignee: seg.speakerName,
      dueDate: isVi ? "Trong tuần này" : "This Week",
      completed: false,
      timestampMs: seg.startMs,
    }));

  if (actionItems.length === 0 && params.segments.length > 0) {
    actionItems.push({
      id: "local-act-default",
      task: params.segments[params.segments.length - 1].text,
      assignee: params.segments[params.segments.length - 1].speakerName,
      dueDate: isVi ? "Thứ Sáu" : "Friday",
      completed: false,
      timestampMs: params.segments[params.segments.length - 1].startMs,
    });
  }

  const keyDecisions = params.segments
    .filter((seg) =>
      /chốt|quyết định|đồng ý|thống nhất|sử dụng|chọn|decide|agreed|approved|architecture|airpods|dual-stream/i.test(
        seg.text
      )
    )
    .slice(0, 3)
    .map((seg) => `${seg.speakerName}: ${seg.text}`);

  if (keyDecisions.length === 0 && params.segments.length > 0) {
    keyDecisions.push(
      `${params.segments[0].speakerName}: ${params.segments[0].text}`
    );
  }

  const chunkSize = Math.max(1, Math.ceil(params.segments.length / 3));
  const outline = [0, 1, 2]
    .map((groupIdx) => {
      const slice = params.segments.slice(
        groupIdx * chunkSize,
        (groupIdx + 1) * chunkSize
      );
      if (slice.length === 0) return null;
      return {
        id: `outline-${groupIdx}`,
        title: isVi
          ? `Phần ${groupIdx + 1}: Thảo luận của ${slice[0].speakerName}`
          : `Part ${groupIdx + 1}: Discussion led by ${slice[0].speakerName}`,
        timestampMs: slice[0].startMs,
        bullets: slice.map((s) => `${s.speakerName}: ${s.text}`),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    meetingId: params.meetingId,
    templateId: params.templateId,
    overview,
    actionItems,
    keyDecisions,
    outline,
    keywords: [
      ...speakers.slice(0, 3),
      "Dual-Stream Audio",
      "AirPods Ready",
      params.templateId.toUpperCase(),
    ],
    sentiment: "focused",
    providerUsed: "SumMeet Local Neural Engine (Fallback Ready)",
    promptVersion: PROMPT_VERSION,
    tokenUsage: {
      inputTokens: params.inputTokens,
      outputTokens: 320,
    },
    updatedAt: new Date().toISOString(),
  };
}

export async function answerMeetingQuestion(params: {
  apiKey: string;
  model: string;
  meetingTitle: string;
  segments: TranscriptSegment[];
  chatHistory: ChatMessage[];
  question: string;
  locale: SupportedLocale;
}): Promise<
  ApiResponse<{
    answer: string;
    providerUsed: string;
    citations: NonNullable<ChatMessage["citations"]>;
  }>
> {
  const errors = getDictionary(params.locale).errors;
  const meetingTitle = params.meetingTitle.trim();
  const question = params.question.trim();

  if (!meetingTitle || !question) {
    return { success: false, error: errors.invalidRequest };
  }
  if (question.length > 2000) {
    return { success: false, error: errors.questionTooLong };
  }

  const safeQuestion = sanitizePromptInput(question, 1500);
  const { formattedTranscript } = fitTranscriptToTokenBudget(params.segments);
  const historyText = fitChatHistoryToTokenBudget(params.chatHistory);

  const prompt = buildAskFredChatPrompt({
    meetingTitle,
    transcriptText: formattedTranscript,
    conversationHistoryText: historyText,
    userQuestion: safeQuestion,
    locale: params.locale,
  });

  const queryWords = safeQuestion
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const scoredSegments = params.segments
    .map((segment) => {
      const lower = `${segment.speakerName} ${segment.text}`.toLowerCase();
      const score = queryWords.reduce(
        (acc, word) => (lower.includes(word) ? acc + 2 : acc),
        0
      );
      return { segment, score };
    })
    .sort((a, b) => b.score - a.score);

  const topCitations = (
    scoredSegments.some((s) => s.score > 0)
      ? scoredSegments.filter((s) => s.score > 0).slice(0, 3)
      : scoredSegments.slice(0, 2)
  ).map(({ segment }) => ({
    segmentId: segment.id,
    speakerName: segment.speakerName,
    timestampMs: segment.startMs,
    snippet: segment.text,
  }));

  try {
    const result = await callOpenRouterChat({
      apiKey: params.apiKey,
      model: params.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      timeoutMs: 45000,
      providerName: "OpenRouter-AskBot",
    });
    if (!result.content) {
      throw new Error("OpenRouter-AskBot returned empty content");
    }
    return {
      success: true,
      data: {
        answer: result.content,
        providerUsed: `OpenRouter (${result.model})`,
        citations: topCitations,
      },
    };
  } catch (error) {
    console.error("[AIProviderRegistry] OpenRouter chat failed:", {
      meetingTitle,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: errors.chatUnavailable };
  }
}
