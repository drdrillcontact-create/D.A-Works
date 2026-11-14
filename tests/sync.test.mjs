import assert from "node:assert/strict";
import test from "node:test";
import {
  loadSyncMetadata,
  mergeSyncState,
  parseSyncDocument,
  saveSyncMetadata,
  serializeSyncDocument,
  SYNC_META_KEY
} from "../src/sync.mjs";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    values
  };
}

function entry(id, title, updatedAt, overrides = {}) {
  return {
    id,
    title,
    body: `Body for ${title}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
    archived: false,
    ...overrides
  };
}

test("serializes and parses a versioned sync document", () => {
  const source = { Prompts: [entry("p1", "Prompt", "2026-01-01T00:00:00.000Z")] };
  const text = serializeSyncDocument(source, []);
  const parsed = parseSyncDocument(text);

  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.data.Prompts[0].id, "p1");
  assert.equal(parsed.data.Prompts[0].updatedAt, "2026-01-01T00:00:00.000Z");
  assert.throws(() => parseSyncDocument("not-json"), /JSON/);
  assert.throws(() => parseSyncDocument(JSON.stringify({ schemaVersion: 2, data: {} })), /جدیدتری/);
});

test("merges unique entries from desktop and Android without losing either", () => {
  const desktop = { Music: [entry("desktop-1", "Desktop draft", "2026-01-01T00:00:00.000Z")] };
  const android = { Music: [entry("android-1", "Phone draft", "2026-01-02T00:00:00.000Z")] };

  const merged = mergeSyncState(desktop, [], { data: android, tombstones: [] });
  assert.deepEqual(new Set(merged.data.Music.map((item) => item.id)), new Set(["desktop-1", "android-1"]));
});

test("keeps both conflicting edits and produces stable conflict copies", () => {
  const local = { Lyrics: [entry("shared-id", "Phone version", "2026-01-03T00:00:00.000Z")] };
  const remote = { data: { Lyrics: [entry("shared-id", "Desktop version", "2026-01-02T00:00:00.000Z")] }, tombstones: [] };

  const merged = mergeSyncState(local, [], remote);
  assert.equal(merged.data.Lyrics.length, 2);
  assert.equal(merged.data.Lyrics.find((item) => item.id === "shared-id").title, "Phone version");
  const conflict = merged.data.Lyrics.find((item) => item.conflictOf === "shared-id");
  assert.equal(conflict.title, "Desktop version (conflict copy)");

  const repeated = mergeSyncState(merged.data, merged.tombstones, merged);
  assert.equal(repeated.data.Lyrics.length, 2);
  assert.equal(repeated.data.Lyrics.filter((item) => item.conflictOf === "shared-id").length, 1);
});

test("a delete tombstone prevents stale entries from being restored", () => {
  const oldEntry = entry("removed", "Old", "2026-01-01T00:00:00.000Z");
  const deletedAt = "2026-01-02T00:00:00.000Z";
  const merged = mergeSyncState(
    { Quick: [oldEntry] },
    [{ category: "Quick", id: "removed", deletedAt }],
    { data: { Quick: [oldEntry] }, tombstones: [] }
  );

  assert.equal(merged.data.Quick.length, 0);
  assert.equal(merged.tombstones[0].deletedAt, deletedAt);
});

test("a conflict copy can be deleted independently of its original entry", () => {
  const local = { Lyrics: [entry("shared", "Phone version", "2026-01-03T00:00:00.000Z")] };
  const remote = { data: { Lyrics: [entry("shared", "Desktop version", "2026-01-02T00:00:00.000Z")] }, tombstones: [] };
  const conflict = mergeSyncState(local, [], remote);
  const copy = conflict.data.Lyrics.find((item) => item.conflictOf === "shared");
  const deletedAt = "2026-01-04T00:00:00.000Z";
  const afterOriginalDelete = mergeSyncState(
    conflict.data,
    [{ category: "Lyrics", id: "shared", deletedAt }],
    conflict
  );
  const afterCopyDelete = mergeSyncState(
    conflict.data,
    [{ category: "Lyrics", id: copy.id, deletedAt }],
    conflict
  );

  assert.deepEqual(afterOriginalDelete.data.Lyrics.map((item) => item.id), [copy.id]);
  assert.deepEqual(afterCopyDelete.data.Lyrics.map((item) => item.id), ["shared"]);
  assert.equal(afterCopyDelete.tombstones.find((item) => item.id === copy.id).deletedAt, deletedAt);
});

test("stores sync metadata independently from the workspace", () => {
  const storage = memoryStorage();
  const tombstones = [{ category: "Tasks", id: "task-1", deletedAt: "2026-02-01T00:00:00.000Z" }];

  assert.equal(saveSyncMetadata(tombstones, storage), true);
  assert.equal(storage.values.has(SYNC_META_KEY), true);
  assert.deepEqual(loadSyncMetadata(storage), { tombstones, ok: true });
});
