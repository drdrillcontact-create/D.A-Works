import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import carbonArt from "../assets/carbon-art.svg";
import { MobileAppBar, MobileTabBar } from "./components/MobileNav.jsx";
import { SyncSection } from "./components/SyncSection.jsx";
import { SyncStatusChip } from "./components/SyncStatusChip.jsx";
import { applyNativeChrome, exitNativeApp, subscribeBackButton } from "./native-shell.mjs";
import { loadSyncMetadata, saveSyncMetadata } from "./sync.mjs";
import { createEntryId, loadWorkspace, saveWorkspace } from "./workspace.mjs";
import { useSync } from "./use-sync.mjs";
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

const writableSections = new Set(nav.map(([name]) => name).filter((name) => !["Overview", "Archive", "Sync"].includes(name)));
const lyricLanguages = ["فارسی", "English", "Azərbaycan Türkçəsi", "Türkçe", "Русский"];

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);

  return matches;
}

function App() {
  const [initialLoad] = useState(() => loadWorkspace());
  const [initialSyncMeta] = useState(() => loadSyncMetadata());
  const [data, setData] = useState(initialLoad.data);
  const [tombstones, setTombstones] = useState(initialSyncMeta.tombstones);
  const [storageStatus, setStorageStatus] = useState(initialLoad.ok && initialSyncMeta.ok ? "saved" : "error");
  const [section, setSection] = useState("Overview");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("فارسی");
  const [toast, setToast] = useState("");
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const dataRef = useRef(initialLoad.data);
  const tombstonesRef = useRef(initialSyncMeta.tombstones);
  const titleInputRef = useRef(null);
  const contentRef = useRef(null);
  const isMobile = useMediaQuery("(max-width: 850px)");

  const notify = useCallback((message) => setToast(message), []);

  /** Persist a merged workspace coming back from the shared Drive file. */
  const applyMerged = useCallback((mergedData, mergedTombstones) => {
    const dataSaved = saveWorkspace(mergedData);
    const metadataSaved = dataSaved && saveSyncMetadata(mergedTombstones);
    const saved = dataSaved && metadataSaved;
    setStorageStatus(saved ? "saved" : "error");
    if (!saved) return false;
    dataRef.current = mergedData;
    tombstonesRef.current = mergedTombstones;
    setData(mergedData);
    setTombstones(mergedTombstones);
    return true;
  }, []);

  const sync = useSync({ data, tombstones, applyMerged, notify });

  const sectionRef = useRef(section);
  const sectionsOpenRef = useRef(sectionsOpen);
  useEffect(() => { sectionRef.current = section; }, [section]);
  useEffect(() => { sectionsOpenRef.current = sectionsOpen; }, [sectionsOpen]);

  useEffect(() => { applyNativeChrome(); }, []);
  useEffect(() => subscribeBackButton(() => {
    if (sectionsOpenRef.current) {
      setSectionsOpen(false);
      return;
    }
    if (sectionRef.current !== "Overview") {
      setSection("Overview");
      setQuery("");
      return;
    }
    exitNativeApp();
  }), []);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 2200);
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
  const showEditor = writableSections.has(section);

  function goToSection(nextSection) {
    setSection(nextSection);
    setQuery("");
    setSectionsOpen(false);
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  }

  function startWriting() {
    if (!writableSections.has(section)) {
      setSection("Quick Notes");
      setQuery("");
    }
    setSectionsOpen(false);
    window.setTimeout(() => {
      titleInputRef.current?.focus({ preventScroll: true });
      titleInputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 60);
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
      sync.queueSaveSync();
    }
    return saved;
  }

  function addItem(event) {
    event?.preventDefault();
    if (!canSave || !showEditor || !Array.isArray(data[section])) return;

    const timestamp = new Date().toISOString();
    const next = {
      ...data,
      [section]: [
        ...data[section],
        {
          id: createEntryId(),
          title: title.trim() || "بدون عنوان",
          body: draft.trim(),
          language: section === "Lyrics" ? language : undefined,
          createdAt: timestamp,
          updatedAt: timestamp,
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

  const syncChip = (
    <SyncStatusChip
      phase={sync.phase}
      pending={sync.pending}
      online={sync.online}
      enabled={sync.settings.enabled}
      onClick={() => goToSection("Sync")}
    />
  );

  return (
    <div className={`app-shell ${isMobile ? "is-mobile" : "is-desktop"}`}>
      {isMobile ? (
        <MobileAppBar
          section={section}
          sync={sync}
          onOpenSections={() => setSectionsOpen(true)}
          onSyncClick={() => goToSection("Sync")}
        />
      ) : (
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
                  {name === "Sync" && sync.settings.enabled && sync.pending && <i className="nav-badge" aria-hidden="true" />}
                  {count > 0 && <small>{count}</small>}
                </button>
              );
            })}
          </nav>
          <div className="sidebar-bottom">
            <div className="status-dot" />
            <span>{sync.settings.enabled ? "SYNC ENABLED" : "LOCAL WORKSPACE"}</span>
            <span className="version">v1.1</span>
          </div>
        </aside>
      )}

      <main className="main">
        {!isMobile && (
          <header className="topbar">
            <div className="breadcrumb">DA WORKS <span>/</span> {section.toUpperCase()}</div>
            <div className="top-actions">
              {syncChip}
              <div className={`local-badge ${storageStatus === "error" ? "error" : ""}`} role="status">
                <i /> {storageStatus === "saved" ? "Saved locally" : "Storage unavailable"}
              </div>
              <div className="avatar" aria-label="DA Works">DA</div>
            </div>
          </header>
        )}

        <section className="content" ref={contentRef}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR CREATIVE CONTROL CENTER</div>
              <h1>{heading}</h1>
              <p>{section === "Overview"
                ? "Capture ideas. Organize projects. Keep your creative momentum."
                : section === "Sync"
                  ? "همگام‌سازی نوشته‌ها بین نسخهٔ دسکتاپ و اپلیکیشن Android."
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
                  <button className="primary-btn" type="button" onClick={startWriting}>
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
                    <span>
                      <strong>Sync devices</strong>
                      <small>{sync.settings.enabled ? "Connected to your other device" : "Share ideas with Android"}</small>
                    </span>
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
            <SyncSection sync={sync} />
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

              {showEditor && (
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
                    dir="auto"
                    ref={titleInputRef}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Give this entry a title..."
                    aria-label="Entry title"
                  />
                  <textarea
                    value={draft}
                    dir="auto"
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={isLyrics ? "Write your lyrics here..." : "Write an idea, prompt, project note or next step..."}
                    aria-label={isLyrics ? "Lyrics" : "Entry details"}
                  />
                  <div className="editor-foot">
                    <span className="muted">
                      {storageStatus !== "saved"
                        ? "Unable to save to this device"
                        : sync.settings.enabled && sync.pending
                          ? "Saved here · waiting to sync"
                          : "Stored on this device"}
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
                        <h3 dir="auto">{item.title}</h3>
                        <p dir="auto">{item.body}</p>
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

      {isMobile && (
        <MobileTabBar
          nav={nav}
          counts={counts}
          archiveCount={archiveCount}
          section={section}
          onSelect={goToSection}
          onWrite={startWriting}
          open={sectionsOpen}
          setOpen={setSectionsOpen}
          sync={sync}
          onSyncClick={() => goToSection("Sync")}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
