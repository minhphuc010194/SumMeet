import type { Meeting } from "@/types/meeting";

export function formatTimestampMmSs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const secs = String(totalSec % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

export function generateMeetingMarkdown(meeting: Meeting): string {
  const dateStr = new Date(meeting.createdAt).toLocaleString("vi-VN");
  const durationMins = Math.max(1, Math.round(meeting.durationSeconds / 60));

  const actionLines =
    meeting.summary.actionItems.length > 0
      ? meeting.summary.actionItems
          .map(
            (item) =>
              `- [${item.completed ? "x" : " "}] **${item.assignee}**: ${item.task} *(Due: ${item.dueDate})*`
          )
          .join("\n")
      : "- None recorded";

  const decisionLines =
    meeting.summary.keyDecisions.length > 0
      ? meeting.summary.keyDecisions.map((d) => `- ${d}`).join("\n")
      : "- None recorded";

  const outlineLines = meeting.summary.outline
    .map((sec) => {
      const bullets = sec.bullets.map((b) => `  - ${b}`).join("\n");
      return `### [${formatTimestampMmSs(sec.timestampMs)}] ${sec.title}\n${bullets}`;
    })
    .join("\n\n");

  const transcriptLines = meeting.segments
    .map((seg) => {
      const channelBadge =
        seg.channel === "mic_user" ? "🎙️ Mic" : "🎧 System Audio";
      return `- **[${formatTimestampMmSs(seg.startMs)}]** **${seg.speakerName}** *(${channelBadge})*: ${seg.text}`;
    })
    .join("\n");

  return [
    `# ${meeting.title}`,
    "",
    `- **Date**: ${dateStr}`,
    `- **Duration**: ${durationMins} mins`,
    `- **Audio Device**: ${meeting.audioDeviceUsed} (${meeting.isHeadphoneSession ? "Headphone/AirPods Dual-Stream" : "Speaker Mode"})`,
    `- **Participants**: ${meeting.participants.join(", ")}`,
    `- **AI Model**: ${meeting.summary.providerUsed}`,
    "",
    "---",
    "",
    "## Executive Summary",
    meeting.summary.overview,
    "",
    "## Action Items",
    actionLines,
    "",
    "## Key Decisions",
    decisionLines,
    "",
    "## Topic Outline",
    outlineLines,
    "",
    "---",
    "",
    "## Full Diarized Transcript",
    transcriptLines,
  ].join("\n");
}
