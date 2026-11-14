import { createInitialData, normalizeWorkspace } from "./workspace.mjs";

export const SYNC_META_KEY = "da-works-sync-meta";
export const SYNC_FILE_SCHEMA = 1;

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

function validTimestamp(value, fallback = new Date().toISOString()) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

function stampWorkspace(value) {
  const data = normalizeWorkspace(value);
  for (const entries of Object.values(data)) {
    for (const entry of entries) {
      entry.updatedAt = validTimestamp(entry.updatedAt, entry.createdAt);
    }
  }
  return data;
}

function normalizeTombstones(value) {
  if (!Array.isArray(value)) return [];

  const latest = new Map();
  for (const tombstone of value) {
    if (!isRecord(tombstone) || typeof tombstone.category !== "string" || typeof tombstone.id !== "string") {
      continue;
    }
    const normalized = {
      category: tombstone.category,
      id: tombstone.id,
      deletedAt: validTimestamp(tombstone.deletedAt)
    };
    const key = JSON.stringify([normalized.category, normalized.id]);
    const existing = latest.get(key);
    if (!existing || Date.parse(normalized.deletedAt) > Date.parse(existing.deletedAt)) {
      latest.set(key, normalized);
    }
  }
  return [...latest.values()].sort((a, b) =>
    a.category.localeCompare(b.category) || a.id.localeCompare(b.id)
  );
}

export function loadSyncMetadata(explicitStorage) {
  const storage = getStorage(explicitStorage);
  if (!storage || typeof storage.getItem !== "function") return { tombstones: [], ok: false };

  try {
    const value = storage.getItem(SYNC_META_KEY);
    if (!value) return { tombstones: [], ok: true };
    const parsed = JSON.parse(value);
    return {
      tombstones: normalizeTombstones(parsed?.tombstones),
      ok: isRecord(parsed)
    };
  } catch {
    return { tombstones: [], ok: false };
  }
}

export function saveSyncMetadata(tombstones, explicitStorage) {
  const storage = getStorage(explicitStorage);
  if (!storage || typeof storage.setItem !== "function") return false;
  try {
    storage.setItem(SYNC_META_KEY, JSON.stringify({ tombstones: normalizeTombstones(tombstones) }));
    return true;
  } catch {
    return false;
  }
}

export function parseSyncDocument(content) {
  if (content === null || content === undefined || content === "") {
    return { schemaVersion: SYNC_FILE_SCHEMA, data: createInitialData(), tombstones: [] };
  }
  if (typeof content !== "string") throw new Error("محتوای فایل همگام‌سازی متنی نیست؛ فایل دست‌نخورده باقی ماند.");
  if (content.trim() === "") {
    return { schemaVersion: SYNC_FILE_SCHEMA, data: createInitialData(), tombstones: [] };
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("فایل همگام‌سازی JSON معتبر نیست؛ فایل دست‌نخورده باقی ماند.");
  }
  if (!isRecord(parsed)) throw new Error("ساختار فایل همگام‌سازی قابل‌شناسایی نیست.");

  const schemaVersion = Number.isInteger(parsed.schemaVersion) ? parsed.schemaVersion : SYNC_FILE_SCHEMA;
  if (schemaVersion > SYNC_FILE_SCHEMA) {
    throw new Error(`این فایل با نسخهٔ جدیدتری از DA Works ساخته شده (نسخهٔ ${schemaVersion})؛ برای جلوگیری از ازدست‌رفتن داده‌ها، تغییری در آن ایجاد نشد.`);
  }
  if (schemaVersion < 1) throw new Error("نسخهٔ فایل همگام‌سازی پشتیبانی نمی‌شود؛ فایل دست‌نخورده باقی ماند.");

  const sourceData = isRecord(parsed.data) ? parsed.data : parsed;
  return {
    schemaVersion,
    data: stampWorkspace(sourceData),
    tombstones: normalizeTombstones(parsed.tombstones)
  };
}

export function serializeSyncDocument(data, tombstones = []) {
  return JSON.stringify({
    schemaVersion: SYNC_FILE_SCHEMA,
    data: stampWorkspace(data),
    tombstones: normalizeTombstones(tombstones)
  }, null, 2);
}

function entryContent(entry) {
  return JSON.stringify({
    title: entry.title,
    body: entry.body,
    language: entry.language || "",
    archived: entry.archived === true
  });
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function chooseNewer(first, second) {
  const firstTime = Date.parse(first.updatedAt);
  const secondTime = Date.parse(second.updatedAt);
  if (firstTime !== secondTime) return firstTime > secondTime ? first : second;
  return entryContent(first) <= entryContent(second) ? first : second;
}

function entryKey(category, id) {
  return JSON.stringify([category, id]);
}

export function mergeSyncState(localData, localTombstones, remoteDocument) {
  const local = stampWorkspace(localData);
  const remote = remoteDocument?.data
    ? { data: stampWorkspace(remoteDocument.data), tombstones: normalizeTombstones(remoteDocument.tombstones) }
    : parseSyncDocument(typeof remoteDocument === "string" ? remoteDocument : "");
  const tombstones = normalizeTombstones([
    ...normalizeTombstones(localTombstones),
    ...remote.tombstones
  ]);
  const tombstoneMap = new Map(tombstones.map((item) => [entryKey(item.category, item.id), item]));
  const merged = createInitialData();
  const categories = new Set([...Object.keys(local), ...Object.keys(remote.data)]);
  for (const category of categories) merged[category] = [];

  const mergedByKey = new Map();
  const conflicts = [];
  const sources = [remote.data, local];

  for (const source of sources) {
    for (const [category, entries] of Object.entries(source)) {
      for (const entry of entries) {
        const key = entryKey(category, entry.id);
        const existing = mergedByKey.get(key);
        if (!existing) {
          mergedByKey.set(key, { category, entry });
          continue;
        }

        const existingContent = entryContent(existing.entry);
        const incomingContent = entryContent(entry);
        const winner = chooseNewer(existing.entry, entry);
        mergedByKey.set(key, { category, entry: winner });

        if (existingContent !== incomingContent) {
          const loser = winner === existing.entry ? entry : existing.entry;
          const signature = `${category}\u0000${entry.id}\u0000${entryContent(loser)}`;
          const conflictEntry = {
            ...loser,
            id: `conflict-${stableHash(signature)}`,
            title: `${loser.title || "بدون عنوان"} (conflict copy)`,
            conflictOf: entry.id
          };
          conflicts.push({ category, entry: conflictEntry });
        }
      }
    }
  }

  for (const { category, entry } of [...mergedByKey.values(), ...conflicts]) {
    const tombstone = tombstoneMap.get(entryKey(category, entry.id));
    if (tombstone && Date.parse(tombstone.deletedAt) >= Date.parse(entry.updatedAt)) continue;
    merged[category].push(entry);
  }

  for (const entries of Object.values(merged)) {
    entries.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  return { data: merged, tombstones };
}
