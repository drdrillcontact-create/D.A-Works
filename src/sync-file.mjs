import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  isWebFileAccessSupported,
  webChooseSyncFile,
  webClearSyncFile,
  webFileInfo,
  webReadSyncFile,
  webWriteSyncFile
} from "./sync-file-web.mjs";

const AndroidSyncFile = registerPlugin("SyncFile");
const ANDROID_FILE_KEY = "da-works-sync-file";

export const PLATFORM_DETAILS = {
  desktop: { id: "desktop", label: "Windows desktop", shortLabel: "DESKTOP", canWatchFile: true, canAutoSync: true },
  android: { id: "android", label: "Android", shortLabel: "ANDROID", canWatchFile: false, canAutoSync: true },
  web: { id: "web", label: "Browser", shortLabel: "BROWSER", canWatchFile: false, canAutoSync: true },
  unsupported: { id: "unsupported", label: "مرورگر (بدون دسترسی به فایل)", shortLabel: "WEB", canWatchFile: false, canAutoSync: false }
};

function desktopBridge() {
  return typeof window !== "undefined" ? window.daWorksDesktop : undefined;
}

function readAndroidFileSetting() {
  try {
    const value = globalThis.localStorage?.getItem(ANDROID_FILE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export function getSyncPlatform() {
  if (desktopBridge()) return "desktop";
  if (Capacitor.getPlatform() === "android") return "android";
  if (isWebFileAccessSupported()) return "web";
  return "unsupported";
}

export function getPlatformDetails() {
  return PLATFORM_DETAILS[getSyncPlatform()] || PLATFORM_DETAILS.unsupported;
}

/** Human-readable device name written into the shared file's device roster. */
export function getDeviceLabel(platform = getSyncPlatform()) {
  if (platform === "desktop") return "DA Works · Windows";
  if (platform === "android") return "DA Works · Android";
  if (platform === "web") return "DA Works · Browser";
  return "DA Works";
}

function explainFileError(error) {
  const code = error?.code || "";
  const message = error?.message || "";
  if (code === "PERMISSION_LOST" || /permission|SecurityException|ENOENT|no such file/i.test(message)) {
    return new Error("فایل همگام‌سازی در دسترس نیست (جابه‌جا شده یا دسترسی‌اش پس گرفته شده است)؛ یک بار دیگر همان فایل را انتخاب کن.");
  }
  return error instanceof Error ? error : new Error(message || "دسترسی به فایل همگام‌سازی ناموفق بود.");
}

export async function getSyncFileInfo() {
  const platform = getSyncPlatform();
  if (platform === "desktop") return desktopBridge().getSyncFileInfo();
  if (platform === "android") return readAndroidFileSetting();
  if (platform === "web") return webFileInfo();
  return null;
}

export async function chooseSyncFile(createNew = false) {
  const platform = getSyncPlatform();
  if (platform === "desktop") {
    return createNew
      ? desktopBridge().createSyncFile()
      : desktopBridge().chooseSyncFile();
  }

  if (platform === "android") {
    const selected = createNew
      ? await AndroidSyncFile.createSyncFile()
      : await AndroidSyncFile.chooseSyncFile();
    if (!selected || selected.cancelled || !selected.uri) return null;
    const setting = { configured: true, uri: selected.uri, name: selected.name };
    globalThis.localStorage?.setItem(ANDROID_FILE_KEY, JSON.stringify(setting));
    return setting;
  }

  if (platform === "web") return webChooseSyncFile(createNew);

  throw new Error("همگام‌سازی فایل در این نسخه در دسترس نیست؛ نسخهٔ دسکتاپ یا اپ Android را نصب کن.");
}

export async function readSyncFile() {
  const platform = getSyncPlatform();
  try {
    if (platform === "desktop") return await desktopBridge().readSyncFile();
    if (platform === "android") {
      const setting = readAndroidFileSetting();
      if (!setting?.uri) throw new Error("ابتدا فایل همگام‌سازی Google Drive را انتخاب کن.");
      return await AndroidSyncFile.readSyncFile({ uri: setting.uri });
    }
    if (platform === "web") return await webReadSyncFile();
  } catch (error) {
    throw explainFileError(error);
  }
  throw new Error("پلتفرم فعلی از همگام‌سازی فایل پشتیبانی نمی‌کند.");
}

export async function writeSyncFile(content) {
  const platform = getSyncPlatform();
  try {
    if (platform === "desktop") return await desktopBridge().writeSyncFile({ content });
    if (platform === "android") {
      const setting = readAndroidFileSetting();
      if (!setting?.uri) throw new Error("ابتدا فایل همگام‌سازی Google Drive را انتخاب کن.");
      return await AndroidSyncFile.writeSyncFile({ uri: setting.uri, content });
    }
    if (platform === "web") return await webWriteSyncFile(content);
  } catch (error) {
    throw explainFileError(error);
  }
  throw new Error("پلتفرم فعلی از همگام‌سازی فایل پشتیبانی نمی‌کند.");
}

export async function clearSyncFile() {
  const platform = getSyncPlatform();
  if (platform === "desktop") return desktopBridge().clearSyncFile();
  if (platform === "android") {
    const setting = readAndroidFileSetting();
    if (setting?.uri) {
      await AndroidSyncFile.releaseSyncFile({ uri: setting.uri }).catch(() => {});
    }
    globalThis.localStorage?.removeItem(ANDROID_FILE_KEY);
    return true;
  }
  if (platform === "web") return webClearSyncFile();
  return false;
}

/** Show the shared file in Explorer (desktop only). */
export async function revealSyncFile() {
  if (getSyncPlatform() !== "desktop") return false;
  return desktopBridge().revealSyncFile?.() ?? false;
}

/**
 * Subscribe to "the shared file may have changed" nudges.
 * Electron watches the file on disk and wakes on system resume, so a phone sync
 * lands on the desktop within a second of Google Drive writing the file.
 * Returns an unsubscribe function.
 */
export function subscribeSyncFileChanges(callback) {
  const bridge = desktopBridge();
  if (typeof bridge?.onSyncFileChanged === "function") return bridge.onSyncFileChanged(callback);
  return () => {};
}
