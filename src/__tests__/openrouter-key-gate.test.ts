import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { getDictionary } from "@/i18n/dictionaries";
import { useMeetingStore } from "@/store/meeting-store";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const invokeMock = vi.mocked(invoke);
const STORAGE_KEY = "summarize-bot-clean-v4";
const SECRET_KEY = "sk-or-v1-secret-value";

describe("OpenRouter key gate store logic", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    useMeetingStore.setState({ openRouterKey: "", openRouterKeyStatus: "loading" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("starts in the loading state before the key is read", () => {
    expect(useMeetingStore.getState().openRouterKeyStatus).toBe("loading");
  });

  it("opens the gate when a stored key exists", async () => {
    invokeMock.mockResolvedValue(SECRET_KEY);

    await useMeetingStore.getState().loadOpenRouterKey();

    expect(invokeMock).toHaveBeenCalledWith("get_openrouter_key");
    expect(useMeetingStore.getState()).toMatchObject({
      openRouterKey: SECRET_KEY,
      openRouterKeyStatus: "ready",
    });
  });

  it("shows onboarding when no key is stored or the credential store fails", async () => {
    invokeMock.mockResolvedValueOnce(null);
    await useMeetingStore.getState().loadOpenRouterKey();
    expect(useMeetingStore.getState().openRouterKeyStatus).toBe("missing");

    useMeetingStore.setState({ openRouterKeyStatus: "loading" });
    invokeMock.mockRejectedValueOnce("keychain locked");
    await useMeetingStore.getState().loadOpenRouterKey();
    expect(useMeetingStore.getState()).toMatchObject({
      openRouterKey: "",
      openRouterKeyStatus: "missing",
    });
  });

  it("validates the key, stores it and opens the gate on save", async () => {
    useMeetingStore.setState({ openRouterKeyStatus: "missing" });
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    invokeMock.mockResolvedValue(undefined);

    const result = await useMeetingStore
      .getState()
      .saveOpenRouterKey({ key: `  ${SECRET_KEY}  `, locale: "vi" });

    expect(result.success).toBe(true);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      `Bearer ${SECRET_KEY}`
    );
    expect(invokeMock).toHaveBeenCalledWith("set_openrouter_key", {
      key: SECRET_KEY,
    });
    expect(useMeetingStore.getState()).toMatchObject({
      openRouterKey: SECRET_KEY,
      openRouterKeyStatus: "ready",
    });
  });

  it("keeps the gate closed and stores nothing when the key is rejected", async () => {
    useMeetingStore.setState({ openRouterKeyStatus: "missing" });
    fetchMock.mockResolvedValue(new Response("nope", { status: 401 }));

    const result = await useMeetingStore
      .getState()
      .saveOpenRouterKey({ key: "sk-or-bad", locale: "en" });

    expect(result).toEqual({
      success: false,
      error: getDictionary("en").errors.invalidKey,
    });
    expect(invokeMock).not.toHaveBeenCalled();
    expect(useMeetingStore.getState()).toMatchObject({
      openRouterKey: "",
      openRouterKeyStatus: "missing",
    });
  });

  it("keeps the gate closed and stores nothing on a network error", async () => {
    useMeetingStore.setState({ openRouterKeyStatus: "missing" });
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await useMeetingStore
      .getState()
      .saveOpenRouterKey({ key: "sk-or-any", locale: "vi" });

    expect(result.error).toBe(getDictionary("vi").errors.networkError);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(useMeetingStore.getState().openRouterKeyStatus).toBe("missing");
  });

  it("rejects a blank key without any request", async () => {
    const result = await useMeetingStore
      .getState()
      .saveOpenRouterKey({ key: "   ", locale: "vi" });

    expect(result.error).toBe(getDictionary("vi").errors.emptyKey);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("keeps the gate closed when the credential store rejects the key", async () => {
    useMeetingStore.setState({ openRouterKeyStatus: "missing" });
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    invokeMock.mockRejectedValue("platform secure storage failure");

    const result = await useMeetingStore
      .getState()
      .saveOpenRouterKey({ key: SECRET_KEY, locale: "vi" });

    expect(result.error).toBe(getDictionary("vi").errors.keychainError);
    expect(useMeetingStore.getState()).toMatchObject({
      openRouterKey: "",
      openRouterKeyStatus: "missing",
    });
  });

  it("returns to onboarding after the key is removed", async () => {
    useMeetingStore.setState({
      openRouterKey: SECRET_KEY,
      openRouterKeyStatus: "ready",
    });
    invokeMock.mockResolvedValue(undefined);

    const result = await useMeetingStore.getState().removeOpenRouterKey("vi");

    expect(invokeMock).toHaveBeenCalledWith("delete_openrouter_key");
    expect(result.success).toBe(true);
    expect(useMeetingStore.getState()).toMatchObject({
      openRouterKey: "",
      openRouterKeyStatus: "missing",
    });
  });

  it("keeps the key when removal fails", async () => {
    useMeetingStore.setState({
      openRouterKey: SECRET_KEY,
      openRouterKeyStatus: "ready",
    });
    invokeMock.mockRejectedValue("platform secure storage failure");

    const result = await useMeetingStore.getState().removeOpenRouterKey("vi");

    expect(result.success).toBe(false);
    expect(useMeetingStore.getState().openRouterKeyStatus).toBe("ready");
  });

  it("never writes the key to localStorage", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    invokeMock.mockResolvedValue(undefined);

    await useMeetingStore
      .getState()
      .saveOpenRouterKey({ key: SECRET_KEY, locale: "vi" });
    useMeetingStore.getState().updateSettings({ openRouterModel: "x/y" });

    const persisted = localStorage.getItem(STORAGE_KEY) ?? "";
    expect(persisted).toContain("x/y");
    expect(persisted).not.toContain(SECRET_KEY);
    expect(persisted).not.toContain("openRouterKey");
  });

  it("drops legacy provider keys from persisted settings and keeps meetings", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 0,
        state: {
          meetings: [{ id: "mtg-keep", title: "Keep me" }],
          selectedMeetingId: "mtg-keep",
          calendarEvents: [],
          settings: {
            legacyGatewayApiKey: "legacy-gw-secret",
            deepgramApiKey: "legacy-dg-secret",
            openaiApiKey: "legacy-oa-secret",
            notionApiKey: "legacy-notion-secret",
            transcriptionLanguage: "en",
          },
        },
      })
    );

    await useMeetingStore.persist.rehydrate();

    const state = useMeetingStore.getState();
    expect(state.settings).toEqual({
      openRouterModel: "google/gemini-3.1-flash-lite",
      transcriptionLanguage: "en",
      callDetectionEnabled: true,
    });
    expect(state.meetings[0].id).toBe("mtg-keep");
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain("legacy-");
  });
});
