import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import {
  Menu,
  MenuItem,
  PredefinedMenuItem,
  Submenu,
} from "@tauri-apps/api/menu";
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
let installedAppMenu: Submenu | null = null;
let installedAboutCredits: string | undefined;
let aboutUpdateQueue: Promise<void> = Promise.resolve();
let onMenuSelect: () => void = () => {};

async function replaceAboutMenuItem(
  appMenu: Submenu,
  aboutCredits: string
): Promise<void> {
  if (
    aboutCredits === installedAboutCredits ||
    typeof PredefinedMenuItem?.new !== "function" ||
    typeof appMenu.removeAt !== "function"
  ) {
    return;
  }
  installedAboutCredits = aboutCredits;
  const version = await getVersion().catch(() => undefined);
  const aboutItem = await PredefinedMenuItem.new({
    text: "About SumMeet",
    item: {
      About: {
        name: "SumMeet",
        version,
        shortVersion: version,
        credits: aboutCredits,
      },
    },
  });
  const oldAbout = await appMenu.removeAt(0);
  await oldAbout?.close();
  await appMenu.insert(aboutItem, 0);
}

function enqueueAboutMenuUpdate(
  appMenu: Submenu,
  aboutCredits: string
): Promise<void> {
  const next = aboutUpdateQueue.then(() =>
    replaceAboutMenuItem(appMenu, aboutCredits)
  );
  aboutUpdateQueue = next.catch(() => {});
  return next;
}

async function createUpdateMenuItem(params: {
  label: string;
  aboutCredits?: string;
}): Promise<MenuItem> {
  const menu = await Menu.default();
  const topLevel = await menu.items();
  const [appMenu, ...otherMenus] = topLevel;
  if (!(appMenu instanceof Submenu)) throw new Error("App menu not found");
  if (params.aboutCredits) {
    await enqueueAboutMenuUpdate(appMenu, params.aboutCredits);
    installedAppMenu = appMenu;
  }
  const item = await MenuItem.new({
    id: "check-for-updates",
    text: params.label,
    action: () => onMenuSelect(),
  });
  await appMenu.insert(item, 1);
  if (params.aboutCredits) {
    await Promise.all(otherMenus.map((entry) => entry.close()));
  } else {
    await Promise.all(topLevel.map((entry) => entry.close()));
  }
  const replacedMenu = await menu.setAsAppMenu();
  await replacedMenu?.close();
  return item;
}

export async function setupUpdateMenu(params: {
  label: string;
  aboutCredits?: string;
  onSelect: () => void;
}): Promise<ApiResponse<null>> {
  if (!isTauri() || !navigator.userAgent.includes("Mac")) {
    return { success: true, data: null };
  }
  onMenuSelect = params.onSelect;
  installedItem ??= createUpdateMenuItem({
    label: params.label,
    aboutCredits: params.aboutCredits,
  }).catch((error) => {
    installedItem = null;
    installedAppMenu = null;
    installedAboutCredits = undefined;
    throw error;
  });
  try {
    const item = await installedItem;
    await item.setText(params.label);
    if (
      params.aboutCredits &&
      installedAppMenu &&
      params.aboutCredits !== installedAboutCredits
    ) {
      await enqueueAboutMenuUpdate(installedAppMenu, params.aboutCredits);
    }
    return { success: true, data: null };
  } catch (error) {
    console.error("[Updater] Menu setup failed:", { error });
    return { success: false, error: String(error) };
  }
}
