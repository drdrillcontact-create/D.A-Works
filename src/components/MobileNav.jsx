import React, { useEffect, useState } from "react";
import { SyncStatusChip } from "./SyncStatusChip.jsx";

/** Phone-sized top bar: brand, live sync state and the section picker. */
export function MobileAppBar({ section, sync, onOpenSections, onSyncClick }) {
  return (
    <header className="mobile-appbar">
      <button type="button" className="mobile-menu-btn" onClick={onOpenSections} aria-label="انتخاب بخش">
        <span aria-hidden="true">☰</span>
      </button>
      <div className="mobile-title">
        <span className="mobile-brand">DA <i>WORKS</i></span>
        <strong>{section}</strong>
      </div>
      <SyncStatusChip
        compact
        phase={sync.phase}
        pending={sync.pending}
        online={sync.online}
        enabled={sync.settings.enabled}
        onClick={onSyncClick}
      />
    </header>
  );
}

/** Bottom tab bar + full-screen section sheet, used instead of the desktop sidebar. */
export function MobileTabBar({ nav, counts, archiveCount, section, onSelect, onWrite, open, setOpen, sync, onSyncClick }) {
  const [sheetQuery, setSheetQuery] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  const filtered = nav.filter(([name]) => name.toLocaleLowerCase().includes(sheetQuery.trim().toLocaleLowerCase()));

  function pick(name) {
    onSelect(name);
    setOpen(false);
    setSheetQuery("");
  }

  return (
    <>
      {open && (
        <div className="section-sheet" role="dialog" aria-modal="true" aria-label="بخش‌های فضای کاری">
          <div className="sheet-head">
            <strong>بخش‌ها</strong>
            <button type="button" className="sheet-close" onClick={() => setOpen(false)} aria-label="بستن">✕</button>
          </div>
          <input
            className="sheet-search"
            type="search"
            value={sheetQuery}
            onChange={(event) => setSheetQuery(event.target.value)}
            placeholder="جست‌وجوی بخش…"
            aria-label="جست‌وجوی بخش"
          />
          <div className="sheet-list">
            {filtered.map(([name, icon]) => {
              const count = name === "Archive" ? archiveCount : (counts[name] || 0);
              return (
                <button
                  type="button"
                  key={name}
                  className={`sheet-item ${section === name ? "active" : ""}`}
                  onClick={() => pick(name)}
                >
                  <span className="sheet-icon" aria-hidden="true">{icon}</span>
                  <span className="sheet-name">{name}</span>
                  {count > 0 && <small>{count}</small>}
                </button>
              );
            })}
            {filtered.length === 0 && <p className="sheet-empty">بخشی با این نام پیدا نشد.</p>}
          </div>
        </div>
      )}

      <nav className="mobile-tabbar" aria-label="ناوبری اصلی">
        <button
          type="button"
          className={`tab ${section === "Overview" ? "active" : ""}`}
          onClick={() => onSelect("Overview")}
        >
          <span aria-hidden="true">⌂</span>
          <small>Home</small>
        </button>
        <button type="button" className={`tab ${open ? "active" : ""}`} onClick={() => setOpen(true)}>
          <span aria-hidden="true">▤</span>
          <small>Sections</small>
        </button>
        <button type="button" className="tab write-tab" onClick={onWrite} aria-label="نوشتن یادداشت تازه">
          <span aria-hidden="true">＋</span>
          <small>Write</small>
        </button>
        <button
          type="button"
          className={`tab ${section === "Sync" ? "active" : ""}`}
          onClick={onSyncClick}
        >
          <span aria-hidden="true">⟳</span>
          <small>Sync</small>
          {sync.settings.enabled && sync.pending && <i className="tab-badge" aria-hidden="true" />}
        </button>
      </nav>
    </>
  );
}
