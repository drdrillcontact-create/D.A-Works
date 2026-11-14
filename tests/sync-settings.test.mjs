import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SYNC_SETTINGS,
  DEVICE_ID_KEY,
  loadDeviceId,
  loadSyncSettings,
  normalizeSyncSettings,
  saveSyncSettings,
  SYNC_SETTINGS_KEY
} from "../src/sync-settings.mjs";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values
  };
}

test("sync starts switched off so nothing leaves the device by accident", () => {
  const storage = memoryStorage();
  const { settings, ok } = loadSyncSettings(storage);
  assert.equal(ok, true);
  assert.equal(settings.enabled, false);
  assert.equal(settings.autoSync, true);
  assert.deepEqual(settings, { ...DEFAULT_SYNC_SETTINGS });
});

test("the desktop option survives a restart", () => {
  const storage = memoryStorage();
  assert.equal(saveSyncSettings({ enabled: true, autoSync: false, intervalSeconds: 60 }, storage), true);
  assert.equal(storage.values.has(SYNC_SETTINGS_KEY), true);

  const { settings } = loadSyncSettings(storage);
  assert.equal(settings.enabled, true);
  assert.equal(settings.autoSync, false);
  assert.equal(settings.syncOnSave, true);
  assert.equal(settings.intervalSeconds, 60);
});

test("corrupt or unexpected settings fall back to safe defaults", () => {
  assert.deepEqual(normalizeSyncSettings(null), { ...DEFAULT_SYNC_SETTINGS });
  assert.deepEqual(normalizeSyncSettings({ enabled: "yes", intervalSeconds: 7 }), { ...DEFAULT_SYNC_SETTINGS });
  assert.deepEqual(normalizeSyncSettings([1, 2, 3]), { ...DEFAULT_SYNC_SETTINGS });

  const storage = memoryStorage({ [SYNC_SETTINGS_KEY]: "{not json" });
  const { settings, ok } = loadSyncSettings(storage);
  assert.equal(ok, false);
  assert.equal(settings.enabled, false);
});

test("each device keeps one stable id for the shared roster", () => {
  const storage = memoryStorage();
  const first = loadDeviceId(storage);
  assert.equal(typeof first, "string");
  assert.equal(storage.values.get(DEVICE_ID_KEY), first);
  assert.equal(loadDeviceId(storage), first);
});

test("settings are per device and never leak into the shared file", () => {
  const desktop = memoryStorage();
  const android = memoryStorage();
  saveSyncSettings({ enabled: true, autoSync: true }, desktop);
  saveSyncSettings({ enabled: true, autoSync: false }, android);

  assert.equal(loadSyncSettings(desktop).settings.autoSync, true);
  assert.equal(loadSyncSettings(android).settings.autoSync, false);
});
