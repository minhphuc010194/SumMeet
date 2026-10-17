import { isTauri } from "@tauri-apps/api/core";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { TrayIcon } from "@tauri-apps/api/tray";
import type { ApiResponse } from "@/types/meeting";

interface TrayLabels {
  openLabel: string;
  quitLabel: string;
}

let installedItems: Promise<[MenuItem, MenuItem]> | null = null;

async function createTrayMenu(
  labels: TrayLabels
): Promise<[MenuItem, MenuItem]> {
  const tray = await TrayIcon.getById("main");
  if (!tray) throw new Error("Tray icon not found");
  const openItem = await MenuItem.new({
    id: "show-main-window",
    text: labels.openLabel,
  });
  const quitItem = await MenuItem.new({ id: "quit", text: labels.quitLabel });
  await tray.setMenu(await Menu.new({ items: [openItem, quitItem] }));
  return [openItem, quitItem];
}

export async function setupTrayMenu(
  labels: TrayLabels
): Promise<ApiResponse<null>> {
  if (!isTauri()) {
    return { success: true, data: null };
  }
  installedItems ??= createTrayMenu(labels).catch((error) => {
    installedItems = null;
    throw error;
  });
  try {
    const [openItem, quitItem] = await installedItems;
    await openItem.setText(labels.openLabel);
    await quitItem.setText(labels.quitLabel);
    return { success: true, data: null };
  } catch (error) {
    console.error("[Tray] Menu setup failed:", { error });
    return { success: false, error: String(error) };
  }
}
