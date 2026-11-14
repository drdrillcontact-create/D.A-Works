import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { App as CapacitorApp } from "@capacitor/app";
import carbonArt from "../assets/carbon-art.svg";
import { loadSyncMetadata, mergeSyncState, parseSyncDocument, saveSyncMetadata, serializeSyncDocument } from "./sync.mjs";
import { chooseSyncFile, clearSyncFile, getSyncFileInfo, getSyncPlatform, readSyncFile, writeSyncFile } from "./sync-file.mjs";
import { createEntryId, loadWorkspace, saveWorkspace } from "./workspace.mjs";
import "./styles.css";

const nav = [
  ["Overview", "⌂"],
  ["Prompts", "✳"],
  ["Music", "♫"],
  ["Video", "▣"],
  ["Plugins", "◈"],
  ["Suno Prompts", "≋"],
  ["Lyrics", "≡"],
  ["Tasks", "✓"],
  ["Quick Notes", "＋"],
  ["Archive", "▤"],
  ["Sync", "⟳"]
];

const lyricLanguages = ["فارسی", "English", "Azərbaycan Türkçəsi", "Türkçe", "Русский"];

function App() {
  const [initialLoad] = useState(() => loadWorkspace());
  const [initialSyncMeta] = useState(() => loadSyncMetadata());
  const [data, setData] = useState(initialLoad.data);
  const [tombstones, setTombstones] = useState(initialSyncMeta.tombstones);
  const [storageStatus, setStorageStatus] = useState(initialLoad.ok && initialSyncMeta.ok ? "saved" : "error");
  const [syncFile, setSyncFile] = useState(null);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [syncError, setSyncError] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [section, setSection] = useState("Overview");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("فارسی");
  const [toast, setToast] = useState("");
  const dataRef = useRef(initialLoad.data);
  const tombstonesRef = useRef(initialSyncMeta.tombstones);
  const syncFileRef = useRef(null);
  const syncRunningRef = useRef(false);
  const syncPlatform = getSyncPlatform();
  const isDesktop = syncPlatform === "desktop";
  const isAndroid = syncPlatform === "android";

  const syncNow = useCallback(async ({ quiet = false } = {}) => {
    if (syncRunningRef.current) return false;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSyncStatus("offline");
      setSyncError("برای همگام‌سازی، دستگاه باید آنلاین باشد.");
      return false;
    }

    syncRunningRef.current = true;
    setSyncBusy(true);
    setSyncStatus("syncing");
    setSyncError("");

    try {
      const fileInfo = await getSyncFileInfo();
      if (!fileInfo || (!fileInfo.configured && !fileInfo.uri)) {
        setSyncStatus("unconfigured");
        setSyncError("ابتدا فایل همگام‌سازی مشترک در Google Drive را انتخاب کن.");
        return false;
      }

      const remoteFile = await readSyncFile();
      const remoteDocument = parseSyncDocument(remoteFile.content);
      const merged = mergeSyncState(dataRef.current, tombstonesRef.current, remoteDocument);
      const dataSaved = saveWorkspace(merged.data);
      const metadataSaved = dataSaved && saveSyncMetadata(merged.tombstones);
      if (!dataSaved || !metadataSaved) {
        setStorageStatus("error");
        throw new Error("دادهٔ ادغام‌شده روی این دستگاه ذخیره نشد؛ فضای ذخیره‌سازی را بررسی کن.");
      }

      setStorageStatus("saved");
      dataRef.current = merged.data;
      tombstonesRef.current = merged.tombstones;
      setData(merged.data);
      setTombstones(merged.tombstones);

      const mergedContent = serializeSyncDocument(merged.data, merged.tombstones);
      const remoteContent = serializeSyncDocument(remoteDocument.data, remoteDocument.tombstones);
      if (mergedContent !== remoteContent) await writeSyncFile(mergedContent);

      const timestamp = new Date().toISOString();
      setLastSyncedAt(timestamp);
      try { globalThis.localStorage?.setItem("da-works-last-synced", timestamp); } catch { /* status stays visible */ }
      setSyncStatus("synced");
      if (!quiet) setToast("همگام‌سازی انجام شد");
      return true;
    } catch (error) {
      const message = error?.message || "همگام‌سازی ناموفق بود.";
      setSyncStatus("error");
      setSyncError(message);
      if (!quiet) setToast(message);
      return false;
    } finally {
      syncRunningRef.current = false;
      setSyncBusy(false);
    }
  }, []);

  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { tombstonesRef.current = tombstones; }, [tombstones]);
  useEffect(() => { syncFileRef.current = syncFile; }, [syncFile]);

  useEffect(() => {
    let active = true;
    getSyncFileInfo().then((info) => {
      if (!active) return;
      setSyncFile(info || null);
      setSyncStatus(info ? "ready" : "unconfigured");
    }).catch((error) => {
      if (!active) return;
      setSyncStatus("error");
      setSyncError(error?.message || "تنظیمات فایل همگام‌سازی خوانده نشد.");
    });
    try {
      const lastSync = globalThis.localStorage?.getItem("da-works-last-synced");
      if (lastSync) setLastSyncedAt(lastSync);
    } catch { /* local history is optional */ }
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isDesktop || !syncFile) return undefined;
    let active = true;
    const automaticSync = () => {
      if (!active) return;
      if (!navigator.onLine) {
        setSyncStatus("offline");
        setSyncError("این دستگاه آفلاین است؛ تغییرها محلی می‌مانند و پس از اتصال دوباره دریافت/ارسال می‌شوند.");
        return;
      }
      void syncNow({ quiet: true });
    };
    const interval = window.setInterval(automaticSync, 20000);
    window.addEventListener("online", automaticSync);
    window.addEventListener("offline", automaticSync);
    window.addEventListener("focus", automaticSync);
    automaticSync();
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("online", automaticSync);
      window.removeEventListener("offline", automaticSync);
      window.removeEventListener("focus", automaticSync);
    };
  }, [isDesktop, syncFile, syncNow]);

  useEffect(() => {
    if (!isAndroid) return undefined;
    let subscription;
    let disposed = false;
    const markOnline = () => {
      if (syncFileRef.current) setSyncStatus((status) => status === "syncing" ? status : "ready");
    };
    const markOffline = () => {
      if (!syncFileRef.current) return;
      setSyncStatus("offline");
      setSyncError("این دستگاه آفلاین است؛ ورودی‌ها روی همین دستگاه ذخیره می‌شوند. پس از اتصال، همگام‌سازی را دستی اجرا کن.");
    };
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive && navigator.onLine) markOnline();
    }).then((listener) => {
      if (disposed) listener.remove();
      else subscription = listener;
    });
    return () => {
      disposed = true;
      subscription?.remove();
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, [isAndroid]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 1800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const items = useMemo(() => {
    const source = section === "Archive"
      ? Object.entries(data).flatMap(([category, rows]) =>
          rows.filter((item) => item.archived).map((item) => ({ ...item, category }))
        )
      : (data[section] || []).filter((item) => !item.archived);
    const normalizedQuery = query.trim().toLocaleLowerCase();

    if (!normalizedQuery) return source;
    return source.filter((item) =>
      `${item.title} ${item.body} ${item.category || ""}`.toLocaleLowerCase().includes(normalizedQuery)
    );
  }, [data, section, query]);

  const counts = useMemo(() => Object.fromEntries(
    Object.entries(data).map(([category, rows]) => [
      category,
      rows.filter((item) => !item.archived).length
    ])
  ), [data]);

  const archiveCount = useMemo(() => Object.values(data).reduce(
    (total, rows) => total + rows.filter((item) => item.archived).length,
    0
  ), [data]);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const isLyrics = section === "Lyrics";
  const canSave = Boolean(title.trim() || draft.trim());
  const heading = section === "Overview" ? "Workspace overview" : section;
  const syncStatusLabel = {
    idle: "Not synced yet",
    ready: "Ready to sync",
    unconfigured: "Choose a shared Drive file",
    syncing: "Syncing…",
    synced: "Synced successfully",
    offline: "Device is offline",
    error: "Sync needs attention"
  }[syncStatus] || "Ready to sync";

  function notify(message) {
    setToast(message);
  }

  function goToSection(nextSection) {
    setSection(nextSection);
    setQuery("");
  }

  function save(next, successMessage = "ذخیره شد", nextTombstones = tombstonesRef.current) {
    const dataSaved = saveWorkspace(next);
    const metadataSaved = dataSaved && saveSyncMetadata(nextTombstones);
    const saved = dataSaved && metadataSaved;
    setStorageStatus(saved ? "saved" : "error");
    notify(saved ? successMessage : "ذخیره‌سازی روی این دستگاه ناموفق بود");
    if (saved) {
      dataRef.current = next;
      tombstonesRef.current = nextTombstones;
      setData(next);
      setTombstones(nextTombstones);
      if (isDesktop && navigator.onLine) void syncNow({ quiet: true });
    }
    return saved;
  }

  function addItem(event) {
    event?.preventDefault();
    if (!canSave || section === "Overview" || section === "Archive" || !Array.isArray(data[section])) return;

    const next = {
      ...data,
      [section]: [
        ...data[section],
        {
          id: createEntryId(),
          title: title.trim() || "بدون عنوان",
          body: draft.trim(),
          language: section === "Lyrics" ? language : undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          archived: false
        }
      ]
    };

    if (!save(next)) return;
    setTitle("");
    setDraft("");
  }

  function removeItem(id, category) {
    if (!Array.isArray(data[category])) return;
    const deletedAt = new Date().toISOString();
    const next = {
      ...data,
      [category]: data[category].filter((item) => item.id !== id)
    };
    const nextTombstones = [...tombstonesRef.current, { category, id, deletedAt }];
    save(next, "حذف شد", nextTombstones);
  }

  function setArchived(id, category, archived) {
    if (!Array.isArray(data[category])) return;
    const updatedAt = new Date().toISOString();
    const next = {
      ...data,
      [category]: data[category].map((item) => item.id === id ? { ...item, archived, updatedAt } : item)
    };
    save(next, archived ? "به آرشیو منتقل شد" : "از آرشیو بازیابی شد");
  }

  async function handleSyncFileSelection(createNew) {
    try {
      const selected = await chooseSyncFile(createNew);
      if (!selected) return;
      setSyncFile(selected);
      setSyncStatus("ready");
      setSyncError("");
      await syncNow();
    } catch (error) {
      const message = error?.message || "انتخاب فایل همگام‌سازی ناموفق بود.";
      setSyncStatus("error");
      setSyncError(message);
      setToast(message);
    }
  }

  async function handleDisconnectSyncFile() {
    try {
      await clearSyncFile();
      setSyncFile(null);
      setSyncStatus("unconfigured");
      setSyncError("");
      setToast("اتصال فایل همگام‌سازی قطع شد؛ داده‌های محلی باقی ماندند.");
    } catch (error) {
      setSyncStatus("error");
      setSyncError(error?.message || "قطع اتصال انجام نشد.");
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">DA</div>
          <div className="brand-name">DA <span>WORKS</span></div>
        </div>
        <div className="side-label">WORKSPACE</div>
        <nav aria-label="Workspace sections">
          {nav.map(([name, icon]) => {
            const count = name === "Archive" ? archiveCount : (counts[name] || 0);
            return (
              <button
                key={name}
                type="button"
                className={`nav-item ${section === name ? "active" : ""}`}
                aria-current={section === name ? "page" : undefined}
                onClick={() => goToSection(name)}
              >
                <span className="nav-icon" aria-hidden="true">{icon}</span>
                <span>{name}</span>
                {count > 0 && <small>{count}</small>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="status-dot" />
          <span>LOCAL WORKSPACE</span>
          <span className="version">v1.0</span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">DA WORKS <span>/</span> {section.toUpperCase()}</div>
          <div className="top-actions">
            <div className={`local-badge ${storageStatus === "error" ? "error" : ""}`} role="status">
              <i /> {storageStatus === "saved" ? "Saved locally" : "Storage unavailable"}
            </div>
            <div className="avatar" aria-label="DA Works">DA</div>
          </div>
        </header>

        <section className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR CREATIVE CONTROL CENTER</div>
              <h1>{heading}</h1>
              <p>{section === "Overview"
                ? "Capture ideas. Organize projects. Keep your creative momentum."
                : section === "Sync"
                  ? "همگام‌سازی یادداشت‌ها بین نسخهٔ دسکتاپ و Android از راه یک فایل مشترک در Google Drive."
                  : `Collect and organize everything in ${section}.`}</p>
            </div>
            <div className="date-chip">
              {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date())}
            </div>
          </div>

          {section === "Overview" ? (
            <>
              <div className="hero-card">
                <div className="hero-copy">
                  <div className="eyebrow red">DA RECORDS · PERSONAL WORKSPACE</div>
                  <h2>Make room for<br /><em>every idea.</em></h2>
                  <p>A focused space for the things you create, plan and imagine.</p>
                  <button className="primary-btn" type="button" onClick={() => goToSection("Quick Notes")}>
                    ＋ Capture an idea
                  </button>
                </div>
                <div className="hero-art">
                  <img src={carbonArt} alt="Abstract carbon texture" />
                </div>
                <div className="hero-index">01 <span>/ 08</span></div>
              </div>

              <div className="section-row">
                <div>
                  <div className="eyebrow">YOUR LIBRARY</div>
                  <h2>Creative spaces</h2>
                </div>
                <span className="muted">{total} active {total === 1 ? "entry" : "entries"}</span>
              </div>
              <div className="tile-grid">
                {[
                  ["Prompts", "AI prompts & references", "✳"],
                  ["Music", "Projects & deliveries", "♫"],
                  ["Video", "Concepts & shot ideas", "▣"],
                  ["Plugins", "VST concepts & R&D", "◈"],
                  ["Suno Prompts", "Music generation prompts", "≋"],
                  ["Lyrics", "Words in five languages", "≡"]
                ].map(([name, description, icon]) => (
                  <button className="space-tile" key={name} type="button" onClick={() => goToSection(name)}>
                    <div className="tile-top">
                      <span className="tile-icon" aria-hidden="true">{icon}</span>
                      <span className="tile-count">{counts[name] || 0}</span>
                    </div>
                    <strong>{name}</strong>
                    <span className="tile-desc">{description}</span>
                    <span className="tile-arrow" aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>

              <div className="bottom-grid">
                <div className="panel">
                  <div className="panel-head">
                    <h3>Quick access</h3>
                    <span className="muted">STAY IN FLOW</span>
                  </div>
                  <button className="quick-link" type="button" onClick={() => goToSection("Tasks")}>
                    <b aria-hidden="true">✓</b>
                    <span><strong>Tasks & deadlines</strong><small>Keep your next steps visible</small></span>
                    <i aria-hidden="true">↗</i>
                  </button>
                  <button className="quick-link" type="button" onClick={() => goToSection("Quick Notes")}>
                    <b aria-hidden="true">＋</b>
                    <span><strong>Quick notes</strong><small>Save a thought before it disappears</small></span>
                    <i aria-hidden="true">↗</i>
                  </button>
                  <button className="quick-link" type="button" onClick={() => goToSection("Sync")}>
                    <b aria-hidden="true">⟳</b>
                    <span><strong>Sync devices</strong><small>Share ideas with Android</small></span>
                    <i aria-hidden="true">↗</i>
                  </button>
                </div>
                <div className="panel focus-panel">
                  <div className="eyebrow red">A SMALL REMINDER</div>
                  <h3>Capture now.<br />Organize later.</h3>
                  <p>Your ideas deserve a place to land, even when you are in the middle of something else.</p>
                </div>
              </div>
            </>
          ) : section === "Sync" ? (
            <div className="sync-workspace">
              <div className="panel sync-panel">
                <div className="panel-head">
                  <h3>Google Drive sync</h3>
                  <span className="muted">{isDesktop ? "DESKTOP AUTO-SYNC" : isAndroid ? "ANDROID · MANUAL SYNC" : "CROSS-DEVICE SYNC"}</span>
                </div>
                <p className="sync-intro">
                  یک فایل JSON مشترک را از Google Drive انتخاب کن. Android با file picker خود Drive می‌خواند و می‌نویسد؛
                  نسخهٔ دسکتاپ فایل داخل پوشهٔ Google Drive for desktop را بررسی می‌کند.
                </p>

                <div className={`sync-state sync-state-${syncStatus}`} role="status" aria-live="polite">
                  <span className="sync-state-dot" />
                  <div className="sync-state-copy">
                    <strong>{syncStatusLabel}</strong>
                    <span>{syncFile?.name || "No shared Drive file selected"}</span>
                  </div>
                  {lastSyncedAt && (
                    <span className="sync-last-time">آخرین sync: {new Date(lastSyncedAt).toLocaleString()}</span>
                  )}
                </div>

                {syncError && <p className="sync-error" role="alert">{syncError}</p>}
                {syncPlatform === "unsupported" && (
                  <p className="sync-error" role="status">همگام‌سازی فایل فقط در نسخهٔ دسکتاپ و اپ Android در دسترس است.</p>
                )}

                <div className="sync-actions">
                  <button
                    className="primary-btn"
                    type="button"
                    disabled={syncPlatform === "unsupported" || syncBusy}
                    onClick={() => handleSyncFileSelection(false)}
                  >
                    انتخاب فایل موجود
                  </button>
                  <button
                    className="secondary-btn"
                    type="button"
                    disabled={syncPlatform === "unsupported" || syncBusy}
                    onClick={() => handleSyncFileSelection(true)}
                  >
                    ساخت فایل جدید
                  </button>
                  <button
                    className="sync-now-btn"
                    type="button"
                    disabled={!syncFile || syncBusy || syncPlatform === "unsupported"}
                    onClick={() => syncNow()}
                  >
                    {syncBusy ? "در حال همگام‌سازی…" : "همگام‌سازی اکنون"}
                  </button>
                  {syncFile && (
                    <button className="text-btn" type="button" disabled={syncBusy} onClick={handleDisconnectSyncFile}>
                      قطع اتصال
                    </button>
                  )}
                </div>
              </div>

              <div className="panel sync-guide">
                <div className="eyebrow red">راه‌اندازی یک‌باره</div>
                <ol>
                  <li>روی یکی از دستگاه‌ها فایل <code>DA Works Sync.json</code> را داخل Google Drive بساز و انتخاب کن.</li>
                  <li>در Android همان فایل را از Google Drive انتخاب کن و هر بار دکمهٔ «همگام‌سازی اکنون» را بزن.</li>
                  <li>در Windows برنامهٔ Google Drive for desktop را نصب کن؛ همان فایل را از پوشهٔ Drive انتخاب کن و آن را برای استفادهٔ آفلاین نگه دار.</li>
                </ol>
                <p>{isDesktop
                  ? "دسکتاپ هنگام آنلاین‌شدن، بازگشت به برنامه و به‌صورت دوره‌ای فایل را بررسی و با داده‌های محلی ادغام می‌کند."
                  : "پس از sync موبایل، دسکتاپ با آنلاین‌شدن Google Drive فایل را دریافت می‌کند و برنامه تغییرات را خودکار می‌خواند."}</p>
                <p className="sync-privacy-note">اگر یک ورودی در دو دستگاه با محتوای متفاوت تغییر کند، هر دو نسخه نگه داشته می‌شوند. محتوای فایل رمزگذاری سرتاسری نمی‌شود؛ دسترسی آن را با تنظیمات حساب Google Drive کنترل کن.</p>
              </div>
            </div>
          ) : (
            <div className="workspace">
              <div className="workspace-toolbar">
                <label className="searchbox">
                  <span aria-hidden="true">⌕</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={`Search ${section.toLowerCase()}...`}
                    aria-label={`Search ${section}`}
                  />
                </label>
                <span className="muted" aria-live="polite">
                  {items.length} {items.length === 1 ? "entry" : "entries"}
                </span>
              </div>

              {section !== "Archive" && (
                <form className="editor panel" onSubmit={addItem}>
                  <div className="panel-head">
                    <h3>New entry</h3>
                    <span className="muted">QUICK CAPTURE</span>
                  </div>
                  {isLyrics && (
                    <div className="language-tabs" role="group" aria-label="Lyrics language">
                      {lyricLanguages.map((itemLanguage) => (
                        <button
                          type="button"
                          className={language === itemLanguage ? "selected" : ""}
                          aria-pressed={language === itemLanguage}
                          onClick={() => setLanguage(itemLanguage)}
                          key={itemLanguage}
                        >
                          {itemLanguage}
                        </button>
                      ))}
                    </div>
                  )}
                  <input
                    className="title-input"
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Give this entry a title..."
                    aria-label="Entry title"
                  />
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={isLyrics ? "Write your lyrics here..." : "Write an idea, prompt, project note or next step..."}
                    aria-label={isLyrics ? "Lyrics" : "Entry details"}
                  />
                  <div className="editor-foot">
                    <span className="muted">
                      {storageStatus === "saved" ? "Stored on this device" : "Unable to save to this device"}
                    </span>
                    <button className="primary-btn" type="submit" disabled={!canSave}>
                      Save entry <span aria-hidden="true">↗</span>
                    </button>
                  </div>
                </form>
              )}

              <div className="entries">
                {items.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-mark" aria-hidden="true">＋</div>
                    <h3>Nothing here yet</h3>
                    <p>{query.trim()
                      ? `No entries match “${query.trim()}”.`
                      : section === "Archive"
                        ? "Archived entries will appear here. Restore an entry to return it to its collection."
                        : "Capture your first thought using the editor above."}</p>
                  </div>
                ) : items.map((item) => {
                  const category = item.category || section;
                  const inArchive = section === "Archive";
                  return (
                    <article className="entry panel" key={`${category}-${item.id}`}>
                      <div className="entry-main">
                        <div className="entry-meta">
                          {item.language || category} · {new Date(item.createdAt).toLocaleDateString()}
                        </div>
                        <h3>{item.title}</h3>
                        <p>{item.body}</p>
                      </div>
                      <div className="entry-actions">
                        <button
                          type="button"
                          title={inArchive ? "Restore" : "Archive"}
                          aria-label={inArchive ? `Restore ${item.title}` : `Archive ${item.title}`}
                          onClick={() => setArchived(item.id, category, !inArchive)}
                        >
                          {inArchive ? "↩" : "↗"}
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          aria-label={`Delete ${item.title}`}
                          onClick={() => removeItem(item.id, category)}
                        >
                          ×
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </section>
        {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
