import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialData,
  loadWorkspace,
  normalizeWorkspace,
  saveWorkspace,
  STORAGE_KEY
} from "../src/workspace.mjs";

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    values
  };
}

test("creates a fresh workspace with all supported sections", () => {
  const first = createInitialData();
  const second = createInitialData();

  assert.deepEqual(Object.keys(first), [
    "Prompts", "Music", "Video", "Plugins", "Suno Prompts", "Lyrics", "Tasks", "Quick Notes"
  ]);
  first.Music.push({ title: "Only in first" });
  assert.deepEqual(second.Music, []);
});

test("loads and normalizes stored entries, skipping invalid rows", () => {
  const storage = createMemoryStorage({
    [STORAGE_KEY]: JSON.stringify({
      Lyrics: [
        { id: "lyric-1", title: "Line", body: "A lyric", language: "فارسی", archived: true, createdAt: "2024-01-02T00:00:00.000Z" },
        null,
        "not an entry"
      ],
      Tasks: "invalid section"
    })
  });

  const result = loadWorkspace(storage);
  assert.equal(result.ok, true);
  assert.equal(result.data.Lyrics.length, 1);
  assert.equal(result.data.Lyrics[0].id, "lyric-1");
  assert.equal(result.data.Lyrics[0].archived, true);
  assert.deepEqual(result.data.Tasks, []);
  assert.ok(result.data["Quick Notes"]);
});

test("recovers safely from malformed or inaccessible local storage", () => {
  const malformed = loadWorkspace(createMemoryStorage({ [STORAGE_KEY]: "{" }));
  const blocked = loadWorkspace({ getItem() { throw new Error("blocked"); } });

  assert.equal(malformed.ok, false);
  assert.equal(blocked.ok, false);
  assert.deepEqual(malformed.data, createInitialData());
  assert.deepEqual(blocked.data, createInitialData());
});

test("normalizes missing fields and preserves archived state", () => {
  const workspace = normalizeWorkspace({ Notes: [{ archived: true, title: 42, body: null, createdAt: "invalid" }] });
  const [entry] = workspace.Notes;

  assert.equal(entry.title, "بدون عنوان");
  assert.equal(entry.body, "");
  assert.equal(entry.archived, true);
  assert.ok(entry.id);
  assert.ok(!Number.isNaN(Date.parse(entry.createdAt)));
});

test("writes workspace data and reports storage failures", () => {
  const storage = createMemoryStorage();
  const data = createInitialData();
  data.Music.push({ id: "track-1", title: "Demo" });

  assert.equal(saveWorkspace(data, storage), true);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), data);
  assert.equal(saveWorkspace(data, { setItem() { throw new Error("quota exceeded"); } }), false);
});
