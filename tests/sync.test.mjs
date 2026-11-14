import assert from "node:assert/strict";
import test from "node:test";
import {
  computeRevision,
  loadSyncMetadata,
  mergeDeviceRosters,
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

test("an idle device produces the same revision, so it never rewrites the shared file", () => {
  const workspace = { Music: [entry("m1", "Mix notes", "2026-01-01T00:00:00.000Z")] };
  const document = parseSyncDocument(serializeSyncDocument(workspace, []));
  const merged = mergeSyncState(workspace, [], document);

  assert.equal(computeRevision(merged.data, merged.tombstones), computeRevision(document.data, document.tombstones));
});

test("an edit on either device changes the revision", () => {
  const before = { Music: [entry("m1", "Mix notes", "2026-01-01T00:00:00.000Z")] };
  const after = { Music: [entry("m1", "Mix notes v2", "2026-01-02T00:00:00.000Z")] };
  assert.notEqual(computeRevision(before, []), computeRevision(after, []));
});

test("the device roster survives a round-trip and keeps the newest sync per device", () => {
  const devices = {
    "desktop-1": { platform: "desktop", label: "DA Works · Windows", lastSyncedAt: "2026-02-01T08:00:00.000Z" },
    "android-1": { platform: "android", label: "DA Works · Android", lastSyncedAt: "2026-02-01T09:00:00.000Z" }
  };
  const parsed = parseSyncDocument(serializeSyncDocument({ Tasks: [] }, [], devices));
  assert.deepEqual(parsed.devices, devices);

  const merged = mergeDeviceRosters(parsed.devices, {
    "android-1": { platform: "android", label: "DA Works · Android", lastSyncedAt: "2026-02-01T07:00:00.000Z" },
    "tablet-1": { platform: "android", label: "DA Works · Tablet", lastSyncedAt: "2026-02-01T10:00:00.000Z" }
  });
  assert.equal(merged["android-1"].lastSyncedAt, "2026-02-01T09:00:00.000Z");
  assert.equal(Object.keys(merged).length, 3);
});

test("a phone entry written offline reaches the desktop through the shared document", () => {
  // The phone writes offline, then syncs: its entry lands in the shared file.
  const phone = { Lyrics: [entry("phone-lyric", "نوشتهٔ روی گوشی", "2026-04-01T20:00:00.000Z", { language: "فارسی" })] };
  const sharedFile = serializeSyncDocument(phone, [], {
    "android-1": { platform: "android", label: "DA Works · Android", lastSyncedAt: "2026-04-01T20:05:00.000Z" }
  });

  // The desktop comes online later with its own local work.
  const desktop = { Lyrics: [entry("desktop-lyric", "Desktop draft", "2026-04-01T18:00:00.000Z")] };
  const merged = mergeSyncState(desktop, [], parseSyncDocument(sharedFile));

  assert.deepEqual(new Set(merged.data.Lyrics.map((item) => item.id)), new Set(["phone-lyric", "desktop-lyric"]));
  assert.equal(merged.data.Lyrics.find((item) => item.id === "phone-lyric").language, "فارسی");
  assert.equal(merged.devices["android-1"].platform, "android");

  // The desktop uploads the union; the phone pulls it back without duplicates.
  const uploaded = serializeSyncDocument(merged.data, merged.tombstones, merged.devices);
  const phoneAgain = mergeSyncState(phone, [], parseSyncDocument(uploaded));
  assert.equal(phoneAgain.data.Lyrics.length, 2);
});
