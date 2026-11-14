import React from "react";

export const PHASE_LABELS = {
  idle: "در حال بررسی",
  disabled: "سینک خاموش",
  unconfigured: "فایل انتخاب نشده",
  ready: "آمادهٔ سینک",
  syncing: "در حال سینک…",
  synced: "سینک شد",
  offline: "آفلاین",
  error: "خطای سینک"
};

export function phaseTone(phase, pending) {
  if (phase === "error") return "error";
  if (phase === "offline") return "offline";
  if (phase === "syncing") return "busy";
  if (phase === "disabled" || phase === "unconfigured") return "off";
  if (pending) return "pending";
  return "ok";
}

/** Compact always-visible sync indicator for the top bar / mobile app bar. */
export function SyncStatusChip({ phase, pending, online, enabled, compact = false, onClick }) {
  const tone = phaseTone(phase, pending);
  const label = !online && enabled ? PHASE_LABELS.offline : (PHASE_LABELS[phase] || PHASE_LABELS.idle);
  const title = pending && enabled ? "تغییرهایی داری که هنوز سینک نشده‌اند" : "وضعیت همگام‌سازی";

  return (
    <button
      type="button"
      className={`sync-chip tone-${tone} ${compact ? "compact" : ""}`}
      onClick={onClick}
      title={title}
      aria-label={`${title}: ${label}`}
    >
      <span className="sync-chip-icon" aria-hidden="true">⟳</span>
      {!compact && <span className="sync-chip-label">{label}</span>}
      {pending && enabled && <span className="sync-chip-dot" aria-hidden="true" />}
    </button>
  );
}
