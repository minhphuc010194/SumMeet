import { invoke } from "@tauri-apps/api/core";
import type { ApiResponse, SupportedLocale } from "@/types/meeting";
import { getDictionary } from "@/i18n/dictionaries";
import {
  OPENROUTER_BASE_URL,
  buildOpenRouterHeaders,
  fetchWithRetryAndTimeout,
} from "@/services/ai/provider-registry";

export async function checkOpenRouterKey(params: {
  apiKey: string;
  locale: SupportedLocale;
}): Promise<ApiResponse<null>> {
  const errors = getDictionary(params.locale).errors;

  try {
    const response = await fetchWithRetryAndTimeout({
      providerName: "OpenRouter-KeyCheck",
      url: `${OPENROUTER_BASE_URL}/key`,
      timeoutMs: 15000,
      maxRetries: 0,
      init: { method: "GET", headers: buildOpenRouterHeaders(params.apiKey) },
    });

    if (response.ok) {
      return { success: true };
    }

    const isRejectedKey = response.status === 401 || response.status === 403;
    return {
      success: false,
      error: isRejectedKey ? errors.invalidKey : errors.networkError,
    };
  } catch (error) {
    console.error("[OpenRouterKey] Key check failed:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: errors.networkError };
  }
}

export async function getStoredOpenRouterKey(): Promise<
  ApiResponse<string | null>
> {
  try {
    return {
      success: true,
      data: await invoke<string | null>("get_openrouter_key"),
    };
  } catch (error) {
    console.error("[OpenRouterKey] Failed to read stored key:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false };
  }
}

export async function storeOpenRouterKey(params: {
  apiKey: string;
  locale: SupportedLocale;
}): Promise<ApiResponse<null>> {
  try {
    await invoke("set_openrouter_key", { key: params.apiKey });
    return { success: true };
  } catch (error) {
    console.error("[OpenRouterKey] Failed to store key:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: getDictionary(params.locale).errors.keychainError,
    };
  }
}

export async function deleteStoredOpenRouterKey(
  locale: SupportedLocale
): Promise<ApiResponse<null>> {
  try {
    await invoke("delete_openrouter_key");
    return { success: true };
  } catch (error) {
    console.error("[OpenRouterKey] Failed to delete stored key:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: getDictionary(locale).errors.keychainError,
    };
  }
}
