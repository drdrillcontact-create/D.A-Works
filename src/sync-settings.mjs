/**
 * Per-device sync options.
 *
 * These settings live only on the device they belong to (they are never written
 * into the shared Google Drive file), so the desktop can auto-sync while the
 * phone stays fully manual without one device overwriting the other's choice.
 */
export const SYNC_SETTINGS_KEY = "da-works-sync-settings";
export const DEVICE_ID_KEY = "da-works-device-id";

export const SYNC_INTERVALS = [
  { value: 15, label: "هر ۱۵ ثانیه" },
  { value: 30, label: "هر ۳۰ ثانیه" },
  { value: 60, label: "هر ۱ دقیقه" },
  { value: 300, label: "هر ۵ دقیقه" }
];

export const DEFAULT_SYNC_SETTINGS = Object.freeze({
  /** Master switch: "sync this device with my other DA Works devices". */
  enabled: false,
  /** Pull + push automatically when online (desktop: timer/watch, Android: on resume). */
  autoSync: true,
  /** Push right after an entry is saved, archived or deleted. */
  syncOnSave: true,
  /** Polling interval used when the platform cannot watch the file directly. */
  intervalSeconds: 30
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getStorage(explicitStorage) {
  if (explicitStorage !== undefined) return explicitStorage;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function bool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeSyncSettings(value) {
  const source = isRecord(value) ? value : {};
  const interval = Number(source.intervalSeconds);
  return {
    enabled: bool(source.enabled, DEFAULT_SYNC_SETTINGS.enabled),
    autoSync: bool(source.autoSync, DEFAULT_SYNC_SETTINGS.autoSync),
    syncOnSave: bool(source.syncOnSave, DEFAULT_SYNC_SETTINGS.syncOnSave),
    intervalSeconds: SYNC_INTERVALS.some((item) => item.value === interval)
      ? interval
      : DEFAULT_SYNC_SETTINGS.intervalSeconds
  };
}

export function loadSyncSettings(explicitStorage) {
  const storage = getStorage(explicitStorage);
  if (!storage || typeof storage.getItem !== "function") {
    return { settings: { ...DEFAULT_SYNC_SETTINGS }, ok: false };
  }

  try {
    const stored = storage.getItem(SYNC_SETTINGS_KEY);
    if (!stored) return { settings: { ...DEFAULT_SYNC_SETTINGS }, ok: true };
    const parsed = JSON.parse(stored);
    return { settings: normalizeSyncSettings(parsed), ok: isRecord(parsed) };
  } catch {
    return { settings: { ...DEFAULT_SYNC_SETTINGS }, ok: false };
  }
}

export function saveSyncSettings(settings, explicitStorage) {
  const storage = getStorage(explicitStorage);
  if (!storage || typeof storage.setItem !== "function") return false;
  try {
    storage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(normalizeSyncSettings(settings)));
    return true;
  } catch {
    return false;
  }
}

/** A stable id so the shared file can report which device synced last. */
export function loadDeviceId(explicitStorage) {
  const storage = getStorage(explicitStorage);
  const fallback = `device-${Math.random().toString(36).slice(2, 10)}`;
  if (!storage || typeof storage.getItem !== "function") return fallback;

  try {
    const existing = storage.getItem(DEVICE_ID_KEY);
    if (typeof existing === "string" && /^[a-zA-Z0-9-]{6,64}$/.test(existing)) return existing;
    const created = typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : fallback;
    storage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    return fallback;
  }
}
