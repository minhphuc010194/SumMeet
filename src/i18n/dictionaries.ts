import type { SupportedLocale } from "@/types/meeting";

export interface Dictionary {
  locale: SupportedLocale;
  appName: string;
  appTagline: string;
  nav: {
    meetings: string;
    calendar: string;
    settings: string;
    exportShare: string;
    newRecording: string;
    uploadFile: string;
    showSidebar: string;
  };
  theme: {
    label: string;
    system: string;
    light: string;
    dark: string;
  };
  recorder: {
    controlsLabel: string;
    readyTitle: string;
    recordingTitle: string;
    captureHint: string;
    inputDeviceLabel: string;
    systemDefaultDevice: string;
    startRecording: string;
    stopRecording: string;
    includeSystemAudio: string;
    systemAudioUnsupported: string;
    systemAudioPermissionHint: string;
    systemAudioUnavailable: string;
    systemAudioSilentHint: string;
    deviceSwitched: string;
    sessionTitle: string;
    uploadedFileSource: string;
    uploadProcessing: string;
    uploadDone: string;
    processingRecording: string;
    processingHint: string;
    recordingDone: string;
    liveTranscribing: string;
    listening: string;
    audioSignal: string;
    callDetectedTitle: string;
    callDetectedHint: string;
    callDetectedBody: string;
    callDetectedAction: string;
    callDetectedStart: string;
    callDetectedDismiss: string;
    systemSignal: string;
    callDetectionIntroTitle: string;
    callDetectionIntroBody: string;
  };
  recordingResult: {
    title: string;
    heightMedium: string;
    heightMediumTitle: string;
    heightLarge: string;
    heightLargeTitle: string;
    heightMax: string;
    heightMaxTitle: string;
    closeQuickView: string;
    savedAudioAt: string;
    resizeHint: string;
    transcriptTitle: string;
    resetSplit: string;
    widenColumn: string;
    resizeColumnsTitle: string;
    resizeHeightTitle: string;
    summaryTitle: string;
    overviewHeading: string;
    keyTakeawaysHeading: string;
    outlineHeading: string;
    actionItemsHeading: string;
    defaultSpeaker: string;
  };
  workspace: {
    brandSubtitle: string;
    collapseSidebar: string;
    recordingsHeading: string;
    clearAll: string;
    emptyListTitle: string;
    emptyListHint: string;
    segmentsUnit: string;
    deleteRecordingTitle: string;
    savedFilesHeading: string;
    refresh: string;
    noSavedFiles: string;
    deleteFileTitle: string;
    wideTranscript: string;
    wideSummary: string;
    deleteActiveRecording: string;
    resizePanelsTitle: string;
    resizeHeightTitle: string;
    emptyStateTitle: string;
    emptyStateHint: string;
    recordingDeleted: string;
    allCleared: string;
  };
  tabs: {
    transcript: string;
    summary: string;
    askFred: string;
  };
  transcript: {
    searchPlaceholder: string;
    allSpeakers: string;
    channelMicTag: string;
    channelSystemTag: string;
    renameSpeakerTooltip: string;
    renameSpeakerPrompt: string;
    emptyState: string;
    clickToSeek: string;
    addLiveNotePlaceholder: string;
    addLiveNoteButton: string;
    defaultMicSpeaker: string;
    remoteSpeaker: string;
  };
  summary: {
    templateLabel: string;
    regenerateButton: string;
    regenerating: string;
    overviewTitle: string;
    actionItemsTitle: string;
    keyDecisionsTitle: string;
    outlineTitle: string;
    keywordsTitle: string;
    providerBadge: string;
    updatedToast: string;
    templates: {
      general: string;
      sales: string;
      standup: string;
      interview: string;
    };
  };
  session: {
    systemAudioParticipant: string;
    liveOverview: string;
    liveKeyword: string;
    headphoneKeyword: string;
    speakerKeyword: string;
    liveProvider: string;
  };
  summaryDefaults: {
    overview: string;
    actionTask: string;
    assignee: string;
    dueDate: string;
    topic: string;
    keywords: string[];
  };
  askFred: {
    title: string;
    subtitle: string;
    inputPlaceholder: string;
    sendButton: string;
    thinking: string;
    suggestedQuestions: string[];
    clearHistory: string;
    citationsLabel: string;
  };
  calendar: {
    modalTitle: string;
    upcomingTitle: string;
    recordThisMeeting: string;
    syncIcalLabel: string;
    syncButton: string;
    syncedEventTitle: string;
    syncedEventStart: string;
    syncedEventParticipants: string[];
    syncedToast: string;
    sessionDevice: string;
    sessionCreatedToast: string;
  };
  exportModal: {
    title: string;
    markdownTab: string;
    pdfTab: string;
    downloadMarkdown: string;
    copyMarkdown: string;
    copied: string;
    downloaded: string;
    markdownPreview: string;
    printPdfButton: string;
  };
  settings: {
    title: string;
    subtitle: string;
    modelLabel: string;
    modelHint: string;
    languageLabel: string;
    languageOptions: {
      vi: string;
      en: string;
      auto: string;
    };
    keyTitle: string;
    keyChangeLabel: string;
    keyChangeButton: string;
    keyRemoveButton: string;
    keySavedToast: string;
    callDetectionLabel: string;
    callDetectionHint: string;
    autostartLabel: string;
    autostartHint: string;
    autostartReadError: string;
    autostartSaveError: string;
    saveButton: string;
    savedToast: string;
    closeButton: string;
  };
  onboarding: {
    title: string;
    subtitle: string;
    keyLabel: string;
    keyPlaceholder: string;
    saveButton: string;
    validating: string;
    loading: string;
  };
  errors: {
    boundaryTitle: string;
    boundaryRetry: string;
    invalidRequest: string;
    noTranscript: string;
    questionTooLong: string;
    chatUnavailable: string;
    transcriptionFailed: string;
    emptyKey: string;
    invalidKey: string;
    networkError: string;
    keychainError: string;
    noInputDevice: string;
    inputDeviceUnavailable: string;
    recordingActive: string;
    recordingFailed: string;
    unsupportedMedia: string;
  };
  update: {
    title: string;
    versionLine: string;
    notesHeading: string;
    updateNow: string;
    later: string;
    downloading: string;
    installFailed: string;
    buttonLabel: string;
    settingsTitle: string;
    currentVersion: string;
    checkButton: string;
    versionLabel: string;
    checkingStatus: string;
    upToDate: string;
    checkFailed: string;
    tryAgain: string;
    menuCheckForUpdates: string;
  };
  tray: {
    openLabel: string;
    quitLabel: string;
  };
}

export const DICTIONARIES: Record<SupportedLocale, Dictionary> = {
  vi: {
    locale: "vi",
    appName: "SumMeet",
    appTagline: "Trợ lý AI Ghi âm & Tóm tắt Cuộc họp (Không cần Bot vào phòng)",
    nav: {
      meetings: "Thư viện cuộc họp",
      calendar: "Lịch họp",
      settings: "Cấu hình AI & Audio",
      exportShare: "Xuất & Chia sẻ",
      newRecording: "Ghi âm mới",
      uploadFile: "Tải file Audio/Video",
      showSidebar: "Mở danh sách bản ghi",
    },
    theme: {
      label: "Giao diện",
      system: "Theo hệ thống",
      light: "Sáng",
      dark: "Tối",
    },
    recorder: {
      controlsLabel: "Điều khiển ghi âm cuộc họp",
      readyTitle: "Ghi âm & Tóm tắt tự động (Microphone)",
      recordingTitle: "Đang thu âm từ Microphone...",
      captureHint: "• Thu từ micro đã chọn. Khi bật âm thanh hệ thống, mọi âm thanh máy phát ra cũng được ghi và gửi tới OpenRouter để gỡ băng (không quay màn hình)",
      inputDeviceLabel: "Micro dùng để ghi âm",
      systemDefaultDevice: "Mặc định hệ thống ({device})",
      startRecording: "Bắt đầu ghi âm",
      stopRecording: "Dừng & Tóm tắt",
      includeSystemAudio: "Thu cả âm thanh hệ thống (Zoom/Meet/Teams)",
      systemAudioUnsupported: "Thu âm thanh hệ thống cần macOS 14.6 trở lên hoặc Windows 10/11.",
      systemAudioPermissionHint: "Trên macOS, lần ghi đầu tiên sẽ hỏi quyền ghi âm thanh hệ thống. Nếu đồng hồ \"Hệ thống\" đứng yên, hãy bật SumMeet trong Cài đặt hệ thống → Quyền riêng tư & Bảo mật → Ghi màn hình & âm thanh hệ thống.",
      systemAudioUnavailable: "Không thu được âm thanh hệ thống, SumMeet đang ghi âm chỉ từ micro.",
      systemAudioSilentHint: "Chưa nghe thấy âm thanh hệ thống trong 1 phút. Nếu đang trong cuộc gọi, hãy kiểm tra quyền ghi âm thanh hệ thống (macOS: Cài đặt hệ thống → Quyền riêng tư & Bảo mật → Ghi màn hình & âm thanh hệ thống).",
      deviceSwitched: "🎧 Đã tự động chuyển sang thiết bị: {device}",
      sessionTitle: "Ghi âm lúc {time}",
      uploadedFileSource: "File: {name}",
      uploadProcessing: 'Đang gỡ băng & tóm tắt file "{name}"...',
      uploadDone: '✅ Đã gỡ băng và tóm tắt xong file "{name}"!',
      processingRecording: "Đang lưu file ghi âm & tạo Bản Tóm Tắt AI...",
      processingHint: "Bản gỡ băng (Transcript) và Bản Tóm Tắt AI sẽ tự động hiển thị ngay sau vài giây...",
      recordingDone: "✅ Hoàn tất! Kết quả ghi âm & Bản Tóm Tắt AI đã hiển thị ngay bên dưới!",
      liveTranscribing: "Đang tự động gỡ băng âm thanh vừa thu...",
      listening: "Đang lắng nghe Microphone (Đã gỡ băng {count} đoạn)",
      audioSignal: "Tín hiệu âm thanh:",
      callDetectedTitle: "Có vẻ bạn đang trong một cuộc gọi",
      callDetectedHint: "Một ứng dụng khác đang dùng micro. Ghi âm cuộc họp này?",
      callDetectedBody: "Một ứng dụng khác đang dùng micro. Mở SumMeet để ghi âm cuộc họp này.",
      callDetectedAction: "Ghi âm",
      callDetectedStart: "Bắt đầu ghi âm",
      callDetectedDismiss: "Bỏ qua",
      systemSignal: "Hệ thống:",
      callDetectionIntroTitle: "SumMeet sẽ báo khi bạn vào cuộc gọi",
      callDetectionIntroBody: "Khi ứng dụng khác bắt đầu dùng micro, SumMeet sẽ gợi ý ghi âm bằng thông báo như thế này.",
    },
    recordingResult: {
      title: "Kết quả vừa thu: {title}",
      heightMedium: "Vừa",
      heightMediumTitle: "Chiều cao vừa",
      heightLarge: "Rộng",
      heightLargeTitle: "Mở rộng khung đọc",
      heightMax: "Tối đa",
      heightMaxTitle: "Phóng to tối đa",
      closeQuickView: "Ẩn khung nhanh này (vẫn xem đầy đủ ở bên dưới)",
      savedAudioAt: "Đã lưu file âm thanh tại:",
      resizeHint: "💡 Kéo thanh ngăn giữa (trái/phải) hoặc thanh cạnh dưới (lên/xuống) để điều chỉnh kích thước đọc",
      transcriptTitle: "📝 Nội dung vừa gỡ băng (Transcript - {count} đoạn)",
      resetSplit: "Chia đều 50/50",
      widenColumn: "Mở rộng cột này",
      resizeColumnsTitle: "Kéo qua trái/phải để thay đổi độ rộng 2 khung",
      resizeHeightTitle: "Kéo lên/xuống để phóng to hoặc thu nhỏ chiều cao khung đọc",
      summaryTitle: "✨ Bản Tóm Tắt AI:",
      overviewHeading: "📌 Tóm tắt tổng quan",
      keyTakeawaysHeading: "🎯 Điểm chính / Kết luận",
      outlineHeading: "📑 Dàn ý chi tiết",
      actionItemsHeading: "✅ Hành động / Việc cần làm",
      defaultSpeaker: "Âm thanh",
    },
    workspace: {
      brandSubtitle: "Quản lý Ghi âm & Tóm tắt AI",
      collapseSidebar: "Thu gọn thanh bên để mở rộng không gian đọc",
      recordingsHeading: "Bản ghi âm ({count})",
      clearAll: "Xóa tất cả",
      emptyListTitle: "Danh sách trống",
      emptyListHint: "Bấm nút 'Bắt đầu ghi âm' ở trên để thu giọng nói của bạn qua micro.",
      segmentsUnit: "đoạn",
      deleteRecordingTitle: "Xóa bản ghi này",
      savedFilesHeading: "File trong máy ({count})",
      refresh: "Làm mới",
      noSavedFiles: "Không có file .wav nào trong thư mục ghi âm.",
      deleteFileTitle: "Xóa file",
      wideTranscript: "Rộng Transcript",
      wideSummary: "Rộng Tóm tắt",
      deleteActiveRecording: "Xóa bản ghi này",
      resizePanelsTitle: "Kéo qua trái/phải để thay đổi độ rộng giữa Transcript và Bản Tóm Tắt",
      resizeHeightTitle: "Kéo lên/xuống để mở rộng chiều cao khung đọc chính",
      emptyStateTitle: "Chưa có bản ghi âm nào",
      emptyStateHint: "Hãy bấm nút 'Bắt đầu ghi âm' ở góc trên bên phải để thu giọng nói của bạn qua micro, hoặc tải lên một file âm thanh/video có sẵn.",
      recordingDeleted: '🗑️ Đã xóa bản ghi "{name}"',
      allCleared: "🧹 Đã xóa sạch toàn bộ dữ liệu và file ghi âm!",
    },
    tabs: {
      transcript: "Bản gỡ băng (Transcript)",
      summary: "Tóm tắt AI (Smart Notes)",
      askFred: "Chat AI (AskBot)",
    },
    transcript: {
      searchPlaceholder: "Tìm từ khóa, tên người nói hoặc nội dung...",
      allSpeakers: "Tất cả người nói",
      channelMicTag: "Mic của bạn",
      channelSystemTag: "Âm thanh cuộc họp (System)",
      renameSpeakerTooltip: "Nhấp để đổi tên người nói này trên toàn bộ cuộc họp",
      renameSpeakerPrompt: "Nhập tên mới cho người nói:",
      emptyState: "Chưa có câu thoại nào khớp với bộ lọc.",
      clickToSeek: "Nhấp để phát từ mốc thời gian này",
      addLiveNotePlaceholder: "Nhập câu thoại thử nghiệm hoặc ghi chú nhanh vào cuộc họp...",
      addLiveNoteButton: "Thêm vào Transcript",
      defaultMicSpeaker: "Bạn (Mic)",
      remoteSpeaker: "Người nói {n} (Máy / Video)",
    },
    summary: {
      templateLabel: "Mẫu biên bản AI:",
      regenerateButton: "Tạo lại bản tóm tắt AI",
      regenerating: "AI đang tổng hợp...",
      overviewTitle: "Tổng quan cuộc họp (Executive Summary)",
      actionItemsTitle: "Danh sách công việc cần làm (Action Items)",
      keyDecisionsTitle: "Các quyết định quan trọng (Key Decisions)",
      outlineTitle: "Dàn ý theo dòng thời gian (Time-stamped Outline)",
      keywordsTitle: "Từ khóa trọng tâm",
      providerBadge: "Mô hình xử lý:",
      updatedToast: 'Đã cập nhật bản tóm tắt theo mẫu "{template}"!',
      templates: {
        general: "Họp tổng hợp tiêu chuẩn (General Meeting)",
        sales: "Tư vấn khách hàng & Sales (Client Discovery)",
        standup: "Họp kỹ thuật / Daily Standup & Sprint",
        interview: "Phỏng vấn ứng viên / 1-on-1 Review",
      },
    },
    session: {
      systemAudioParticipant: "Âm thanh Máy / Video",
      liveOverview: "Đang thu âm và phân tích nội dung theo thời gian thực...",
      liveKeyword: "Thu âm trực tiếp",
      headphoneKeyword: "Tai nghe Dual-Stream",
      speakerKeyword: "Chế độ loa ngoài",
      liveProvider: "Luồng trực tiếp",
    },
    summaryDefaults: {
      overview: "Bản tóm tắt do SumMeet tạo.",
      actionTask: "Theo dõi nội dung đã thảo luận",
      assignee: "Cả nhóm",
      dueDate: "Trong tuần này",
      topic: "Chủ đề {n}",
      keywords: ["Cuộc họp", "Việc cần làm", "Dual-Stream"],
    },
    askFred: {
      title: "AskBot — Trợ lý Hỏi đáp Cuộc họp",
      subtitle: "Hỏi bất kỳ chi tiết nào trong cuộc họp. AI trả lời kèm trích dẫn mốc thời gian chính xác.",
      inputPlaceholder: "Hỏi về nhiệm vụ, quyết định, rủi ro hoặc yêu cầu viết email follow-up...",
      sendButton: "Gửi",
      thinking: "AskBot đang phân tích transcript...",
      suggestedQuestions: [
        "Tóm tắt các Action Items và người phụ trách trong cuộc họp này?",
        "Những quyết định kỹ thuật quan trọng nào đã được chốt?",
        "Soạn giúp tôi email follow-up gửi cho cả nhóm sau cuộc họp",
        "Người tham gia từ xa đã nêu ra những vấn đề hoặc rủi ro gì?",
      ],
      clearHistory: "Xóa lịch sử chat",
      citationsLabel: "Trích dẫn từ Transcript:",
    },
    calendar: {
      modalTitle: "Lịch họp & Tự động chuẩn bị ghi âm",
      upcomingTitle: "Cuộc họp sắp diễn ra hôm nay",
      recordThisMeeting: "Ghi âm cuộc họp này",
      syncIcalLabel: "URL Lịch Google Calendar (iCal / ICS) hoặc OAuth:",
      syncButton: "Đồng bộ lịch",
      syncedEventTitle: "Đã đồng bộ từ Google Calendar — Rà soát Thiết kế & Kỹ thuật",
      syncedEventStart: "17:30 Hôm nay",
      syncedEventParticipants: ["Bạn (Minh Phúc)", "Nhóm Thiết kế", "Trưởng nhóm Backend"],
      syncedToast: "Đã đồng bộ sự kiện mới từ Google Calendar!",
      sessionDevice: "AirPods Pro (Dual-Stream: System Loopback + Mic)",
      sessionCreatedToast: "Đã khởi tạo biên bản cho \"{title}\"",
    },
    exportModal: {
      title: "Xuất báo cáo & Chia sẻ biên bản cuộc họp",
      markdownTab: "Markdown (.md)",
      pdfTab: "Báo cáo PDF",
      downloadMarkdown: "Tải file .md",
      copyMarkdown: "Sao chép Markdown",
      copied: "Đã sao chép!",
      downloaded: "Đã tải tệp Markdown (.md)!",
      markdownPreview: "Xem trước Markdown",
      printPdfButton: "Xuất / In file PDF chuẩn",
    },
    settings: {
      title: "Cấu hình OpenRouter AI",
      subtitle: "Gỡ băng, Tóm tắt và Chat AI đều chạy qua OpenRouter bằng khóa API của bạn.",
      modelLabel: "Mô hình OpenRouter (Gỡ băng, Tóm tắt, Chat):",
      modelHint: "Cần hỗ trợ âm thanh đầu vào để gỡ băng. Mặc định: google/gemini-3.1-flash-lite",
      languageLabel: "Ngôn ngữ ưu tiên khi nhận diện giọng nói:",
      languageOptions: {
        vi: "Tiếng Việt",
        en: "English",
        auto: "Tự động nhận diện",
      },
      keyTitle: "Khóa API OpenRouter",
      keyChangeLabel: "Nhập khóa mới để thay thế khóa hiện tại:",
      keyChangeButton: "Xác thực & Thay khóa",
      keyRemoveButton: "Xóa khóa khỏi máy này",
      keySavedToast: "Đã xác thực và lưu khóa OpenRouter mới!",
      callDetectionLabel: "Gợi ý ghi âm khi phát hiện cuộc gọi",
      callDetectionHint: "SumMeet chỉ kiểm tra xem ứng dụng khác có đang dùng micro hay không, không đọc âm thanh.",
      autostartLabel: "Mở SumMeet khi đăng nhập",
      autostartHint: "SumMeet chạy nền trên thanh menu hoặc khay hệ thống và không mở cửa sổ khi khởi động.",
      autostartReadError: "Không thể đọc cài đặt mở SumMeet khi đăng nhập.",
      autostartSaveError: "Đã lưu cấu hình, nhưng không thể thay đổi cài đặt mở SumMeet khi đăng nhập.",
      saveButton: "Lưu cấu hình",
      savedToast: "Đã lưu cấu hình AI & Audio thành công!",
      closeButton: "Đóng",
    },
    onboarding: {
      title: "Kết nối OpenRouter để bắt đầu",
      subtitle: "SumMeet dùng OpenRouter cho gỡ băng, tóm tắt và chat AI. Nhập khóa API OpenRouter của bạn (tạo tại openrouter.ai/keys). Khóa được lưu trong kho khóa của hệ điều hành, không nằm trong file hay bộ nhớ trình duyệt.",
      keyLabel: "Khóa API OpenRouter",
      keyPlaceholder: "sk-or-v1-...",
      saveButton: "Xác thực & Lưu khóa",
      validating: "Đang xác thực khóa...",
      loading: "Đang tải cấu hình...",
    },
    errors: {
      boundaryTitle: "Đã xảy ra lỗi hiển thị tại khu vực này",
      boundaryRetry: "Tải lại thành phần",
      invalidRequest: "Dữ liệu yêu cầu không hợp lệ.",
      noTranscript: "Chưa có nội dung gỡ băng để tóm tắt.",
      questionTooLong: "Câu hỏi vượt quá 2000 ký tự.",
      chatUnavailable: "Xin lỗi, không thể kết nối OpenRouter. Vui lòng thử lại hoặc kiểm tra khóa API trong Cấu hình.",
      transcriptionFailed: "Không thể gỡ băng đoạn âm thanh qua OpenRouter.",
      emptyKey: "Vui lòng nhập khóa API OpenRouter.",
      invalidKey: "Khóa API OpenRouter không hợp lệ hoặc đã bị thu hồi.",
      networkError: "Không thể kết nối tới OpenRouter. Kiểm tra mạng rồi thử lại.",
      keychainError: "Không thể truy cập kho khóa của hệ điều hành.",
      noInputDevice: "Không tìm thấy micro. Hãy kiểm tra thiết bị đầu vào và quyền truy cập micro rồi thử lại.",
      inputDeviceUnavailable: "Không tìm thấy micro đã chọn. Hãy chọn micro khác hoặc dùng mặc định hệ thống rồi thử lại.",
      recordingActive: "Đang có một bản ghi âm chạy. Hãy dừng bản ghi âm đó trước.",
      recordingFailed: "Thao tác ghi âm không thành công. Vui lòng thử lại.",
      unsupportedMedia: "Không thể giải mã file này. Hãy dùng định dạng WAV, MP3, AAC, M4A, OGG hoặc FLAC.",
    },
    update: {
      title: "Có bản cập nhật mới",
      versionLine: "SumMeet {version} đã sẵn sàng để cài đặt",
      notesHeading: "Có gì mới",
      updateNow: "Cập nhật ngay",
      later: "Để sau",
      downloading: "Đang tải bản cập nhật",
      installFailed: "Không thể cài đặt bản cập nhật. Vui lòng thử lại sau.",
      buttonLabel: "Có bản {version} — bấm để cập nhật",
      settingsTitle: "Cập nhật ứng dụng",
      currentVersion: "Phiên bản hiện tại: {version}",
      checkButton: "Kiểm tra cập nhật",
      versionLabel: "Phiên bản {version}",
      checkingStatus: "Đang kiểm tra cập nhật…",
      upToDate: "Bạn đang dùng phiên bản mới nhất.",
      checkFailed: "Không thể kiểm tra cập nhật. Vui lòng thử lại sau.",
      tryAgain: "Thử lại",
      menuCheckForUpdates: "Kiểm tra cập nhật…",
    },
    tray: {
      openLabel: "Mở SumMeet",
      quitLabel: "Thoát SumMeet",
    },
  },
  en: {
    locale: "en",
    appName: "SumMeet",
    appTagline: "Bot-Free AI Meeting Recorder, Live Transcription & Copilot",
    nav: {
      meetings: "Meeting Library",
      calendar: "Calendar",
      settings: "AI & Audio Settings",
      exportShare: "Export & Share",
      newRecording: "New Recording",
      uploadFile: "Upload Audio/Video",
      showSidebar: "Show recordings sidebar",
    },
    theme: {
      label: "Appearance",
      system: "System",
      light: "Light",
      dark: "Dark",
    },
    recorder: {
      controlsLabel: "Meeting recorder controls",
      readyTitle: "One-Click Auto Recorder (Microphone)",
      recordingTitle: "Recording from the microphone...",
      captureHint: "• Records the selected microphone. With system audio on, everything your computer plays is also recorded and sent to OpenRouter for transcription (no screen video)",
      inputDeviceLabel: "Recording microphone",
      systemDefaultDevice: "System default ({device})",
      startRecording: "Start Recording",
      stopRecording: "Stop & Summarize",
      includeSystemAudio: "Capture system audio (Zoom/Meet/Teams)",
      systemAudioUnsupported: "System audio needs macOS 14.6 or later, or Windows 10/11.",
      systemAudioPermissionHint: "On macOS, the first recording asks for permission to record system audio. If the \"System\" meter stays flat, turn on SumMeet in System Settings → Privacy & Security → Screen & System Audio Recording.",
      systemAudioUnavailable: "System audio couldn't start, so SumMeet is recording the microphone only.",
      systemAudioSilentHint: "No system audio for a minute. If you're in a call, check the system audio permission (macOS: System Settings → Privacy & Security → Screen & System Audio Recording).",
      deviceSwitched: "🎧 Switched audio device to: {device}",
      sessionTitle: "Recording at {time}",
      uploadedFileSource: "File: {name}",
      uploadProcessing: 'Transcribing & summarizing "{name}"...',
      uploadDone: '✅ Transcribed and summarized "{name}"!',
      processingRecording: "Saving recording & generating AI Summary...",
      processingHint: "Your Transcript and AI Summary will appear automatically in a few seconds...",
      recordingDone: "✅ Done! Recording and AI Summary are shown right below!",
      liveTranscribing: "Auto-transcribing latest audio...",
      listening: "Listening to the microphone ({count} segments captured)",
      audioSignal: "Audio Signal:",
      callDetectedTitle: "Looks like you're in a call",
      callDetectedHint: "Another app is using your microphone. Record this meeting?",
      callDetectedBody: "Another app is using your microphone. Open SumMeet to record this meeting.",
      callDetectedAction: "Record",
      callDetectedStart: "Start recording",
      callDetectedDismiss: "Dismiss",
      systemSignal: "System:",
      callDetectionIntroTitle: "SumMeet will notify you when a call starts",
      callDetectionIntroBody: "When another app starts using your microphone, SumMeet will suggest recording with a notification like this.",
    },
    recordingResult: {
      title: "Latest Recording Result: {title}",
      heightMedium: "Medium",
      heightMediumTitle: "Medium height",
      heightLarge: "Large",
      heightLargeTitle: "Large height",
      heightMax: "Max",
      heightMaxTitle: "Max height",
      closeQuickView: "Close quick view",
      savedAudioAt: "Saved audio at:",
      resizeHint: "💡 Drag the middle divider or bottom handle to resize reading panels",
      transcriptTitle: "📝 Transcribed Speech ({count} segments)",
      resetSplit: "Reset 50/50",
      widenColumn: "Widen",
      resizeColumnsTitle: "Drag left/right to resize columns",
      resizeHeightTitle: "Drag up/down to resize height",
      summaryTitle: "✨ AI Summary:",
      overviewHeading: "📌 Overview",
      keyTakeawaysHeading: "🎯 Key Takeaways",
      outlineHeading: "📑 Detailed Outline",
      actionItemsHeading: "✅ Action Items",
      defaultSpeaker: "Audio",
    },
    workspace: {
      brandSubtitle: "Recording & AI Summary Manager",
      collapseSidebar: "Collapse sidebar",
      recordingsHeading: "Recordings ({count})",
      clearAll: "Clear All",
      emptyListTitle: "No recordings yet",
      emptyListHint: "Click 'Start Recording' above to capture your voice through the microphone.",
      segmentsUnit: "segs",
      deleteRecordingTitle: "Delete recording",
      savedFilesHeading: "Saved Files ({count})",
      refresh: "Refresh",
      noSavedFiles: "No .wav files in the recordings folder.",
      deleteFileTitle: "Delete file",
      wideTranscript: "Wide Transcript",
      wideSummary: "Wide Summary",
      deleteActiveRecording: "Delete Recording",
      resizePanelsTitle: "Drag left/right to resize Transcript and Summary panels",
      resizeHeightTitle: "Drag up/down to resize main panels height",
      emptyStateTitle: "No Recordings Yet",
      emptyStateHint: "Click 'Start Recording' at the top right to capture your voice through the microphone, or upload an existing audio/video file.",
      recordingDeleted: '🗑️ Deleted recording "{name}"',
      allCleared: "🧹 Cleared all recordings and audio files!",
    },
    tabs: {
      transcript: "Transcript",
      summary: "Smart Summary",
      askFred: "AskBot AI Chat",
    },
    transcript: {
      searchPlaceholder: "Search keywords, speaker names, or phrases...",
      allSpeakers: "All Speakers",
      channelMicTag: "Your Mic",
      channelSystemTag: "Meeting System Audio",
      renameSpeakerTooltip: "Click to rename this speaker across the entire meeting",
      renameSpeakerPrompt: "Enter new speaker name:",
      emptyState: "No transcript segments match your filter.",
      clickToSeek: "Click to jump audio playback to this timestamp",
      addLiveNotePlaceholder: "Type a simulated utterance or quick live note into transcript...",
      addLiveNoteButton: "Add Segment",
      defaultMicSpeaker: "You (Mic)",
      remoteSpeaker: "Speaker {n} (System / Video)",
    },
    summary: {
      templateLabel: "AI Summary Template:",
      regenerateButton: "Regenerate AI Summary",
      regenerating: "Generating summary...",
      overviewTitle: "Executive Overview",
      actionItemsTitle: "Action Items & Owners",
      keyDecisionsTitle: "Key Decisions",
      outlineTitle: "Time-stamped Topic Outline",
      keywordsTitle: "Key Topics & Keywords",
      providerBadge: "Powered by:",
      updatedToast: 'Updated summary using "{template}" template!',
      templates: {
        general: "General Meeting Notes",
        sales: "Sales & Client Discovery",
        standup: "Engineering Standup & Sprint",
        interview: "Candidate Interview / 1-on-1",
      },
    },
    session: {
      systemAudioParticipant: "System Audio / Video",
      liveOverview: "Recording and analyzing the content in real time...",
      liveKeyword: "Live Recording",
      headphoneKeyword: "AirPods Dual-Stream",
      speakerKeyword: "Speaker Mode",
      liveProvider: "Live Stream",
    },
    summaryDefaults: {
      overview: "Summary generated by SumMeet.",
      actionTask: "Follow up on discussion item",
      assignee: "Team",
      dueDate: "This Week",
      topic: "Topic {n}",
      keywords: ["Meeting", "Action Items", "Dual-Stream"],
    },
    askFred: {
      title: "AskBot — AI Meeting Copilot",
      subtitle: "Ask anything about this meeting. Responses include clickable timestamp citations.",
      inputPlaceholder: "Ask about action items, decisions, risks, or draft a follow-up email...",
      sendButton: "Ask",
      thinking: "AskBot is analyzing transcript...",
      suggestedQuestions: [
        "What are the action items and who owns each one?",
        "What key architectural or product decisions were made?",
        "Draft a concise follow-up email summarizing this meeting",
        "What concerns or risks did the remote participants raise?",
      ],
      clearHistory: "Clear chat",
      citationsLabel: "Transcript Citations:",
    },
    calendar: {
      modalTitle: "Calendar Integration & One-Click Recording",
      upcomingTitle: "Upcoming Meetings Today",
      recordThisMeeting: "Record Meeting",
      syncIcalLabel: "Google Calendar iCal / ICS Feed URL:",
      syncButton: "Sync Calendar",
      syncedEventTitle: "Google Calendar Synced — Design & Engineering Review",
      syncedEventStart: "17:30 Today",
      syncedEventParticipants: ["You (Minh Phúc)", "Design Team", "Backend Lead"],
      syncedToast: "Synced a new event from Google Calendar!",
      sessionDevice: "AirPods Pro (Dual-Stream: System Loopback + Mic)",
      sessionCreatedToast: "Created meeting notes for \"{title}\"",
    },
    exportModal: {
      title: "Export & Share Meeting Intelligence",
      markdownTab: "Markdown (.md)",
      pdfTab: "PDF Report",
      downloadMarkdown: "Download .md",
      copyMarkdown: "Copy Markdown",
      copied: "Copied!",
      downloaded: "Markdown file (.md) downloaded!",
      markdownPreview: "Markdown Preview",
      printPdfButton: "Print / Save as PDF",
    },
    settings: {
      title: "OpenRouter AI Settings",
      subtitle: "Transcription, summaries and AI chat all run through OpenRouter with your API key.",
      modelLabel: "OpenRouter model (Transcription, Summary, Chat):",
      modelHint: "Must accept audio input for transcription. Default: google/gemini-3.1-flash-lite",
      languageLabel: "Primary Transcription Language:",
      languageOptions: {
        vi: "Vietnamese",
        en: "English",
        auto: "Auto-detect",
      },
      keyTitle: "OpenRouter API key",
      keyChangeLabel: "Enter a new key to replace the current one:",
      keyChangeButton: "Validate & Replace Key",
      keyRemoveButton: "Remove key from this device",
      keySavedToast: "New OpenRouter key validated and saved!",
      callDetectionLabel: "Suggest recording when a call is detected",
      callDetectionHint: "SumMeet only checks whether another app is using the microphone. It never reads the audio.",
      autostartLabel: "Open SumMeet at login",
      autostartHint: "SumMeet runs in the background in the menu bar or system tray and does not open its window at startup.",
      autostartReadError: "Could not read the open-at-login setting.",
      autostartSaveError: "Configuration saved, but the open-at-login setting could not be changed.",
      saveButton: "Save Configuration",
      savedToast: "AI & Audio configuration saved!",
      closeButton: "Close",
    },
    onboarding: {
      title: "Connect OpenRouter to get started",
      subtitle: "SumMeet uses OpenRouter for transcription, summaries and AI chat. Enter your OpenRouter API key (create one at openrouter.ai/keys). It is stored in the operating system credential store, never in files or browser storage.",
      keyLabel: "OpenRouter API key",
      keyPlaceholder: "sk-or-v1-...",
      saveButton: "Validate & Save Key",
      validating: "Validating key...",
      loading: "Loading configuration...",
    },
    errors: {
      boundaryTitle: "Something went wrong in this panel",
      boundaryRetry: "Reload component",
      invalidRequest: "The request is invalid.",
      noTranscript: "There is no transcript to summarize yet.",
      questionTooLong: "The question exceeds 2000 characters.",
      chatUnavailable: "Sorry, OpenRouter could not be reached. Please retry or check your API key in Settings.",
      transcriptionFailed: "Could not transcribe the audio with OpenRouter.",
      emptyKey: "Please enter your OpenRouter API key.",
      invalidKey: "The OpenRouter API key is invalid or has been revoked.",
      networkError: "Could not reach OpenRouter. Check your network and try again.",
      keychainError: "Could not access the operating system credential store.",
      noInputDevice: "No microphone found. Check your input device and microphone permission, then try again.",
      inputDeviceUnavailable: "The selected microphone isn't available. Choose another one or use the system default, then try again.",
      recordingActive: "A recording is already running. Stop it first.",
      recordingFailed: "The recording operation failed. Please try again.",
      unsupportedMedia: "Could not decode this file. Use WAV, MP3, AAC, M4A, OGG or FLAC.",
    },
    update: {
      title: "Update available",
      versionLine: "SumMeet {version} is ready to install",
      notesHeading: "What's new",
      updateNow: "Update now",
      later: "Later",
      downloading: "Downloading update",
      installFailed: "The update could not be installed. Please try again later.",
      buttonLabel: "Update {version} available",
      settingsTitle: "App updates",
      currentVersion: "Current version: {version}",
      checkButton: "Check for updates",
      versionLabel: "Version {version}",
      checkingStatus: "Checking for updates…",
      upToDate: "You're on the latest version.",
      checkFailed: "Could not check for updates. Please try again later.",
      tryAgain: "Try again",
      menuCheckForUpdates: "Check for Updates…",
    },
    tray: {
      openLabel: "Open SumMeet",
      quitLabel: "Quit SumMeet",
    },
  },
};

export function getDictionary(locale: string): Dictionary {
  if (locale === "en") {
    return DICTIONARIES.en;
  }
  return DICTIONARIES.vi;
}
