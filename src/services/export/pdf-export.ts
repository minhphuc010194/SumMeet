import { getDictionary } from "@/i18n/dictionaries";
import {
  formatRecordingDateTime,
  formatTimestampMmSs,
  resolveSummaryOverviewText,
} from "@/services/export/export-service";
import type { Meeting, SupportedLocale } from "@/types/meeting";

const A4_CANVAS_WIDTH_PX = 1191;
const A4_CANVAS_HEIGHT_PX = 1684;
const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const PAGE_MARGIN_X = 88;
const PAGE_TOP_Y = 88;
const PAGE_BOTTOM_Y = 1580;
const CONTENT_MAX_WIDTH = A4_CANVAS_WIDTH_PX - PAGE_MARGIN_X * 2;
const PDF_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export interface SummaryExportSection {
  id:
    | "overview"
    | "actionItems"
    | "keyDecisions"
    | "outline"
    | "keywords"
    | "transcript";
  heading: string;
  paragraphs?: string[];
  items?: string[];
  subsections?: Array<{
    subheading: string;
    bullets: string[];
  }>;
}

export interface SummaryExportDocument {
  title: string;
  metadataLines: string[];
  sections: SummaryExportSection[];
  footerTemplate: string;
}

interface DrawTextOp {
  kind: "text";
  text: string;
  x: number;
  y: number;
  font: string;
  color: string;
}

interface DrawRectOp {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke?: string;
}

type PageDrawOp = DrawTextOp | DrawRectOp;

export function buildSummaryExportDocument(params: {
  meeting: Meeting;
  locale: SupportedLocale;
  includeTranscript?: boolean;
}): SummaryExportDocument {
  const { meeting, locale } = params;
  const includeTranscript = Boolean(params.includeTranscript);
  const dict = getDictionary(locale);
  const overviewText = resolveSummaryOverviewText(meeting, locale);
  const durationMins = Math.max(1, Math.round(meeting.durationSeconds / 60));
  const modeLabel = meeting.isHeadphoneSession
    ? dict.exportModal.headphoneMode
    : dict.exportModal.speakerMode;
  const participantsText =
    meeting.participants.join(", ") || dict.exportModal.emptyItems;

  const metadataLines = [
    `${dict.exportModal.metaDate}: ${formatRecordingDateTime(meeting.createdAt, locale)}`,
    `${dict.exportModal.metaDuration}: ${durationMins} ${dict.exportModal.durationMinutesUnit}`,
    `${dict.exportModal.metaDevice}: ${meeting.audioDeviceUsed} (${modeLabel})`,
    `${dict.exportModal.metaParticipants}: ${participantsText}`,
    `${dict.exportModal.metaModel}: ${meeting.summary.providerUsed}`,
  ];

  const overviewParagraphs = overviewText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const actionItems =
    meeting.summary.actionItems.length > 0
      ? meeting.summary.actionItems.map((item) => {
          const check = item.completed ? "[x]" : "[ ]";
          const timeTag =
            typeof item.timestampMs === "number"
              ? `[${formatTimestampMmSs(item.timestampMs)}] `
              : "";
          return `${check} ${timeTag}@${item.assignee}: ${item.task} (${dict.exportModal.dueLabel}: ${item.dueDate})`;
        })
      : [dict.exportModal.emptyItems];

  const keyDecisions =
    meeting.summary.keyDecisions.length > 0
      ? meeting.summary.keyDecisions
      : [dict.exportModal.emptyItems];

  const outlineSection: SummaryExportSection =
    meeting.summary.outline.length > 0
      ? {
          id: "outline",
          heading: dict.summary.outlineTitle,
          subsections: meeting.summary.outline.map((sec) => ({
            subheading: `[${formatTimestampMmSs(sec.timestampMs)}] ${sec.title}`,
            bullets: sec.bullets,
          })),
        }
      : {
          id: "outline",
          heading: dict.summary.outlineTitle,
          items: [dict.exportModal.emptyItems],
        };

  const formattedKeywords = meeting.summary.keywords
    .map((kw) => kw.replace(/^#+/, "").trim())
    .filter(Boolean)
    .map((kw) => `#${kw}`);

  const sections: SummaryExportSection[] = [
    {
      id: "overview",
      heading: dict.summary.overviewTitle,
      paragraphs:
        overviewParagraphs.length > 0
          ? overviewParagraphs
          : [dict.exportModal.emptyItems],
    },
    {
      id: "actionItems",
      heading: dict.summary.actionItemsTitle,
      items: actionItems,
    },
    {
      id: "keyDecisions",
      heading: dict.summary.keyDecisionsTitle,
      items: keyDecisions,
    },
    outlineSection,
    {
      id: "keywords",
      heading: dict.summary.keywordsTitle,
      paragraphs: [
        formattedKeywords.length > 0
          ? formattedKeywords.join("   ")
          : dict.exportModal.emptyItems,
      ],
    },
  ];

  if (includeTranscript) {
    const transcriptItems =
      meeting.segments.length > 0
        ? meeting.segments.map((seg) => {
            const channelTag =
              seg.channel === "mic_user"
                ? dict.transcript.channelMicTag
                : dict.transcript.channelSystemTag;
            return `[${formatTimestampMmSs(seg.startMs)}] ${seg.speakerName} (${channelTag}): ${seg.text}`;
          })
        : [dict.errors.noTranscript];

    sections.push({
      id: "transcript",
      heading: dict.exportModal.transcriptHeading,
      items: transcriptItems,
    });
  }

  return {
    title: meeting.title,
    metadataLines,
    sections,
    footerTemplate: dict.exportModal.pageFooter,
  };
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  options: { text: string; maxWidth: number }
): string[] {
  const safeMaxWidth = Math.max(40, options.maxWidth);
  const rawLines = options.text.split("\n");
  const wrapped: string[] = [];

  for (const rawLine of rawLines) {
    const words = rawLine.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      wrapped.push("");
      continue;
    }

    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= safeMaxWidth) {
        current = candidate;
        continue;
      }

      if (current) {
        wrapped.push(current);
        current = "";
      }

      if (ctx.measureText(word).width <= safeMaxWidth) {
        current = word;
        continue;
      }

      let chunk = "";
      for (const ch of Array.from(word)) {
        const nextChunk = `${chunk}${ch}`;
        const exceedsWidth = ctx.measureText(nextChunk).width > safeMaxWidth;
        if (chunk && exceedsWidth) {
          wrapped.push(chunk);
          chunk = ch;
        } else {
          chunk = nextChunk;
        }
      }
      current = chunk;
    }

    if (current) {
      wrapped.push(current);
    }
  }

  return wrapped;
}

export function encodeJpegPagesToPdf(
  pages: Array<{ jpegBytes: Uint8Array; widthPx: number; heightPx: number }>
): Uint8Array {
  if (pages.length === 0) {
    throw new Error("invalid_pdf_pages");
  }

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    byteLength += bytes.byteLength;
  };
  const pushAscii = (text: string) => {
    pushBytes(encoder.encode(text));
  };

  const totalObjects = 2 + pages.length * 3 + 1;
  const offsets = new Array<number>(totalObjects).fill(0);

  pushBytes(
    new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3,
      0xcf, 0xd3, 0x0a,
    ])
  );

  offsets[1] = byteLength;
  pushAscii("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  const kidsRefs = pages.map((_, idx) => `${3 + idx * 3} 0 R`).join(" ");
  offsets[2] = byteLength;
  pushAscii(
    `2 0 obj\n<< /Type /Pages /Count ${pages.length} /Kids [${kidsRefs}] >>\nendobj\n`
  );

  pages.forEach((page, idx) => {
    const widthPx = Math.max(1, Math.floor(page.widthPx));
    const heightPx = Math.max(1, Math.floor(page.heightPx));
    const pageObj = 3 + idx * 3;
    const contentObj = pageObj + 1;
    const imageObj = pageObj + 2;
    const imageName = `/Im${idx + 1}`;

    offsets[pageObj] = byteLength;
    pushAscii(
      `${pageObj} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_WIDTH_PT} ${A4_HEIGHT_PT}] /Resources << /XObject << ${imageName} ${imageObj} 0 R >> >> /Contents ${contentObj} 0 R >>\nendobj\n`
    );

    const contentStream = encoder.encode(
      `q\n${A4_WIDTH_PT} 0 0 ${A4_HEIGHT_PT} 0 0 cm\n${imageName} Do\nQ\n`
    );
    offsets[contentObj] = byteLength;
    pushAscii(
      `${contentObj} 0 obj\n<< /Length ${contentStream.byteLength} >>\nstream\n`
    );
    pushBytes(contentStream);
    pushAscii("\nendstream\nendobj\n");

    offsets[imageObj] = byteLength;
    pushAscii(
      `${imageObj} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpegBytes.byteLength} >>\nstream\n`
    );
    pushBytes(page.jpegBytes);
    pushAscii("\nendstream\nendobj\n");
  });

  const xrefOffset = byteLength;
  pushAscii(`xref\n0 ${totalObjects}\n0000000000 65535 f \n`);
  for (let objNum = 1; objNum < totalObjects; objNum += 1) {
    const paddedOffset = String(offsets[objNum]).padStart(10, "0");
    pushAscii(`${paddedOffset} 00000 n \n`);
  }

  pushAscii(
    `trailer\n<< /Size ${totalObjects} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  const output = new Uint8Array(byteLength);
  let cursor = 0;
  for (const chunk of chunks) {
    output.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return output;
}

export async function renderMeetingSummaryPdfBytes(params: {
  meeting: Meeting;
  locale: SupportedLocale;
  includeTranscript?: boolean;
}): Promise<Uint8Array> {
  const doc = buildSummaryExportDocument(params);
  const canvas = document.createElement("canvas");
  canvas.width = A4_CANVAS_WIDTH_PX;
  canvas.height = A4_CANVAS_HEIGHT_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("canvas_context_unavailable");
  }

  const pagesOps: PageDrawOp[][] = [[]];
  let cursorY = PAGE_TOP_Y;

  const currentOps = () => pagesOps[pagesOps.length - 1];
  const ensureSpace = (neededHeight: number) => {
    if (cursorY + neededHeight > PAGE_BOTTOM_Y) {
      pagesOps.push([]);
      cursorY = PAGE_TOP_Y;
    }
  };

  const appendWrappedLines = (block: {
    text: string;
    x: number;
    maxWidth: number;
    font: string;
    color: string;
    lineHeight: number;
    afterGap: number;
  }) => {
    ctx.font = block.font;
    const lines = wrapTextLines(ctx, {
      text: block.text,
      maxWidth: block.maxWidth,
    });
    for (const line of lines) {
      ensureSpace(block.lineHeight);
      if (line) {
        currentOps().push({
          kind: "text",
          text: line,
          x: block.x,
          y: cursorY,
          font: block.font,
          color: block.color,
        });
      }
      cursorY += block.lineHeight;
    }
    cursorY += block.afterGap;
  };

  currentOps().push({
    kind: "rect",
    x: 0,
    y: 0,
    width: A4_CANVAS_WIDTH_PX,
    height: 12,
    fill: "#ea580c",
  });

  const brandFont = `700 22px ${PDF_FONT_FAMILY}`;
  currentOps().push({
    kind: "text",
    text: "SumMeet",
    x: PAGE_MARGIN_X,
    y: cursorY,
    font: brandFont,
    color: "#ea580c",
  });
  cursorY += 36;

  appendWrappedLines({
    text: doc.title,
    x: PAGE_MARGIN_X,
    maxWidth: CONTENT_MAX_WIDTH,
    font: `700 38px ${PDF_FONT_FAMILY}`,
    color: "#0f172a",
    lineHeight: 50,
    afterGap: 18,
  });

  const metaFont = `400 21px ${PDF_FONT_FAMILY}`;
  ctx.font = metaFont;
  const wrappedMetaLines = doc.metadataLines.flatMap((line) =>
    wrapTextLines(ctx, { text: line, maxWidth: CONTENT_MAX_WIDTH - 48 })
  );
  const metaBoxHeight = wrappedMetaLines.length * 32 + 32;
  ensureSpace(metaBoxHeight + 24);
  currentOps().push({
    kind: "rect",
    x: PAGE_MARGIN_X,
    y: cursorY,
    width: CONTENT_MAX_WIDTH,
    height: metaBoxHeight,
    fill: "#f8fafc",
    stroke: "#e2e8f0",
  });
  let metaY = cursorY + 16;
  for (const line of wrappedMetaLines) {
    currentOps().push({
      kind: "text",
      text: line,
      x: PAGE_MARGIN_X + 24,
      y: metaY,
      font: metaFont,
      color: "#475569",
    });
    metaY += 32;
  }
  cursorY += metaBoxHeight + 28;

  const headingFont = `700 27px ${PDF_FONT_FAMILY}`;
  const subheadingFont = `600 23px ${PDF_FONT_FAMILY}`;
  const bodyFont = `400 22px ${PDF_FONT_FAMILY}`;

  for (const section of doc.sections) {
    ensureSpace(110);
    currentOps().push({
      kind: "rect",
      x: PAGE_MARGIN_X,
      y: cursorY + 4,
      width: 6,
      height: 28,
      fill: "#ea580c",
    });
    appendWrappedLines({
      text: section.heading,
      x: PAGE_MARGIN_X + 18,
      maxWidth: CONTENT_MAX_WIDTH - 18,
      font: headingFont,
      color: "#0f172a",
      lineHeight: 38,
      afterGap: 10,
    });

    for (const paragraph of section.paragraphs ?? []) {
      appendWrappedLines({
        text: paragraph,
        x: PAGE_MARGIN_X,
        maxWidth: CONTENT_MAX_WIDTH,
        font: bodyFont,
        color: "#1e293b",
        lineHeight: 34,
        afterGap: 10,
      });
    }

    for (const item of section.items ?? []) {
      appendWrappedLines({
        text: `• ${item}`,
        x: PAGE_MARGIN_X + 12,
        maxWidth: CONTENT_MAX_WIDTH - 12,
        font: bodyFont,
        color: "#1e293b",
        lineHeight: 34,
        afterGap: 8,
      });
    }

    for (const sub of section.subsections ?? []) {
      ensureSpace(72);
      appendWrappedLines({
        text: sub.subheading,
        x: PAGE_MARGIN_X + 8,
        maxWidth: CONTENT_MAX_WIDTH - 8,
        font: subheadingFont,
        color: "#0f172a",
        lineHeight: 34,
        afterGap: 4,
      });
      for (const bullet of sub.bullets) {
        appendWrappedLines({
          text: `• ${bullet}`,
          x: PAGE_MARGIN_X + 28,
          maxWidth: CONTENT_MAX_WIDTH - 28,
          font: bodyFont,
          color: "#334155",
          lineHeight: 32,
          afterGap: 6,
        });
      }
      cursorY += 6;
    }

    cursorY += 16;
  }

  const totalPages = pagesOps.length;
  const footerFont = `400 18px ${PDF_FONT_FAMILY}`;
  const encodedPages: Array<{
    jpegBytes: Uint8Array;
    widthPx: number;
    heightPx: number;
  }> = [];

  pagesOps.forEach((ops, pageIndex) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, A4_CANVAS_WIDTH_PX, A4_CANVAS_HEIGHT_PX);
    ctx.textBaseline = "top";

    for (const op of ops) {
      if (op.kind === "rect") {
        ctx.fillStyle = op.fill;
        ctx.fillRect(op.x, op.y, op.width, op.height);
        if (op.stroke) {
          ctx.strokeStyle = op.stroke;
          ctx.lineWidth = 2;
          ctx.strokeRect(op.x, op.y, op.width, op.height);
        }
      } else {
        ctx.font = op.font;
        ctx.fillStyle = op.color;
        ctx.fillText(op.text, op.x, op.y);
      }
    }

    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(PAGE_MARGIN_X, 1598, CONTENT_MAX_WIDTH, 2);
    ctx.font = footerFont;
    ctx.fillStyle = "#64748b";
    const footerText = doc.footerTemplate
      .replace("{page}", String(pageIndex + 1))
      .replace("{total}", String(totalPages));
    ctx.fillText(footerText, PAGE_MARGIN_X, 1618);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    const prefix = "data:image/jpeg;base64,";
    if (!dataUrl.startsWith(prefix)) {
      throw new Error("invalid_canvas_jpeg");
    }
    const binary = atob(dataUrl.slice(prefix.length));
    const jpegBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      jpegBytes[i] = binary.charCodeAt(i);
    }
    if (jpegBytes.byteLength === 0) {
      throw new Error("empty_canvas_jpeg");
    }

    encodedPages.push({
      jpegBytes,
      widthPx: A4_CANVAS_WIDTH_PX,
      heightPx: A4_CANVAS_HEIGHT_PX,
    });
  });

  return encodeJpegPagesToPdf(encodedPages);
}
