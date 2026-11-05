import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SumMeetWorkspace } from "@/components/dashboard/SumMeetWorkspace";
import { CalendarAndExportModal } from "@/components/integrations/CalendarAndExportModal";
import { getDictionary } from "@/i18n/dictionaries";
import {
  buildDatedMeetingId,
  buildExportFileStem,
  cacheUploadedMeetingAudio,
  clearCachedMeetingAudio,
  downloadMeetingAudio,
  exportMeetingMarkdown,
  exportMeetingPdf,
  formatRecordingDateShort,
  formatRecordingDateTime,
  generateMeetingMarkdown,
  removeCachedMeetingAudio,
} from "@/services/export/export-service";
import {
  buildSummaryExportDocument,
  encodeJpegPagesToPdf,
} from "@/services/export/pdf-export";
import { useMeetingStore } from "@/store/meeting-store";
import type { Meeting, SupportedLocale } from "@/types/meeting";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `asset://${path}`,
}));

vi.mock("@/services/audio/mic-activity", () => ({
  subscribeMicActivity: vi.fn(async () => () => {}),
  subscribeCallActions: vi.fn(async () => () => {}),
  requestCallAttention: vi.fn(),
  announceCallDetection: vi.fn(),
}));

vi.mock("@/services/updater", () => ({
  checkForUpdate: vi.fn(async () => ({ success: true, data: null })),
  getAppVersion: vi.fn(async () => "1.2.0"),
  installUpdate: vi.fn(async () => ({ success: true })),
  setupUpdateMenu: vi.fn(async () => () => {}),
}));

const invokeMock = vi.mocked(invoke);

function createSampleMeeting(overrides: Partial<Meeting> = {}): Meeting {
  const id = overrides.id ?? "mtg-2026-11-05_14-30-00-123";
  return {
    id,
    title: "Họp Chiến Lược Quý 4",
    createdAt: "2026-11-05T07:30:00.000Z",
    durationSeconds: 900,
    status: "completed",
    audioDeviceUsed: "AirPods Pro",
    isHeadphoneSession: true,
    participants: ["Minh Phúc", "Hoàng Nam"],
    segments: [
      {
        id: "seg-1",
        meetingId: id,
        speakerId: "spk_1",
        speakerName: "Minh Phúc",
        channel: "mic_user",
        text: "Chúng ta thống nhất lịch phát hành bản mới vào thứ Sáu.",
        startMs: 12_000,
        endMs: 18_000,
        confidence: 0.99,
      },
      {
        id: "seg-2",
        meetingId: id,
        speakerId: "spk_2",
        speakerName: "Hoàng Nam",
        channel: "system_remote",
        text: "Mình sẽ kiểm tra phần xuất PDF tiếng Việt có dấu đầy đủ.",
        startMs: 65_000,
        endMs: 73_000,
        confidence: 0.98,
      },
    ],
    summary: {
      meetingId: id,
      templateId: "general",
      overview: "Cuộc họp chốt tiến độ phát hành và kiểm thử tính năng xuất file.",
      actionItems: [
        {
          id: "act-1",
          task: "Kiểm thử xuất PDF nhiều trang",
          assignee: "Hoàng Nam",
          dueDate: "Thứ Sáu",
          completed: false,
          timestampMs: 65_000,
        },
        {
          id: "act-2",
          task: "Cập nhật tài liệu phát hành",
          assignee: "Minh Phúc",
          dueDate: "Thứ Năm",
          completed: true,
        },
      ],
      keyDecisions: ["Lưu trực tiếp vào thư mục Downloads"],
      outline: [
        {
          id: "out-1",
          title: "Kế hoạch phát hành",
          timestampMs: 12_000,
          bullets: ["Chốt mốc thứ Sáu", "Rà soát macOS và Windows"],
        },
      ],
      keywords: ["PhátHành", "#TauriV2"],
      sentiment: "focused",
      providerUsed: "OpenRouter (openai/gpt-6-luna)",
      promptVersion: "2026-04-v1",
      updatedAt: "2026-11-05T07:45:00.000Z",
    },
    chatMessages: [],
    ...overrides,
  };
}

function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function decodeBase64Bytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function installCanvasMock() {
  const drawnTexts: string[] = [];
  const fakeJpegB64 = btoa(
    String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9)
  );
  const mockCtx = {
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    textBaseline: "top",
    measureText: vi.fn((text: string) => ({ width: text.length * 11 })),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn((text: string) => {
      drawnTexts.push(text);
    }),
  } as unknown as CanvasRenderingContext2D;

  const getContextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(((contextId: string) =>
      contextId === "2d" ? mockCtx : null) as typeof HTMLCanvasElement.prototype.getContext);

  const toDataUrlSpy = vi
    .spyOn(HTMLCanvasElement.prototype, "toDataURL")
    .mockImplementation(() => `data:image/jpeg;base64,${fakeJpegB64}`);

  return {
    drawnTexts,
    toDataUrlSpy,
    restore: () => {
      getContextSpy.mockRestore();
      toDataUrlSpy.mockRestore();
    },
  };
}

describe("Recording date helpers & export stems", () => {
  it("builds dated meeting IDs using local calendar fields with zero dots", () => {
    const localDate = new Date(2026, 10, 5, 9, 4, 7, 42);
    const id = buildDatedMeetingId(localDate);

    expect(id).toBe("mtg-2026-11-05_09-04-07-042");
    expect(id).toMatch(/^mtg-[A-Za-z0-9_-]+$/);
    expect(id.includes(".")).toBe(false);
  });

  it("appends YYYY-MM-DD_HH-mm to export stems unless the title already includes that date", () => {
    const localCreated = new Date(2026, 10, 5, 14, 30, 0);
    const plain = createSampleMeeting({
      title: "Báo cáo Quý 4 / Nhóm AI",
      createdAt: localCreated.toISOString(),
    });
    expect(buildExportFileStem(plain)).toBe(
      "Báo cáo Quý 4 _ Nhóm AI_2026-11-05_14-30"
    );

    const alreadyDated = createSampleMeeting({
      title: "Sprint Sync 2026-11-05",
      createdAt: localCreated.toISOString(),
    });
    expect(buildExportFileStem(alreadyDated)).toBe("Sprint Sync 2026-11-05");

    const nfdVietnamese = createSampleMeeting({
      title: "Ba\u0301o ca\u0301o Quy\u0301 4 - Ky\u0303 thua\u0323\u0302t",
      createdAt: localCreated.toISOString(),
    });
    expect(buildExportFileStem(nfdVietnamese)).toBe(
      "Báo cáo Quý 4 - Kỹ thuật_2026-11-05_14-30"
    );
  });

  it.each(["vi", "en"] as const)(
    "formats full date+time and short date for %s locale",
    (locale) => {
      const ts = new Date(2026, 10, 5, 14, 30, 9).getTime();
      const full = formatRecordingDateTime(ts, locale);
      const short = formatRecordingDateShort(ts, locale);

      expect(full).toContain("2026");
      expect(full).toContain("30");
      expect(short).toContain("2026");
      expect(short).toContain("11");
    }
  );
});

describe("Markdown & PDF export generation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps 1-arg generateMeetingMarkdown backward-compatible with English headings and transcript", () => {
    const md = generateMeetingMarkdown(createSampleMeeting());

    expect(md).toContain("## Executive Summary");
    expect(md).toContain("## Action Items");
    expect(md).toContain("[01:05] **@Hoàng Nam**: Kiểm thử xuất PDF nhiều trang");
    expect(md).toContain("## Key Decisions");
    expect(md).toContain("## Topic Outline");
    expect(md).toContain("## Keywords");
    expect(md).toContain("- #PhátHành");
    expect(md).toContain("- #TauriV2");
    expect(md).toContain("## Full Diarized Transcript");
    expect(md).toContain("🎧 System Audio");
  });

  it.each(["vi", "en"] as const)(
    "renders localized Markdown in %s with all 5 summary sections, stale liveOverview fallback, and optional transcript",
    (locale: SupportedLocale) => {
      const dict = getDictionary(locale);
      const meeting = createSampleMeeting();

      const summaryOnly = generateMeetingMarkdown(meeting, {
        locale,
        includeTranscript: false,
      });
      expect(summaryOnly).toContain(`## ${dict.summary.overviewTitle}`);
      expect(summaryOnly).toContain(`## ${dict.summary.actionItemsTitle}`);
      expect(summaryOnly).toContain("[01:05] **@Hoàng Nam**");
      expect(summaryOnly).toContain("- [x] **@Minh Phúc**");
      expect(summaryOnly).toContain(`## ${dict.summary.keyDecisionsTitle}`);
      expect(summaryOnly).toContain(`## ${dict.summary.outlineTitle}`);
      expect(summaryOnly).toContain(`## ${dict.summary.keywordsTitle}`);
      expect(summaryOnly).toContain("- #PhátHành");
      expect(summaryOnly).not.toContain(
        `## ${dict.exportModal.transcriptHeading}`
      );

      const withTranscript = generateMeetingMarkdown(meeting, {
        locale,
        includeTranscript: true,
      });
      expect(withTranscript).toContain(
        `## ${dict.exportModal.transcriptHeading}`
      );
      expect(withTranscript).toContain(meeting.segments[0].text);

      const staleEmpty = createSampleMeeting({
        segments: [],
        summary: {
          ...meeting.summary,
          overview: dict.session.liveOverview,
          actionItems: [],
          keyDecisions: [],
          outline: [],
          keywords: [],
        },
      });
      const staleMd = generateMeetingMarkdown(staleEmpty, { locale });
      expect(staleMd).toContain(dict.errors.noTranscript);
      expect(staleMd).not.toContain(dict.session.liveOverview);
      expect(staleMd).toContain(`- ${dict.exportModal.emptyItems}`);
    }
  );

  it("builds structured summary documents and encodes valid multi-page %PDF-1.4 binaries", () => {
    const meeting = createSampleMeeting();
    const docWithoutTranscript = buildSummaryExportDocument({
      meeting,
      locale: "vi",
      includeTranscript: false,
    });
    expect(docWithoutTranscript.sections.map((s) => s.id)).toEqual([
      "overview",
      "actionItems",
      "keyDecisions",
      "outline",
      "keywords",
    ]);

    const docWithTranscript = buildSummaryExportDocument({
      meeting,
      locale: "en",
      includeTranscript: true,
    });
    expect(docWithTranscript.sections.map((s) => s.id)).toEqual([
      "overview",
      "actionItems",
      "keyDecisions",
      "outline",
      "keywords",
      "transcript",
    ]);

    const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const pdfBytes = encodeJpegPagesToPdf([
      { jpegBytes: fakeJpeg, widthPx: 1191, heightPx: 1684 },
      { jpegBytes: fakeJpeg, widthPx: 1191, heightPx: 1684 },
    ]);
    const pdfText = new TextDecoder("latin1").decode(pdfBytes);

    expect(pdfText.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdfText).toContain("/Type /Pages /Count 2 /Kids [3 0 R 6 0 R]");
    expect(pdfText).toContain("/MediaBox [0 0 595.28 841.89]");
    expect(pdfText).toContain("/Filter /DCTDecode");
    expect(pdfText).toContain("xref\n0 9\n");
    expect(pdfText).toContain("trailer\n<< /Size 9 /Root 1 0 R >>");
    expect(pdfText.trimEnd().endsWith("%%EOF")).toBe(true);

    const startXrefMatch = pdfText.match(/startxref\n(\d+)\n%%EOF/);
    expect(startXrefMatch).not.toBeNull();
    const xrefPos = Number(startXrefMatch![1]);
    expect(pdfText.slice(xrefPos, xrefPos + 5)).toBe("xref\n");
  });
});

describe("Tauri export service & uploaded audio cache", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    clearCachedMeetingAudio();
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("exports Markdown and multi-page Vietnamese PDF via save_export_file", async () => {
    const canvasMock = installCanvasMock();
    const longSegments = Array.from({ length: 55 }, (_, idx) => ({
      id: `seg-long-${idx}`,
      meetingId: "mtg-pdf",
      speakerId: "spk_1",
      speakerName: "Nguyễn Văn An",
      channel: "mic_user" as const,
      text: `Đoạn trao đổi số ${idx} kiểm tra phân trang tự động và dấu tiếng Việt chuẩn xác trên PDF.`,
      startMs: idx * 5000,
      endMs: (idx + 1) * 5000,
      confidence: 0.99,
    }));
    const meeting = createSampleMeeting({
      id: "mtg-pdf",
      segments: longSegments,
    });

    invokeMock.mockResolvedValueOnce({
      fileName: "Hop.md",
      savedPath: "/Downloads/Hop.md",
      sizeBytes: 512,
    });
    const mdRes = await exportMeetingMarkdown({
      meeting,
      locale: "vi",
      includeTranscript: false,
    });
    expect(mdRes.success).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("save_export_file", {
      fileName: buildExportFileStem(meeting),
      format: "md",
      contentBase64: expect.any(String),
    });
    const savedMd = decodeBase64Utf8(
      (invokeMock.mock.calls[0][1] as { contentBase64: string }).contentBase64
    );
    expect(savedMd).toContain("## Tổng quan");
    expect(savedMd).not.toContain("## Toàn bộ Transcript");

    invokeMock.mockResolvedValueOnce({
      fileName: "Hop.pdf",
      savedPath: "/Downloads/Hop.pdf",
      sizeBytes: 4096,
    });
    const pdfRes = await exportMeetingPdf({
      meeting,
      locale: "vi",
      includeTranscript: true,
    });
    expect(pdfRes.success).toBe(true);
    expect(canvasMock.toDataUrlSpy.mock.calls.length).toBeGreaterThan(1);
    expect(
      canvasMock.drawnTexts.some((line) => line.includes("Chiến Lược Quý 4"))
    ).toBe(true);

    const savedPdfBytes = decodeBase64Bytes(
      (invokeMock.mock.calls[1][1] as { contentBase64: string }).contentBase64
    );
    const pdfHeader = new TextDecoder("latin1").decode(
      savedPdfBytes.subarray(0, 8)
    );
    expect(pdfHeader).toBe("%PDF-1.4");
    canvasMock.restore();
  });

  it("downloads disk recording via export_recording_audio, uploaded audio via cached bytes without fetch, and surfaces localized errors", async () => {
    const diskMeeting = createSampleMeeting({
      audioDataUrl: "asset:///appdata/recordings/mtg.wav",
    });
    invokeMock.mockResolvedValueOnce({
      fileName: "Hop.wav",
      savedPath: "/Downloads/Hop.wav",
      sizeBytes: 32_000,
    });

    const diskResult = await downloadMeetingAudio({
      meeting: diskMeeting,
      locale: "vi",
    });
    expect(diskResult).toEqual({
      success: true,
      data: {
        fileName: "Hop.wav",
        savedPath: "/Downloads/Hop.wav",
        sizeBytes: 32_000,
      },
    });
    expect(invokeMock).toHaveBeenCalledWith("export_recording_audio", {
      meetingId: diskMeeting.id,
      suggestedStem: buildExportFileStem(diskMeeting),
    });

    const uploadedBytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00]);
    const uploadedFile = new File([uploadedBytes], "cuoc-hop.mp3", {
      type: "audio/mpeg",
    });
    const uploadedMeeting = createSampleMeeting({
      id: "mtg-upload-1",
      audioDataUrl: "blob:http://localhost:3040/abc-123",
    });
    await cacheUploadedMeetingAudio({
      meetingId: uploadedMeeting.id,
      file: uploadedFile,
    });

    invokeMock.mockResolvedValueOnce({
      fileName: "Hop.mp3",
      savedPath: "/Downloads/Hop.mp3",
      sizeBytes: uploadedBytes.byteLength,
    });
    const cachedResult = await downloadMeetingAudio({
      meeting: uploadedMeeting,
      locale: "en",
    });
    expect(cachedResult.success).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(invokeMock).toHaveBeenLastCalledWith("save_export_file", {
      fileName: buildExportFileStem(uploadedMeeting),
      format: "mp3",
      contentBase64: btoa(String.fromCharCode(...Array.from(uploadedBytes))),
    });

    removeCachedMeetingAudio(uploadedMeeting.id);
    const missingUpload = await downloadMeetingAudio({
      meeting: uploadedMeeting,
      locale: "vi",
    });
    expect(missingUpload).toEqual({
      success: false,
      error: getDictionary("vi").errors.audioFileNotFound,
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    invokeMock.mockRejectedValueOnce(new Error("recording_not_found"));
    const missingDisk = await downloadMeetingAudio({
      meeting: diskMeeting,
      locale: "en",
    });
    expect(missingDisk).toEqual({
      success: false,
      error: getDictionary("en").errors.audioFileNotFound,
    });
  });

  it.each(["vi", "en"] as const)(
    "maps export_too_large, downloads_unavailable, and unknown error codes to localized messages in %s",
    async (locale: SupportedLocale) => {
      const canvasMock = installCanvasMock();
      const dict = getDictionary(locale);
      const meeting = createSampleMeeting();

      invokeMock.mockRejectedValueOnce(new Error("export_too_large"));
      const tooLargeRes = await exportMeetingMarkdown({ meeting, locale });
      expect(tooLargeRes).toEqual({
        success: false,
        error: dict.errors.exportTooLarge,
      });

      invokeMock.mockRejectedValueOnce(new Error("downloads_unavailable"));
      const noDownloadsRes = await exportMeetingPdf({ meeting, locale });
      expect(noDownloadsRes).toEqual({
        success: false,
        error: dict.errors.downloadsUnavailable,
      });

      invokeMock.mockRejectedValueOnce(new Error("disk_io_failure"));
      const unknownAudioErr = await downloadMeetingAudio({ meeting, locale });
      expect(unknownAudioErr).toEqual({
        success: false,
        error: dict.errors.exportFailed,
      });

      canvasMock.restore();
    }
  );

  it("returns { success: true, data: null } when user cancels Save dialog in Markdown, PDF, or Audio export", async () => {
    const canvasMock = installCanvasMock();
    const meeting = createSampleMeeting({
      audioDataUrl: "asset:///appdata/recordings/mtg.wav",
    });

    invokeMock.mockResolvedValueOnce(null);
    const cancelledMd = await exportMeetingMarkdown({
      meeting,
      locale: "vi",
    });
    expect(cancelledMd).toEqual({ success: true, data: null });

    invokeMock.mockResolvedValueOnce(null);
    const cancelledPdf = await exportMeetingPdf({
      meeting,
      locale: "en",
    });
    expect(cancelledPdf).toEqual({ success: true, data: null });

    invokeMock.mockResolvedValueOnce(null);
    const cancelledDiskAudio = await downloadMeetingAudio({
      meeting,
      locale: "vi",
    });
    expect(cancelledDiskAudio).toEqual({ success: true, data: null });

    const uploadedFile = new File([new Uint8Array([1, 2, 3])], "clip.mp3", {
      type: "audio/mpeg",
    });
    const uploadedMeeting = createSampleMeeting({
      id: "mtg-upload-cancel",
      audioDataUrl: "blob:http://localhost:3040/cancel-1",
    });
    await cacheUploadedMeetingAudio({
      meetingId: uploadedMeeting.id,
      file: uploadedFile,
    });
    invokeMock.mockResolvedValueOnce(null);
    const cancelledUploadedAudio = await downloadMeetingAudio({
      meeting: uploadedMeeting,
      locale: "en",
    });
    expect(cancelledUploadedAudio).toEqual({ success: true, data: null });

    canvasMock.restore();
  });
});

describe("CalendarAndExportModal & SumMeetWorkspace export UI", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    clearCachedMeetingAudio();
    vi.spyOn(console, "error").mockImplementation(() => {});
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    useMeetingStore.setState({
      meetings: [],
      selectedMeetingId: "",
      openRouterKey: "sk-or-test",
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each(["vi", "en"] as const)(
    "defaults Include Transcript to false and supports Copy, Download .md, Download PDF, Download Audio, and error toasts in %s",
    async (locale: SupportedLocale) => {
      const canvasMock = installCanvasMock();
      const dict = getDictionary(locale);
      const meeting = createSampleMeeting();
      const onToast = vi.fn();

      render(
        <CalendarAndExportModal
          mode="export"
          onClose={vi.fn()}
          meeting={meeting}
          dict={dict}
          onToast={onToast}
        />
      );

      expect(
        screen.getByText(
          `${meeting.title} • ${formatRecordingDateTime(meeting.createdAt, locale)}`
        )
      ).toBeTruthy();

      const checkbox = screen.getByRole("checkbox", {
        name: dict.exportModal.includeTranscript,
      }) as HTMLInputElement;
      expect(checkbox.checked).toBe(false);

      const preview = document.querySelector("pre")!;
      expect(preview.textContent).toContain(dict.summary.overviewTitle);
      expect(preview.textContent).toContain(dict.summary.keywordsTitle);
      expect(preview.textContent).not.toContain(
        dict.exportModal.transcriptHeading
      );

      fireEvent.click(checkbox);
      expect(checkbox.checked).toBe(true);
      expect(preview.textContent).toContain(dict.exportModal.transcriptHeading);

      fireEvent.click(
        screen.getByRole("button", { name: dict.exportModal.copyMarkdown })
      );
      await waitFor(() =>
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
          expect.stringContaining(dict.exportModal.transcriptHeading)
        )
      );
      expect(onToast).toHaveBeenCalledWith(dict.exportModal.copied);

      invokeMock.mockResolvedValueOnce({
        fileName: "Summary.md",
        savedPath: "/Custom/Notes/Summary.md",
        sizeBytes: 256,
      });
      fireEvent.click(
        screen.getByRole("button", { name: dict.exportModal.downloadMarkdown })
      );
      await waitFor(() =>
        expect(onToast).toHaveBeenCalledWith(
          dict.exportModal.savedToPath.replace(
            "{path}",
            "/Custom/Notes/Summary.md"
          )
        )
      );

      invokeMock.mockResolvedValueOnce({
        fileName: "Summary.pdf",
        savedPath: "/Custom/Reports/Summary.pdf",
        sizeBytes: 2048,
      });
      fireEvent.click(
        screen.getByRole("button", { name: dict.exportModal.downloadPdf })
      );
      await waitFor(() =>
        expect(onToast).toHaveBeenCalledWith(
          dict.exportModal.savedToPath.replace(
            "{path}",
            "/Custom/Reports/Summary.pdf"
          )
        )
      );

      invokeMock.mockResolvedValueOnce({
        fileName: "Meeting.wav",
        savedPath: "/Custom/Audio/Meeting.wav",
        sizeBytes: 16_000,
      });
      fireEvent.click(
        screen.getByRole("button", { name: dict.exportModal.downloadAudio })
      );
      await waitFor(() =>
        expect(onToast).toHaveBeenCalledWith(
          dict.exportModal.savedToPath.replace(
            "{path}",
            "/Custom/Audio/Meeting.wav"
          )
        )
      );

      invokeMock.mockRejectedValueOnce(new Error("recording_not_found"));
      fireEvent.click(
        screen.getByRole("button", { name: dict.exportModal.downloadAudio })
      );
      await waitFor(() =>
        expect(onToast).toHaveBeenCalledWith(dict.errors.audioFileNotFound)
      );

      canvasMock.restore();
      cleanup();
    }
  );

  it.each(["vi", "en"] as const)(
    "emits zero toasts and re-enables buttons when user cancels Save dialog for .md, PDF, or Audio in %s",
    async (locale: SupportedLocale) => {
      const canvasMock = installCanvasMock();
      const dict = getDictionary(locale);
      const meeting = createSampleMeeting();
      const onToast = vi.fn();

      render(
        <CalendarAndExportModal
          mode="export"
          onClose={vi.fn()}
          meeting={meeting}
          dict={dict}
          onToast={onToast}
        />
      );

      const mdBtn = screen.getByRole("button", {
        name: dict.exportModal.downloadMarkdown,
      }) as HTMLButtonElement;
      const pdfBtn = screen.getByRole("button", {
        name: dict.exportModal.downloadPdf,
      }) as HTMLButtonElement;
      const audioBtn = screen.getByRole("button", {
        name: dict.exportModal.downloadAudio,
      }) as HTMLButtonElement;

      let resolveMdDialog!: (value: null) => void;
      invokeMock.mockImplementationOnce(
        () =>
          new Promise<null>((resolve) => {
            resolveMdDialog = resolve;
          })
      );
      fireEvent.click(mdBtn);
      await waitFor(() => expect(mdBtn.getAttribute("aria-busy")).toBe("true"));
      expect(mdBtn.disabled).toBe(true);
      expect(pdfBtn.disabled).toBe(true);
      expect(audioBtn.disabled).toBe(true);

      resolveMdDialog(null);
      await waitFor(() =>
        expect(mdBtn.getAttribute("aria-busy")).toBe("false")
      );
      expect(mdBtn.disabled).toBe(false);
      expect(onToast).not.toHaveBeenCalled();

      invokeMock.mockResolvedValueOnce(null);
      fireEvent.click(pdfBtn);
      await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(pdfBtn.getAttribute("aria-busy")).toBe("false")
      );
      expect(pdfBtn.disabled).toBe(false);
      expect(onToast).not.toHaveBeenCalled();

      invokeMock.mockResolvedValueOnce(null);
      fireEvent.click(audioBtn);
      await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(3));
      await waitFor(() =>
        expect(audioBtn.getAttribute("aria-busy")).toBe("false")
      );
      expect(audioBtn.disabled).toBe(false);
      expect(onToast).not.toHaveBeenCalled();

      canvasMock.restore();
      cleanup();
    }
  );

  it.each(["vi", "en"] as const)(
    "deduplicates subtitle when title already contains the recording date and handles clipboard write failures in %s",
    async (locale: SupportedLocale) => {
      const dict = getDictionary(locale);
      const createdAt = new Date(2026, 10, 5, 16, 45, 12).toISOString();
      const shortDate = formatRecordingDateShort(createdAt, locale);
      const datedTitle = dict.recorder.sessionTitle.replace(
        "{time}",
        formatRecordingDateTime(createdAt, locale)
      );
      expect(datedTitle).toContain(shortDate);

      const onToast = vi.fn();
      vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(
        new Error("ClipboardDenied")
      );

      const { rerender } = render(
        <CalendarAndExportModal
          mode="export"
          onClose={vi.fn()}
          meeting={createSampleMeeting({ title: datedTitle, createdAt })}
          dict={dict}
          onToast={onToast}
        />
      );

      expect(screen.getByText(datedTitle)).toBeTruthy();
      expect(
        screen.queryByText(
          `${datedTitle} • ${formatRecordingDateTime(createdAt, locale)}`
        )
      ).toBeNull();

      fireEvent.click(
        screen.getByRole("button", { name: dict.exportModal.copyMarkdown })
      );
      await waitFor(() =>
        expect(onToast).toHaveBeenCalledWith(dict.errors.exportFailed)
      );
      expect(onToast).not.toHaveBeenCalledWith(dict.exportModal.copied);

      const isoDatedMeeting = createSampleMeeting({
        title: "Release Review 2026-11-05",
        createdAt,
      });
      rerender(
        <CalendarAndExportModal
          mode="export"
          onClose={vi.fn()}
          meeting={isoDatedMeeting}
          dict={dict}
          onToast={onToast}
        />
      );
      expect(screen.getByText("Release Review 2026-11-05")).toBeTruthy();
      expect(
        screen.queryByText(
          `Release Review 2026-11-05 • ${formatRecordingDateTime(createdAt, locale)}`
        )
      ).toBeNull();

      cleanup();
    }
  );

  it("mounts CalendarAndExportModal conditionally in SumMeetWorkspace, shows recording dates, and exposes Export in collapsed sidebar", async () => {
    const dict = getDictionary("vi");
    const diskCreatedMs = new Date(2026, 10, 5, 10, 15, 30).getTime();

    invokeMock.mockImplementation(async (command: string) => {
      if (command === "list_recordings") {
        return {
          recordingsDir: "/appdata/recordings",
          files: [
            {
              meetingId: "mtg-2026-11-05_10-15-30-000",
              fileName: "mtg-2026-11-05_10-15-30-000.wav",
              wavPath: "/appdata/recordings/mtg-2026-11-05_10-15-30-000.wav",
              sizeBytes: 32_000,
              createdAtMs: diskCreatedMs,
              durationSec: 45,
            },
          ],
        };
      }
      if (command === "list_audio_devices") {
        return {
          devices: [],
          routing: {
            active_input_device: "Default Mic",
            active_output_device: "Speakers",
          },
          system_audio_supported: false,
        };
      }
      if (command === "get_recording_status") {
        return { active: null };
      }
      return null;
    });

    render(<SumMeetWorkspace locale="vi" />);

    const expectedDateTime = formatRecordingDateTime(diskCreatedMs, "vi");
    const expectedShortDate = formatRecordingDateShort(diskCreatedMs, "vi");
    await waitFor(() =>
      expect(
        screen.getAllByText(
          dict.recorder.sessionTitle.replace("{time}", expectedDateTime)
        ).length
      ).toBeGreaterThan(0)
    );
    expect(screen.getByText(expectedShortDate)).toBeTruthy();
    expect(screen.getByText(expectedDateTime)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByTitle(dict.workspace.collapseSidebar));
    const collapsedExportBtn = screen.getByRole("button", {
      name: dict.nav.exportShare,
    }) as HTMLButtonElement;
    expect(collapsedExportBtn.disabled).toBe(false);

    fireEvent.click(collapsedExportBtn);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText(dict.exportModal.title)).toBeTruthy();
  });
});
