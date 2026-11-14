import { Capacitor, registerPlugin } from "@capacitor/core";

const AndroidSyncFile = registerPlugin("SyncFile");
const ANDROID_FILE_KEY = "da-works-sync-file";

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
  return "unsupported";
}

export async function getSyncFileInfo() {
  if (getSyncPlatform() === "desktop") return desktopBridge().getSyncFileInfo();
  if (getSyncPlatform() === "android") return readAndroidFileSetting();
  return null;
}

export async function chooseSyncFile(createNew = false) {
  if (getSyncPlatform() === "desktop") {
    return createNew
      ? desktopBridge().createSyncFile()
      : desktopBridge().chooseSyncFile();
  }

  if (getSyncPlatform() === "android") {
    const selected = createNew
      ? await AndroidSyncFile.createSyncFile()
      : await AndroidSyncFile.chooseSyncFile();
    if (!selected || selected.cancelled || !selected.uri) return null;
    const setting = { uri: selected.uri, name: selected.name };
    globalThis.localStorage?.setItem(ANDROID_FILE_KEY, JSON.stringify(setting));
    return setting;
  }

  throw new Error("همگام‌سازی فایل در این نسخهٔ وب در دسترس نیست.");
}

export async function readSyncFile() {
  const platform = getSyncPlatform();
  if (platform === "desktop") return desktopBridge().readSyncFile();
  if (platform === "android") {
    const setting = readAndroidFileSetting();
    if (!setting?.uri) throw new Error("ابتدا فایل همگام‌سازی Google Drive را انتخاب کن.");
    return AndroidSyncFile.readSyncFile({ uri: setting.uri });
  }
  throw new Error("پلتفرم فعلی از همگام‌سازی فایل پشتیبانی نمی‌کند.");
}

export async function writeSyncFile(content) {
  const platform = getSyncPlatform();
  if (platform === "desktop") return desktopBridge().writeSyncFile({ content });
  if (platform === "android") {
    const setting = readAndroidFileSetting();
    if (!setting?.uri) throw new Error("ابتدا فایل همگام‌سازی Google Drive را انتخاب کن.");
    return AndroidSyncFile.writeSyncFile({ uri: setting.uri, content });
  }
  throw new Error("پلتفرم فعلی از همگام‌سازی فایل پشتیبانی نمی‌کند.");
}

export async function clearSyncFile() {
  if (getSyncPlatform() === "desktop") return desktopBridge().clearSyncFile();
  if (getSyncPlatform() === "android") {
    globalThis.localStorage?.removeItem(ANDROID_FILE_KEY);
    return true;
  }
  return false;
}
