/**
 * Local sync bookkeeping: when this device last synced, which revision of the
 * workspace it uploaded, and which other devices have touched the shared file.
 *
 * The revision fingerprint is what powers the "changes waiting to sync" badge:
 * if the current workspace no longer matches the last uploaded revision, the
 * device knows it still owes the shared file an update — even across restarts.
 */
import { computeRevision } from "./sync.mjs";

export const SYNC_STATUS_KEY = "da-works-sync-status";
export const SYNC_LOG_LIMIT = 8;

export const EMPTY_SYNC_STATUS = Object.freeze({
  lastSyncedAt: null,
  lastSyncedRevision: null,
  devices: {},
  log: []
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

function isTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function normalizeSyncStatus(value) {
  const source = isRecord(value) ? value : {};
  const devices = {};
  if (isRecord(source.devices)) {
    for (const [id, device] of Object.entries(source.devices)) {
      if (!isRecord(device) || id === "__proto__") continue;
      devices[id] = {
        platform: typeof device.platform === "string" ? device.platform : "unknown",
        label: typeof device.label === "string" ? device.label : "DA Works",
        lastSyncedAt: isTimestamp(device.lastSyncedAt) ? device.lastSyncedAt : null
      };
    }
  }

  const log = Array.isArray(source.log)
    ? source.log
      .filter((item) => isRecord(item) && isTimestamp(item.at))
      .slice(0, SYNC_LOG_LIMIT)
      .map((item) => ({
        at: item.at,
        ok: item.ok !== false,
        message: typeof item.message === "string" ? item.message : "",
        direction: typeof item.direction === "string" ? item.direction : "sync"
      }))
    : [];

  return {
    lastSyncedAt: isTimestamp(source.lastSyncedAt) ? source.lastSyncedAt : null,
    lastSyncedRevision: typeof source.lastSyncedRevision === "string" ? source.lastSyncedRevision : null,
    devices,
    log
  };
}

export function loadSyncStatus(explicitStorage) {
  const storage = getStorage(explicitStorage);
  if (!storage || typeof storage.getItem !== "function") {
    return { status: { ...EMPTY_SYNC_STATUS, devices: {}, log: [] }, ok: false };
  }

  try {
    const stored = storage.getItem(SYNC_STATUS_KEY);
    if (!stored) return { status: { ...EMPTY_SYNC_STATUS, devices: {}, log: [] }, ok: true };
    const parsed = JSON.parse(stored);
    return { status: normalizeSyncStatus(parsed), ok: isRecord(parsed) };
  } catch {
    return { status: { ...EMPTY_SYNC_STATUS, devices: {}, log: [] }, ok: false };
  }
}

export function saveSyncStatus(status, explicitStorage) {
  const storage = getStorage(explicitStorage);
  if (!storage || typeof storage.setItem !== "function") return false;
  try {
    storage.setItem(SYNC_STATUS_KEY, JSON.stringify(normalizeSyncStatus(status)));
    return true;
  } catch {
    return false;
  }
}

export function appendSyncLog(status, event) {
  const normalized = normalizeSyncStatus(status);
  return {
    ...normalized,
    log: [
      {
        at: isTimestamp(event?.at) ? event.at : new Date().toISOString(),
        ok: event?.ok !== false,
        message: typeof event?.message === "string" ? event.message : "",
        direction: typeof event?.direction === "string" ? event.direction : "sync"
      },
      ...normalized.log
    ].slice(0, SYNC_LOG_LIMIT)
  };
}

/**
 * True when this device holds edits that the shared file has not received yet.
 * An unknown baseline (never synced) counts as pending only if there is data.
 */
export function hasPendingChanges(data, tombstones, status) {
  const revision = computeRevision(data, tombstones);
  if (status?.lastSyncedRevision === revision) return false;
  if (!status?.lastSyncedRevision) {
    const hasEntries = Object.values(data || {}).some((rows) => Array.isArray(rows) && rows.length > 0);
    return hasEntries || (Array.isArray(tombstones) && tombstones.length > 0);
  }
  return true;
}
