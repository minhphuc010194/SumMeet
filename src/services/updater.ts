import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { Menu, MenuItem, Submenu } from "@tauri-apps/api/menu";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  check,
  type DownloadEvent,
  type Update,
} from "@tauri-apps/plugin-updater";
import type { ApiResponse } from "@/types/meeting";

export async function checkForUpdate(): Promise<ApiResponse<Update | null>> {
  if (!isTauri() || process.env.NODE_ENV !== "production") {
    return { success: true, data: null };
  }
  try {
    return { success: true, data: await check() };
  } catch (error) {
    console.error("[Updater] Check failed:", { error });
    return { success: false, error: String(error) };
  }
}

export async function installUpdate(params: {
  update: Update;
  onEvent: (event: DownloadEvent) => void;
}): Promise<ApiResponse<null>> {
  try {
    await params.update.downloadAndInstall(params.onEvent);
    await relaunch();
    return { success: true, data: null };
  } catch (error) {
    console.error("[Updater] Install failed:", { error });
    return { success: false, error: String(error) };
  }
}

export async function getAppVersion(): Promise<ApiResponse<string>> {
  if (!isTauri()) {
    return { success: false, error: "Not running in the desktop app" };
  }
  try {
    return { success: true, data: await getVersion() };
  } catch (error) {
    console.error("[Updater] Version read failed:", { error });
    return { success: false, error: String(error) };
  }
}

let installedItem: Promise<MenuItem> | null = null;
let onMenuSelect: () => void = () => {};

async function createUpdateMenuItem(label: string): Promise<MenuItem> {
  const menu = await Menu.default();
  const topLevel = await menu.items();
  const [appMenu] = topLevel;
  if (!(appMenu instanceof Submenu)) throw new Error("App menu not found");
  const item = await MenuItem.new({
    id: "check-for-updates",
    text: label,
    action: () => onMenuSelect(),
  });
  await appMenu.insert(item, 1);
  await Promise.all(topLevel.map((entry) => entry.close()));
  const replacedMenu = await menu.setAsAppMenu();
  await replacedMenu?.close();
  return item;
}

export async function setupUpdateMenu(params: {
  label: string;
  onSelect: () => void;
}): Promise<ApiResponse<null>> {
  if (!isTauri() || !navigator.userAgent.includes("Mac")) {
    return { success: true, data: null };
  }
  onMenuSelect = params.onSelect;
  installedItem ??= createUpdateMenuItem(params.label).catch((error) => {
    installedItem = null;
    throw error;
  });
  try {
    const item = await installedItem;
    await item.setText(params.label);
    return { success: true, data: null };
  } catch (error) {
    console.error("[Updater] Menu setup failed:", { error });
    return { success: false, error: String(error) };
  }
}
