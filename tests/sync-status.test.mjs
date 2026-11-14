import assert from "node:assert/strict";
import test from "node:test";
import { computeRevision } from "../src/sync.mjs";
import {
  appendSyncLog,
  hasPendingChanges,
  loadSyncStatus,
  normalizeSyncStatus,
  saveSyncStatus,
  SYNC_LOG_LIMIT,
  SYNC_STATUS_KEY
} from "../src/sync-status.mjs";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    values
  };
}

function entry(id, title) {
  return {
    id,
    title,
    body: "body",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archived: false
  };
}

test("offline writes are flagged as waiting to sync until the upload succeeds", () => {
  const data = { "Quick Notes": [entry("n1", "Idea on the bus")] };
  const synced = { lastSyncedRevision: computeRevision(data, []) };
  assert.equal(hasPendingChanges(data, [], synced), false);

  const afterEdit = { "Quick Notes": [...data["Quick Notes"], entry("n2", "Second idea")] };
  assert.equal(hasPendingChanges(afterEdit, [], synced), true);

  const uploaded = { lastSyncedRevision: computeRevision(afterEdit, []) };
  assert.equal(hasPendingChanges(afterEdit, [], uploaded), false);
});

test("a delete also counts as a pending change", () => {
  const data = { "Quick Notes": [] };
  const synced = { lastSyncedRevision: computeRevision(data, []) };
  const tombstones = [{ category: "Quick Notes", id: "n1", deletedAt: "2026-02-01T00:00:00.000Z" }];
  assert.equal(hasPendingChanges(data, tombstones, synced), true);
});

test("an empty never-synced workspace is not reported as pending", () => {
  assert.equal(hasPendingChanges({ Prompts: [] }, [], {}), false);
  assert.equal(hasPendingChanges({ Prompts: [entry("p1", "Draft")] }, [], {}), true);
});

test("the activity log keeps only the most recent events", () => {
  let status = normalizeSyncStatus(null);
  for (let index = 0; index < SYNC_LOG_LIMIT + 5; index += 1) {
    status = appendSyncLog(status, {
      at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      message: `event ${index}`,
      ok: index % 2 === 0
    });
  }
  assert.equal(status.log.length, SYNC_LOG_LIMIT);
  assert.equal(status.log[0].message, `event ${SYNC_LOG_LIMIT + 4}`);
  assert.equal(status.log[0].ok, true);
  assert.equal(status.log[1].ok, false);
});

test("status and the device roster round-trip through storage", () => {
  const storage = memoryStorage();
  const status = {
    lastSyncedAt: "2026-03-01T10:00:00.000Z",
    lastSyncedRevision: "abc123",
    devices: {
      "android-1": { platform: "android", label: "DA Works · Android", lastSyncedAt: "2026-03-01T09:58:00.000Z" }
    },
    log: []
  };
  assert.equal(saveSyncStatus(status, storage), true);
  assert.equal(storage.values.has(SYNC_STATUS_KEY), true);

  const loaded = loadSyncStatus(storage);
  assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.status, status);
});

test("broken status payloads do not break start-up", () => {
  const storage = memoryStorage({ [SYNC_STATUS_KEY]: "not-json" });
  const { status, ok } = loadSyncStatus(storage);
  assert.equal(ok, false);
  assert.equal(status.lastSyncedAt, null);
  assert.deepEqual(status.log, []);
});
