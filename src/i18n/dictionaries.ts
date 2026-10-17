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
    callDetectedAppHint: string;
    callDetectedBody: string;
    callDetectedAppBody: string;
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
    keyCheckButton: string;
    keyValidStatus: string;
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
    appTagline:
      "Ứng dụng ghi âm cuộc họp, gỡ băng thời gian thực và tóm tắt thông minh bằng AI.",
    nav: {
      meetings: "Cuộc họp",
      calendar: "Lịch họp",
      settings: "Cài đặt",
      exportShare: "Xuất",
      newRecording: "Ghi âm",
      uploadFile: "Tải file",
      showSidebar: "Mở danh sách",
    },
    theme: {
      label: "Giao diện",
      system: "Hệ thống",
      light: "Sáng",
      dark: "Tối",
    },
    recorder: {
      controlsLabel: "Điều khiển ghi âm cuộc họp",
      readyTitle: "Sẵn sàng ghi âm",
      recordingTitle: "Đang ghi âm...",
      captureHint: "• Không quay màn hình",
      inputDeviceLabel: "Micro dùng để ghi âm",
      systemDefaultDevice: "Mặc định ({device})",
      startRecording: "Ghi âm",
      stopRecording: "Dừng",
      includeSystemAudio: "Âm thanh hệ thống",
      systemAudioUnsupported: "Thu âm thanh hệ thống cần macOS 14.6 trở lên hoặc Windows 10/11.",
      systemAudioPermissionHint: "Trên macOS, lần ghi đầu tiên sẽ hỏi quyền ghi âm thanh hệ thống. Nếu đồng hồ \"Hệ thống\" đứng yên, hãy bật SumMeet trong Cài đặt hệ thống → Quyền riêng tư & Bảo mật → Ghi màn hình & âm thanh hệ thống.",
      systemAudioUnavailable: "Không thu được âm thanh hệ thống, SumMeet đang ghi âm chỉ từ micro.",
      systemAudioSilentHint: "Chưa nghe thấy âm thanh hệ thống trong 1 phút. Nếu đang trong cuộc gọi, hãy kiểm tra quyền ghi âm thanh hệ thống (macOS: Cài đặt hệ thống → Quyền riêng tư & Bảo mật → Ghi màn hình & âm thanh hệ thống).",
      deviceSwitched: "🎧 Đã chuyển sang: {device}",
      sessionTitle: "Ghi âm lúc {time}",
      uploadedFileSource: "File: {name}",
      uploadProcessing: 'Đang xử lý "{name}"...',
      uploadDone: '✅ Đã xử lý xong "{name}"!',
      processingRecording: "Đang lưu & tóm tắt...",
      processingHint: "Transcript và tóm tắt sẽ hiển thị sau vài giây...",
      recordingDone: "✅ Đã lưu và tóm tắt xong!",
      liveTranscribing: "Đang gỡ băng...",
      listening: "Đang nghe ({count} đoạn)",
      audioSignal: "Micro:",
      callDetectedTitle: "Phát hiện cuộc gọi",
      callDetectedHint: "Ứng dụng khác đang dùng micro. Ghi âm?",
      callDetectedAppHint: "{app} đang dùng micro. Ghi âm?",
      callDetectedBody: "Một ứng dụng khác đang dùng micro. Mở SumMeet để ghi âm cuộc họp này.",
      callDetectedAppBody: "{app} đang dùng micro. Mở SumMeet để ghi âm cuộc họp này.",
      callDetectedAction: "Ghi âm",
      callDetectedStart: "Ghi âm",
      callDetectedDismiss: "Bỏ qua",
      systemSignal: "Hệ thống:",
      callDetectionIntroTitle: "SumMeet sẽ báo khi bạn vào cuộc gọi",
      callDetectionIntroBody: "Khi ứng dụng khác bắt đầu dùng micro, SumMeet sẽ gợi ý ghi âm bằng thông báo như thế này.",
    },
    recordingResult: {
      title: "Kết quả: {title}",
      heightMedium: "Vừa",
      heightMediumTitle: "Chiều cao vừa",
      heightLarge: "Rộng",
      heightLargeTitle: "Mở rộng khung đọc",
      heightMax: "Tối đa",
      heightMaxTitle: "Phóng to tối đa",
      closeQuickView: "Đóng khung nhanh",
      savedAudioAt: "File:",
      resizeHint: "💡 Kéo thanh ngăn để đổi kích thước",
      transcriptTitle: "📝 Transcript ({count})",
      resetSplit: "50/50",
      widenColumn: "Mở rộng",
      resizeColumnsTitle: "Kéo qua trái/phải để thay đổi độ rộng 2 khung",
      resizeHeightTitle: "Kéo lên/xuống để phóng to hoặc thu nhỏ chiều cao khung đọc",
      summaryTitle: "✨ Tóm tắt AI",
      overviewHeading: "📌 Tổng quan",
      keyTakeawaysHeading: "🎯 Điểm chính",
      outlineHeading: "📑 Dàn ý",
      actionItemsHeading: "✅ Việc cần làm",
      defaultSpeaker: "Âm thanh",
    },
    workspace: {
      brandSubtitle: "Ghi âm & Tóm tắt AI",
      collapseSidebar: "Thu gọn thanh bên",
      recordingsHeading: "Bản ghi ({count})",
      clearAll: "Xóa hết",
      emptyListTitle: "Chưa có bản ghi",
      emptyListHint: "Bấm 'Ghi âm' ở trên để bắt đầu.",
      segmentsUnit: "đoạn",
      deleteRecordingTitle: "Xóa bản ghi",
      savedFilesHeading: "File ({count})",
      refresh: "Làm mới",
      noSavedFiles: "Chưa có file .wav nào.",
      deleteFileTitle: "Xóa file",
      wideTranscript: "Transcript",
      wideSummary: "Tóm tắt",
      deleteActiveRecording: "Xóa",
      resizePanelsTitle: "Kéo để đổi độ rộng",
      resizeHeightTitle: "Kéo để đổi chiều cao",
      emptyStateTitle: "Chưa có bản ghi",
      emptyStateHint: "Bấm 'Ghi âm' hoặc 'Tải file' ở góc trên phải để bắt đầu.",
      recordingDeleted: '🗑️ Đã xóa "{name}"',
      allCleared: "🧹 Đã xóa toàn bộ bản ghi!",
    },
    tabs: {
      transcript: "Transcript",
      summary: "Tóm tắt",
      askFred: "Chat AI",
    },
    transcript: {
      searchPlaceholder: "Tìm nội dung, người nói...",
      allSpeakers: "Tất cả",
      channelMicTag: "Mic",
      channelSystemTag: "Hệ thống",
      renameSpeakerTooltip: "Đổi tên người nói",
      renameSpeakerPrompt: "Tên người nói:",
      emptyState: "Không có đoạn thoại nào.",
      clickToSeek: "Phát từ mốc này",
      addLiveNotePlaceholder: "Thêm ghi chú nhanh...",
      addLiveNoteButton: "Thêm",
      defaultMicSpeaker: "Bạn (Mic)",
      remoteSpeaker: "Người nói {n} (Máy / Video)",
    },
    summary: {
      templateLabel: "Mẫu:",
      regenerateButton: "Tạo lại",
      regenerating: "Đang tạo...",
      overviewTitle: "Tổng quan",
      actionItemsTitle: "Việc cần làm",
      keyDecisionsTitle: "Quyết định chính",
      outlineTitle: "Dàn ý",
      keywordsTitle: "Từ khóa",
      providerBadge: "Model:",
      updatedToast: 'Đã cập nhật theo mẫu "{template}"!',
      templates: {
        general: "Họp chung",
        sales: "Tư vấn & Sales",
        standup: "Standup / Kỹ thuật",
        interview: "Phỏng vấn / 1-1",
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
      title: "Chat AI",
      subtitle: "Hỏi đáp nội dung cuộc họp kèm trích dẫn.",
      inputPlaceholder: "Hỏi về nhiệm vụ, quyết định, hoặc yêu cầu viết email...",
      sendButton: "Gửi",
      thinking: "Đang phân tích...",
      suggestedQuestions: [
        "Tóm tắt các việc cần làm và người phụ trách?",
        "Những quyết định chính đã chốt là gì?",
        "Soạn email follow-up ngắn gọn sau cuộc họp",
        "Có vấn đề hoặc rủi ro nào được nêu ra?",
      ],
      clearHistory: "Xóa",
      citationsLabel: "Trích dẫn:",
    },
    calendar: {
      modalTitle: "Lịch họp",
      upcomingTitle: "Cuộc họp sắp tới",
      recordThisMeeting: "Ghi âm",
      syncIcalLabel: "URL Lịch Google Calendar (iCal / ICS):",
      syncButton: "Đồng bộ",
      syncedEventTitle: "Đã đồng bộ từ Google Calendar — Rà soát Thiết kế & Kỹ thuật",
      syncedEventStart: "17:30 Hôm nay",
      syncedEventParticipants: ["Bạn (Minh Phúc)", "Nhóm Thiết kế", "Trưởng nhóm Backend"],
      syncedToast: "Đã đồng bộ sự kiện mới!",
      sessionDevice: "AirPods Pro (Dual-Stream: System Loopback + Mic)",
      sessionCreatedToast: "Đã tạo biên bản cho \"{title}\"",
    },
    exportModal: {
      title: "Xuất & Chia sẻ",
      markdownTab: "Markdown (.md)",
      pdfTab: "PDF",
      downloadMarkdown: "Tải .md",
      copyMarkdown: "Sao chép",
      copied: "Đã chép!",
      downloaded: "Đã tải file .md!",
      markdownPreview: "Xem trước",
      printPdfButton: "In / PDF",
    },
    settings: {
      title: "Cài đặt",
      subtitle: "Cấu hình OpenRouter, ngôn ngữ và ứng dụng.",
      modelLabel: "Model OpenRouter:",
      modelHint: "Mặc định: google/gemini-3.1-flash-lite",
      languageLabel: "Ngôn ngữ nhận diện:",
      languageOptions: {
        vi: "Tiếng Việt",
        en: "English",
        auto: "Tự động",
      },
      keyTitle: "Khóa API OpenRouter",
      keyChangeLabel: "Khóa API mới:",
      keyChangeButton: "Lưu khóa",
      keyCheckButton: "Kiểm tra khóa",
      keyValidStatus: "Khóa API đang hoạt động tốt.",
      keyRemoveButton: "Xóa khóa",
      keySavedToast: "Đã lưu khóa OpenRouter mới!",
      callDetectionLabel: "Gợi ý ghi âm khi phát hiện cuộc gọi",
      callDetectionHint: "Chỉ kiểm tra trạng thái micro, không đọc âm thanh.",
      autostartLabel: "Mở SumMeet khi đăng nhập",
      autostartHint: "Chạy nền trên thanh menu / khay hệ thống khi khởi động.",
      autostartReadError: "Không thể đọc cài đặt mở SumMeet khi đăng nhập.",
      autostartSaveError: "Đã lưu cấu hình, nhưng không thể thay đổi cài đặt mở SumMeet khi đăng nhập.",
      saveButton: "Lưu",
      savedToast: "Đã lưu cài đặt!",
      closeButton: "Đóng",
    },
    onboarding: {
      title: "Kết nối OpenRouter",
      subtitle: "Nhập khóa API OpenRouter (tạo tại openrouter.ai/keys). Khóa được lưu an toàn trong hệ điều hành.",
      keyLabel: "Khóa API OpenRouter",
      keyPlaceholder: "sk-or-v1-...",
      saveButton: "Lưu khóa",
      validating: "Đang kiểm tra...",
      loading: "Đang tải...",
    },
    errors: {
      boundaryTitle: "Đã xảy ra lỗi hiển thị tại khu vực này",
      boundaryRetry: "Tải lại",
      invalidRequest: "Dữ liệu yêu cầu không hợp lệ.",
      noTranscript: "Chưa có nội dung gỡ băng để tóm tắt.",
      questionTooLong: "Câu hỏi vượt quá 2000 ký tự.",
      chatUnavailable: "Xin lỗi, không thể kết nối OpenRouter. Vui lòng thử lại hoặc kiểm tra khóa API trong Cài đặt.",
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
      versionLine: "SumMeet {version} đã sẵn sàng",
      notesHeading: "Có gì mới",
      updateNow: "Cập nhật",
      later: "Để sau",
      downloading: "Đang tải",
      installFailed: "Không thể cài đặt bản cập nhật. Vui lòng thử lại sau.",
      buttonLabel: "Có bản {version} — bấm để cập nhật",
      settingsTitle: "Cập nhật",
      currentVersion: "Phiên bản: {version}",
      checkButton: "Kiểm tra",
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
    appTagline:
      "AI meeting recorder with real-time transcription, smart summaries, and meeting Q&A.",
    nav: {
      meetings: "Meetings",
      calendar: "Calendar",
      settings: "Settings",
      exportShare: "Export",
      newRecording: "Record",
      uploadFile: "Upload",
      showSidebar: "Show sidebar",
    },
    theme: {
      label: "Theme",
      system: "System",
      light: "Light",
      dark: "Dark",
    },
    recorder: {
      controlsLabel: "Meeting recorder controls",
      readyTitle: "Ready to record",
      recordingTitle: "Recording...",
      captureHint: "• No screen video",
      inputDeviceLabel: "Recording microphone",
      systemDefaultDevice: "Default ({device})",
      startRecording: "Record",
      stopRecording: "Stop",
      includeSystemAudio: "System audio",
      systemAudioUnsupported: "System audio needs macOS 14.6 or later, or Windows 10/11.",
      systemAudioPermissionHint: "On macOS, the first recording asks for permission to record system audio. If the \"System\" meter stays flat, turn on SumMeet in System Settings → Privacy & Security → Screen & System Audio Recording.",
      systemAudioUnavailable: "System audio couldn't start, so SumMeet is recording the microphone only.",
      systemAudioSilentHint: "No system audio for a minute. If you're in a call, check the system audio permission (macOS: System Settings → Privacy & Security → Screen & System Audio Recording).",
      deviceSwitched: "🎧 Switched to: {device}",
      sessionTitle: "Recording at {time}",
      uploadedFileSource: "File: {name}",
      uploadProcessing: 'Processing "{name}"...',
      uploadDone: '✅ Processed "{name}"!',
      processingRecording: "Saving & summarizing...",
      processingHint: "Transcript and summary will appear in a few seconds...",
      recordingDone: "✅ Saved and summarized!",
      liveTranscribing: "Transcribing...",
      listening: "Listening ({count} segments)",
      audioSignal: "Mic:",
      callDetectedTitle: "Call detected",
      callDetectedHint: "Another app is using your mic. Record?",
      callDetectedAppHint: "{app} is using your mic. Record?",
      callDetectedBody: "Another app is using your microphone. Open SumMeet to record this meeting.",
      callDetectedAppBody: "{app} is using your microphone. Open SumMeet to record this meeting.",
      callDetectedAction: "Record",
      callDetectedStart: "Record",
      callDetectedDismiss: "Dismiss",
      systemSignal: "System:",
      callDetectionIntroTitle: "SumMeet will notify you when a call starts",
      callDetectionIntroBody: "When another app starts using your microphone, SumMeet will suggest recording with a notification like this.",
    },
    recordingResult: {
      title: "Result: {title}",
      heightMedium: "Med",
      heightMediumTitle: "Medium height",
      heightLarge: "Large",
      heightLargeTitle: "Large height",
      heightMax: "Max",
      heightMaxTitle: "Max height",
      closeQuickView: "Close quick view",
      savedAudioAt: "File:",
      resizeHint: "💡 Drag handles to resize",
      transcriptTitle: "📝 Transcript ({count})",
      resetSplit: "50/50",
      widenColumn: "Widen",
      resizeColumnsTitle: "Drag left/right to resize columns",
      resizeHeightTitle: "Drag up/down to resize height",
      summaryTitle: "✨ AI Summary",
      overviewHeading: "📌 Overview",
      keyTakeawaysHeading: "🎯 Key Takeaways",
      outlineHeading: "📑 Outline",
      actionItemsHeading: "✅ Action Items",
      defaultSpeaker: "Audio",
    },
    workspace: {
      brandSubtitle: "AI Meeting Notes",
      collapseSidebar: "Collapse sidebar",
      recordingsHeading: "Recordings ({count})",
      clearAll: "Clear",
      emptyListTitle: "No recordings",
      emptyListHint: "Click 'Record' above to start.",
      segmentsUnit: "segs",
      deleteRecordingTitle: "Delete recording",
      savedFilesHeading: "Files ({count})",
      refresh: "Refresh",
      noSavedFiles: "No .wav files.",
      deleteFileTitle: "Delete file",
      wideTranscript: "Transcript",
      wideSummary: "Summary",
      deleteActiveRecording: "Delete",
      resizePanelsTitle: "Drag to resize width",
      resizeHeightTitle: "Drag to resize height",
      emptyStateTitle: "No Recordings",
      emptyStateHint: "Click 'Record' or 'Upload' at the top right to start.",
      recordingDeleted: '🗑️ Deleted "{name}"',
      allCleared: "🧹 Cleared all recordings!",
    },
    tabs: {
      transcript: "Transcript",
      summary: "Summary",
      askFred: "AI Chat",
    },
    transcript: {
      searchPlaceholder: "Search transcript...",
      allSpeakers: "All",
      channelMicTag: "Mic",
      channelSystemTag: "System",
      renameSpeakerTooltip: "Rename speaker",
      renameSpeakerPrompt: "Speaker name:",
      emptyState: "No matching segments.",
      clickToSeek: "Jump to timestamp",
      addLiveNotePlaceholder: "Add a quick note...",
      addLiveNoteButton: "Add",
      defaultMicSpeaker: "You (Mic)",
      remoteSpeaker: "Speaker {n} (System / Video)",
    },
    summary: {
      templateLabel: "Template:",
      regenerateButton: "Regenerate",
      regenerating: "Generating...",
      overviewTitle: "Overview",
      actionItemsTitle: "Action Items",
      keyDecisionsTitle: "Key Decisions",
      outlineTitle: "Outline",
      keywordsTitle: "Keywords",
      providerBadge: "Model:",
      updatedToast: 'Updated summary with "{template}"!',
      templates: {
        general: "General",
        sales: "Sales",
        standup: "Standup",
        interview: "Interview",
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
      title: "AI Chat",
      subtitle: "Ask about this meeting with timestamp citations.",
      inputPlaceholder: "Ask about tasks, decisions, or draft an email...",
      sendButton: "Send",
      thinking: "Thinking...",
      suggestedQuestions: [
        "What are the action items and owners?",
        "What key decisions were made?",
        "Draft a concise follow-up email",
        "What risks or concerns were raised?",
      ],
      clearHistory: "Clear",
      citationsLabel: "Citations:",
    },
    calendar: {
      modalTitle: "Calendar",
      upcomingTitle: "Upcoming Meetings",
      recordThisMeeting: "Record",
      syncIcalLabel: "Google Calendar iCal / ICS URL:",
      syncButton: "Sync",
      syncedEventTitle: "Google Calendar Synced — Design & Engineering Review",
      syncedEventStart: "17:30 Today",
      syncedEventParticipants: ["You (Minh Phúc)", "Design Team", "Backend Lead"],
      syncedToast: "Synced event from Calendar!",
      sessionDevice: "AirPods Pro (Dual-Stream: System Loopback + Mic)",
      sessionCreatedToast: "Created notes for \"{title}\"",
    },
    exportModal: {
      title: "Export & Share",
      markdownTab: "Markdown (.md)",
      pdfTab: "PDF",
      downloadMarkdown: "Download .md",
      copyMarkdown: "Copy",
      copied: "Copied!",
      downloaded: "Downloaded .md!",
      markdownPreview: "Preview",
      printPdfButton: "Print / PDF",
    },
    settings: {
      title: "Settings",
      subtitle: "Configure OpenRouter, language, and app behavior.",
      modelLabel: "OpenRouter model:",
      modelHint: "Default: google/gemini-3.1-flash-lite",
      languageLabel: "Transcription language:",
      languageOptions: {
        vi: "Vietnamese",
        en: "English",
        auto: "Auto",
      },
      keyTitle: "OpenRouter API key",
      keyChangeLabel: "New API key:",
      keyChangeButton: "Save Key",
      keyCheckButton: "Check Key",
      keyValidStatus: "API key is active and working.",
      keyRemoveButton: "Remove Key",
      keySavedToast: "Saved new OpenRouter key!",
      callDetectionLabel: "Suggest recording when a call is detected",
      callDetectionHint: "Checks microphone state only, never reads audio.",
      autostartLabel: "Open SumMeet at login",
      autostartHint: "Runs in the menu bar or system tray at startup.",
      autostartReadError: "Could not read the open-at-login setting.",
      autostartSaveError: "Configuration saved, but the open-at-login setting could not be changed.",
      saveButton: "Save",
      savedToast: "Settings saved!",
      closeButton: "Close",
    },
    onboarding: {
      title: "Connect OpenRouter",
      subtitle: "Enter your OpenRouter API key (from openrouter.ai/keys). Stored securely in the OS credential store.",
      keyLabel: "OpenRouter API key",
      keyPlaceholder: "sk-or-v1-...",
      saveButton: "Save Key",
      validating: "Validating...",
      loading: "Loading...",
    },
    errors: {
      boundaryTitle: "Something went wrong in this panel",
      boundaryRetry: "Reload",
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
      versionLine: "SumMeet {version} is ready",
      notesHeading: "What's new",
      updateNow: "Update",
      later: "Later",
      downloading: "Downloading",
      installFailed: "The update could not be installed. Please try again later.",
      buttonLabel: "Update {version} available",
      settingsTitle: "Updates",
      currentVersion: "Version: {version}",
      checkButton: "Check",
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
  if (locale === "vi") {
    return DICTIONARIES.vi;
  }
  return DICTIONARIES.en;
}
