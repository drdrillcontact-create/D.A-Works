import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import {
  computeRevision,
  mergeDeviceRosters,
  mergeSyncState,
  parseSyncDocument,
  serializeSyncDocument
} from "./sync.mjs";
import {
  chooseSyncFile,
  clearSyncFile,
  getDeviceLabel,
  getPlatformDetails,
  getSyncFileInfo,
  readSyncFile,
  revealSyncFile,
  subscribeSyncFileChanges,
  writeSyncFile
} from "./sync-file.mjs";
import { loadDeviceId, loadSyncSettings, saveSyncSettings } from "./sync-settings.mjs";
import { appendSyncLog, hasPendingChanges, loadSyncStatus, saveSyncStatus } from "./sync-status.mjs";

const SAVE_DEBOUNCE_MS = 1200;
const WATCH_DEBOUNCE_MS = 900;

/**
 * Owns every sync concern: device settings, the shared Drive file, the merge
 * cycle and the automatic triggers (online, resume, focus, file watcher, timer).
 *
 * `applyMerged` must persist the merged workspace and return true on success.
 */
export function useSync({ data, tombstones, applyMerged, notify }) {
  const [initialSettings] = useState(() => loadSyncSettings());
  const [initialStatus] = useState(() => loadSyncStatus());
  const [deviceId] = useState(() => loadDeviceId());
  const [settings, setSettings] = useState(initialSettings.settings);
  const [status, setStatus] = useState(initialStatus.status);
  const [file, setFile] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);

  const platform = useMemo(() => getPlatformDetails(), []);
  const dataRef = useRef(data);
  const tombstonesRef = useRef(tombstones);
  const settingsRef = useRef(settings);
  const statusRef = useRef(status);
  const fileRef = useRef(file);
  const runningRef = useRef(false);
  const saveTimerRef = useRef(null);
  const watchTimerRef = useRef(null);
  const applyMergedRef = useRef(applyMerged);
  const notifyRef = useRef(notify);

  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { tombstonesRef.current = tombstones; }, [tombstones]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { fileRef.current = file; }, [file]);
  useEffect(() => { applyMergedRef.current = applyMerged; }, [applyMerged]);
  useEffect(() => { notifyRef.current = notify; }, [notify]);

  const commitStatus = useCallback((next) => {
    statusRef.current = next;
    setStatus(next);
    saveSyncStatus(next);
  }, []);

  const syncNow = useCallback(async ({ quiet = false, force = false } = {}) => {
    if (runningRef.current) return false;
    if (!force && !settingsRef.current.enabled) {
      setPhase(fileRef.current ? "disabled" : "unconfigured");
      if (!quiet) notifyRef.current?.("اول گزینهٔ «همگام‌سازی با دستگاه‌های من» را روشن کن.");
      return false;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setOnline(false);
      setPhase("offline");
      setError("این دستگاه آفلاین است؛ نوشته‌ها همین‌جا ذخیره می‌مانند و به‌محض اتصال فرستاده می‌شوند.");
      if (!quiet) notifyRef.current?.("آفلاین هستی؛ بعد از اتصال دوباره همگام‌سازی کن.");
      return false;
    }

    runningRef.current = true;
    setBusy(true);
    setPhase("syncing");
    setError("");

    try {
      const info = await getSyncFileInfo();
      if (!info || (!info.configured && !info.uri)) {
        fileRef.current = null;
        setFile(null);
        setPhase("unconfigured");
        setError("ابتدا فایل مشترک Google Drive را انتخاب کن.");
        return false;
      }
      if (info.needsPermission) {
        setPhase("error");
        setError("مرورگر دسترسی به فایل را پس گرفته است؛ یک بار دیگر همان فایل را انتخاب کن.");
        return false;
      }

      const remoteFile = await readSyncFile();
      const remoteDocument = parseSyncDocument(remoteFile?.content);
      const merged = mergeSyncState(dataRef.current, tombstonesRef.current, remoteDocument);
      if (!applyMergedRef.current?.(merged.data, merged.tombstones)) {
        throw new Error("دادهٔ ادغام‌شده روی این دستگاه ذخیره نشد؛ فضای ذخیره‌سازی را بررسی کن.");
      }

      const revision = computeRevision(merged.data, merged.tombstones);
      const remoteRevision = computeRevision(remoteDocument.data, remoteDocument.tombstones);
      const timestamp = new Date().toISOString();
      const devices = mergeDeviceRosters(remoteDocument.devices, statusRef.current.devices, {
        [deviceId]: { platform: platform.id, label: getDeviceLabel(platform.id), lastSyncedAt: timestamp }
      });

      // Only touch the shared file when something actually changed, so idle
      // devices do not bounce writes back and forth through Google Drive.
      const changed = revision !== remoteRevision;
      if (changed || !remoteDocument.devices?.[deviceId]) {
        await writeSyncFile(serializeSyncDocument(merged.data, merged.tombstones, devices));
      }

      commitStatus(appendSyncLog({
        ...statusRef.current,
        lastSyncedAt: timestamp,
        lastSyncedRevision: revision,
        devices
      }, {
        at: timestamp,
        ok: true,
        direction: changed ? "exchange" : "check",
        message: changed ? "تغییرها بین دستگاه‌ها رد و بدل شد" : "همه‌چیز به‌روز بود"
      }));

      setPhase("synced");
      if (!quiet) notifyRef.current?.(changed ? "همگام‌سازی انجام شد" : "همه‌چیز به‌روز است");
      return true;
    } catch (syncError) {
      const message = syncError?.message || "همگام‌سازی ناموفق بود.";
      setPhase("error");
      setError(message);
      commitStatus(appendSyncLog(statusRef.current, { ok: false, direction: "error", message }));
      if (!quiet) notifyRef.current?.(message);
      return false;
    } finally {
      runningRef.current = false;
      setBusy(false);
    }
  }, [commitStatus, deviceId, platform.id]);

  const syncNowRef = useRef(syncNow);
  useEffect(() => { syncNowRef.current = syncNow; }, [syncNow]);

  // Discover the configured file once at start-up.
  useEffect(() => {
    let active = true;
    getSyncFileInfo().then((info) => {
      if (!active) return;
      fileRef.current = info || null;
      setFile(info || null);
      setPhase(info ? (settingsRef.current.enabled ? "ready" : "disabled") : "unconfigured");
    }).catch((fileError) => {
      if (!active) return;
      setPhase("error");
      setError(fileError?.message || "تنظیمات فایل همگام‌سازی خوانده نشد.");
    });
    return () => { active = false; };
  }, []);

  // Connectivity indicator.
  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      if (settingsRef.current.enabled && settingsRef.current.autoSync && fileRef.current) {
        void syncNowRef.current({ quiet: true });
      }
    };
    const goOffline = () => {
      setOnline(false);
      if (!settingsRef.current.enabled || !fileRef.current) return;
      setPhase((current) => current === "syncing" ? current : "offline");
      setError("این دستگاه آفلاین است؛ نوشته‌ها روی همین دستگاه ذخیره می‌شوند و بعد از اتصال سینک می‌شوند.");
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Automatic triggers: timer + window focus. The desktop keeps polling while
  // its window is in the background; Android waits for the resume event instead.
  useEffect(() => {
    if (!settings.enabled || !settings.autoSync || !platform.canAutoSync || !file) return undefined;
    let active = true;
    const wake = () => {
      if (!active) return;
      if (platform.id === "android" && document.visibilityState === "hidden") return;
      if (navigator.onLine === false) return;
      void syncNowRef.current({ quiet: true });
    };

    const interval = window.setInterval(wake, Math.max(15, settings.intervalSeconds) * 1000);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    wake();

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [settings.enabled, settings.autoSync, settings.intervalSeconds, platform.canAutoSync, platform.id, file]);

  // Electron: the shared file changed on disk, the PC woke up, or the user pressed
  // "Sync now" in the menu. Manual requests work even with auto-sync switched off.
  useEffect(() => {
    if (!settings.enabled || !file || !platform.canWatchFile) return undefined;
    let active = true;
    const unsubscribe = subscribeSyncFileChanges((payload) => {
      if (!active) return;
      if (payload?.reason === "manual") {
        void syncNowRef.current({ quiet: false });
        return;
      }
      if (!settingsRef.current.autoSync || navigator.onLine === false) return;
      window.clearTimeout(watchTimerRef.current);
      watchTimerRef.current = window.setTimeout(() => {
        if (active) void syncNowRef.current({ quiet: true });
      }, WATCH_DEBOUNCE_MS);
    });
    return () => {
      active = false;
      window.clearTimeout(watchTimerRef.current);
      unsubscribe();
    };
  }, [settings.enabled, file, platform.canWatchFile]);

  // Android: sync when the app returns to the foreground.
  useEffect(() => {
    if (platform.id !== "android") return undefined;
    let disposed = false;
    let handle;
    CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive || disposed) return;
      if (!settingsRef.current.enabled || !settingsRef.current.autoSync || !fileRef.current) return;
      if (navigator.onLine === false) return;
      void syncNowRef.current({ quiet: true });
    }).then((listener) => {
      if (disposed) listener.remove();
      else handle = listener;
    }).catch(() => { /* the web fallback has no app lifecycle events */ });
    return () => {
      disposed = true;
      handle?.remove();
    };
  }, [platform.id]);

  useEffect(() => () => window.clearTimeout(saveTimerRef.current), []);

  const updateSettings = useCallback((patch) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    saveSyncSettings(next);

    if (!next.enabled) {
      window.clearTimeout(saveTimerRef.current);
      setPhase(fileRef.current ? "disabled" : "unconfigured");
      setError("");
    } else if (fileRef.current) {
      setPhase("ready");
      setError("");
      if (next.autoSync && patch.enabled === true) {
        window.setTimeout(() => syncNowRef.current({ quiet: true }), 50);
      }
    }
    return next;
  }, []);

  /** Called after every local edit; pushes shortly after typing stops. */
  const queueSaveSync = useCallback(() => {
    if (!settingsRef.current.enabled || !settingsRef.current.syncOnSave || !fileRef.current) return;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      if (navigator.onLine === false) return;
      void syncNowRef.current({ quiet: true });
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const selectFile = useCallback(async (createNew) => {
    try {
      const selected = await chooseSyncFile(createNew);
      if (!selected) return false;
      fileRef.current = selected;
      setFile(selected);
      setError("");
      if (!settingsRef.current.enabled) updateSettings({ enabled: true });
      setPhase("ready");
      return await syncNowRef.current({ force: true });
    } catch (selectError) {
      const message = selectError?.message || "انتخاب فایل همگام‌سازی ناموفق بود.";
      setPhase("error");
      setError(message);
      notifyRef.current?.(message);
      return false;
    }
  }, [updateSettings]);

  const disconnect = useCallback(async () => {
    try {
      await clearSyncFile();
      window.clearTimeout(saveTimerRef.current);
      fileRef.current = null;
      setFile(null);
      setPhase("unconfigured");
      setError("");
      notifyRef.current?.("اتصال فایل قطع شد؛ داده‌های این دستگاه دست‌نخورده ماند.");
      return true;
    } catch (disconnectError) {
      setPhase("error");
      setError(disconnectError?.message || "قطع اتصال انجام نشد.");
      return false;
    }
  }, []);

  const pending = useMemo(
    () => hasPendingChanges(data, tombstones, status),
    [data, tombstones, status]
  );

  const otherDevices = useMemo(() => Object.entries(status.devices || {})
    .filter(([id]) => id !== deviceId)
    .map(([id, device]) => ({ id, ...device }))
    .sort((a, b) => Date.parse(b.lastSyncedAt || 0) - Date.parse(a.lastSyncedAt || 0)), [status.devices, deviceId]);

  return {
    platform,
    deviceId,
    settings,
    updateSettings,
    file,
    phase,
    error,
    busy,
    online,
    pending,
    lastSyncedAt: status.lastSyncedAt,
    log: status.log,
    otherDevices,
    syncNow,
    queueSaveSync,
    selectFile,
    disconnect,
    reveal: revealSyncFile
  };
}
