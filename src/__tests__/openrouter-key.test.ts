import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { getDictionary } from "@/i18n/dictionaries";
import {
  checkOpenRouterKey,
  deleteStoredOpenRouterKey,
  getStoredOpenRouterKey,
  storeOpenRouterKey,
} from "@/services/ai/openrouter-key";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const invokeMock = vi.mocked(invoke);

describe("OpenRouter key check", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("accepts a key when GET /key answers 200", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));

    const result = await checkOpenRouterKey({ apiKey: "sk-or-ok", locale: "vi" });

    expect(result.success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/key");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer sk-or-ok");
  });

  it.each([401, 403])("reports an invalid key on HTTP %i", async (status) => {
    fetchMock.mockResolvedValue(new Response("nope", { status }));

    const result = await checkOpenRouterKey({ apiKey: "sk-or-bad", locale: "en" });

    expect(result).toEqual({
      success: false,
      error: getDictionary("en").errors.invalidKey,
    });
  });

  it("reports a network error on other statuses and rejected requests", async () => {
    fetchMock.mockResolvedValueOnce(new Response("busy", { status: 429 }));
    const rateLimited = await checkOpenRouterKey({ apiKey: "k", locale: "vi" });

    fetchMock.mockResolvedValueOnce(new Response("gone", { status: 404 }));
    const notFound = await checkOpenRouterKey({ apiKey: "k", locale: "vi" });

    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const offline = await checkOpenRouterKey({ apiKey: "k", locale: "vi" });

    const expected = {
      success: false,
      error: getDictionary("vi").errors.networkError,
    };
    expect(rateLimited).toEqual(expected);
    expect(notFound).toEqual(expected);
    expect(offline).toEqual(expected);
  });
});

describe("OpenRouter credential commands", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads the stored key through get_openrouter_key", async () => {
    invokeMock.mockResolvedValue("sk-or-stored");

    const result = await getStoredOpenRouterKey();

    expect(invokeMock).toHaveBeenCalledWith("get_openrouter_key");
    expect(result).toEqual({ success: true, data: "sk-or-stored" });
  });

  it("reports a failed read without throwing", async () => {
    invokeMock.mockRejectedValue("keychain locked");

    const result = await getStoredOpenRouterKey();

    expect(result.success).toBe(false);
  });

  it("stores and deletes the key through the Rust commands", async () => {
    invokeMock.mockResolvedValue(undefined);

    const stored = await storeOpenRouterKey({ apiKey: "sk-or-new", locale: "vi" });
    const deleted = await deleteStoredOpenRouterKey("vi");

    expect(invokeMock).toHaveBeenNthCalledWith(1, "set_openrouter_key", {
      key: "sk-or-new",
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "delete_openrouter_key");
    expect(stored.success).toBe(true);
    expect(deleted.success).toBe(true);
  });

  it("maps Rust errors to a localized keychain error without echoing the key", async () => {
    invokeMock.mockRejectedValue("platform secure storage failure");

    const stored = await storeOpenRouterKey({ apiKey: "sk-or-secret", locale: "en" });
    const deleted = await deleteStoredOpenRouterKey("en");

    const expected = getDictionary("en").errors.keychainError;
    expect(stored).toEqual({ success: false, error: expected });
    expect(deleted).toEqual({ success: false, error: expected });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      "sk-or-secret"
    );
  });
});
