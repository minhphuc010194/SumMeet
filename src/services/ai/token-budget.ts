import type { ChatMessage, TranscriptSegment } from "@/types/meeting";
import { formatSegmentsForPrompt } from "@/services/ai/prompts";

export const DEFAULT_MAX_CONTEXT_TOKENS = 6000;

/**
 * Estimates token count using a conservative ~3.8 characters per token heuristic
 * suitable for mixed English and Vietnamese UTF-8 text.
 */
export function estimateTokenCount(text: string): number {
  if (!text) {
    return 0;
  }
  return Math.ceil(text.length / 3.8);
}

/**
 * Truncates transcript segments to fit within a target token budget,
 * prioritizing the opening context and the most recent discussion segments.
 */
export function fitTranscriptToTokenBudget(
  segments: TranscriptSegment[],
  maxTokens = DEFAULT_MAX_CONTEXT_TOKENS
): { formattedTranscript: string; estimatedTokens: number; wasTruncated: boolean } {
  const fullFormatted = formatSegmentsForPrompt(segments);
  const fullTokens = estimateTokenCount(fullFormatted);

  if (fullTokens <= maxTokens) {
    return {
      formattedTranscript: fullFormatted,
      estimatedTokens: fullTokens,
      wasTruncated: false,
    };
  }

  // Keep the first 25% of budget for meeting introductions/agenda and 75% for latest segments
  const headCount = Math.max(1, Math.floor(segments.length * 0.25));
  const headSegments = segments.slice(0, headCount);
  const tailSegments = segments.slice(headCount);

  const selectedTail: TranscriptSegment[] = [];
  let runningTokens = estimateTokenCount(formatSegmentsForPrompt(headSegments));

  for (let i = tailSegments.length - 1; i >= 0; i--) {
    const candidateText = formatSegmentsForPrompt([tailSegments[i]]);
    const candidateTokens = estimateTokenCount(candidateText);
    if (runningTokens + candidateTokens > maxTokens - 40) {
      break;
    }
    selectedTail.unshift(tailSegments[i]);
    runningTokens += candidateTokens;
  }

  const combinedText = [
    formatSegmentsForPrompt(headSegments),
    "... [TRANSCRIPT MIDDLE TRUNCATED FOR TOKEN BUDGET] ...",
    formatSegmentsForPrompt(selectedTail),
  ].join("\n");

  return {
    formattedTranscript: combinedText,
    estimatedTokens: estimateTokenCount(combinedText),
    wasTruncated: true,
  };
}

/**
 * Truncates conversation history to keep recent turns within token budget.
 */
export function fitChatHistoryToTokenBudget(
  messages: ChatMessage[],
  maxTokens = 1200
): string {
  const selectedLines: string[] = [];
  let currentTokens = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const line = `${msg.role.toUpperCase()}: ${msg.content}`;
    const lineTokens = estimateTokenCount(line);
    if (currentTokens + lineTokens > maxTokens) {
      break;
    }
    selectedLines.unshift(line);
    currentTokens += lineTokens;
  }

  return selectedLines.join("\n");
}
