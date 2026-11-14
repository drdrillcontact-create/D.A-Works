export const STORAGE_KEY = "da-works-data";

const DEFAULT_CATEGORIES = [
  "Prompts",
  "Music",
  "Video",
  "Plugins",
  "Suno Prompts",
  "Lyrics",
  "Tasks",
  "Quick Notes"
];

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

export function createInitialData() {
  return Object.fromEntries(DEFAULT_CATEGORIES.map((category) => [category, []]));
}

export function createEntryId() {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // Older browsers or restricted contexts may not expose crypto.randomUUID.
  }
  return `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function normalizeEntry(entry) {
  if (!isRecord(entry)) return null;

  const createdAt = typeof entry.createdAt === "string" && !Number.isNaN(Date.parse(entry.createdAt))
    ? entry.createdAt
    : new Date().toISOString();

  return {
    ...entry,
    id: typeof entry.id === "string" && entry.id.trim() ? entry.id : createEntryId(),
    title: typeof entry.title === "string" ? entry.title : "بدون عنوان",
    body: typeof entry.body === "string" ? entry.body : "",
    language: typeof entry.language === "string" ? entry.language : undefined,
    createdAt,
    archived: entry.archived === true
  };
}

export function normalizeWorkspace(value) {
  const workspace = createInitialData();
  if (!isRecord(value)) return workspace;

  for (const [category, entries] of Object.entries(value)) {
    if (["__proto__", "constructor", "prototype"].includes(category) || !Array.isArray(entries)) {
      continue;
    }
    workspace[category] = entries.map(normalizeEntry).filter(Boolean);
  }

  return workspace;
}

export function loadWorkspace(explicitStorage) {
  const storage = getStorage(explicitStorage);
  if (!storage || typeof storage.getItem !== "function") {
    return { data: createInitialData(), ok: false };
  }

  try {
    const stored = storage.getItem(STORAGE_KEY);
    if (stored === null || stored === undefined || stored === "") {
      return { data: createInitialData(), ok: true };
    }

    const parsed = JSON.parse(stored);
    if (!isRecord(parsed)) {
      return { data: createInitialData(), ok: false };
    }
    return { data: normalizeWorkspace(parsed), ok: true };
  } catch {
    return { data: createInitialData(), ok: false };
  }
}

export function saveWorkspace(data, explicitStorage) {
  const storage = getStorage(explicitStorage);
  if (!storage || typeof storage.setItem !== "function") return false;

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
