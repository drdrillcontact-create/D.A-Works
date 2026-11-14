import React from "react";
import { SYNC_INTERVALS } from "../sync-settings.mjs";
import { PHASE_LABELS, phaseTone } from "./SyncStatusChip.jsx";

function Toggle({ checked, onChange, title, description, disabled = false }) {
  return (
    <div className={`option-row ${disabled ? "disabled" : ""}`}>
      <div className="option-copy">
        <strong>{title}</strong>
        {description && <span>{description}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        className={`switch ${checked ? "on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-knob" />
      </button>
    </div>
  );
}

function formatTime(value) {
  if (!value) return "هنوز سینک نشده";
  try {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString();
  }
}

function deviceIcon(platform) {
  if (platform === "android") return "▤";
  if (platform === "desktop") return "▣";
  return "◈";
}

export function SyncSection({ sync }) {
  const {
    platform, settings, updateSettings, file, phase, error, busy, online, pending,
    lastSyncedAt, log, otherDevices, syncNow, selectFile, disconnect, reveal
  } = sync;

  const supported = platform.id !== "unsupported";
  const isAndroid = platform.id === "android";
  const tone = phaseTone(phase, pending);
  const partnerName = isAndroid ? "نسخهٔ دسکتاپ (Windows)" : "اپلیکیشن Android";

  return (
    <div className="sync-workspace" dir="rtl">
      <div className="panel sync-panel">
        <div className="panel-head">
          <h3>همگام‌سازی دستگاه‌ها</h3>
          <span className="muted">{platform.shortLabel}</span>
        </div>
        <p className="sync-intro">
          این دستگاه: <b>{platform.label}</b>. با روشن‌کردن گزینهٔ زیر، نوشته‌های این دستگاه با {partnerName} از راه
          یک فایل مشترک در Google Drive رد و بدل می‌شود. هر چیزی که می‌نویسی اول روی همین دستگاه ذخیره می‌شود؛
          اگر آفلاین باشی، بعداً سینک می‌شود.
        </p>

        <div className="option-list">
          <Toggle
            checked={settings.enabled}
            disabled={!supported}
            onChange={(value) => updateSettings({ enabled: value })}
            title={`همگام‌سازی با ${partnerName}`}
            description={settings.enabled
              ? "روشن است؛ این دستگاه فایل مشترک را می‌خواند و تغییرها را می‌فرستد."
              : "خاموش است؛ همه‌چیز فقط روی همین دستگاه می‌ماند."}
          />
          <Toggle
            checked={settings.autoSync}
            disabled={!supported || !settings.enabled}
            onChange={(value) => updateSettings({ autoSync: value })}
            title="سینک خودکار"
            description={isAndroid
              ? "وقتی برنامه را باز می‌کنی یا اینترنت وصل می‌شود، خودکار سینک شود."
              : "وقتی آنلاین می‌شوی، برنامه را باز می‌کنی یا فایل تغییر می‌کند، خودکار سینک شود."}
          />
          <Toggle
            checked={settings.syncOnSave}
            disabled={!supported || !settings.enabled}
            onChange={(value) => updateSettings({ syncOnSave: value })}
            title="سینک بعد از هر ذخیره"
            description="بلافاصله بعد از ثبت، آرشیو یا حذف یک ورودی، فایل مشترک به‌روز شود."
          />
          {settings.enabled && settings.autoSync && platform.canAutoSync && (
            <div className="option-row">
              <div className="option-copy">
                <strong>فاصلهٔ بررسی خودکار</strong>
                <span>هر چند وقت یک‌بار فایل مشترک دوباره بررسی شود.</span>
              </div>
              <select
                className="option-select"
                value={settings.intervalSeconds}
                aria-label="فاصلهٔ بررسی خودکار"
                onChange={(event) => updateSettings({ intervalSeconds: Number(event.target.value) })}
              >
                {SYNC_INTERVALS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className={`sync-state tone-${tone}`} role="status" aria-live="polite">
          <span className="sync-state-dot" />
          <div className="sync-state-copy">
            <strong>{!online && settings.enabled ? PHASE_LABELS.offline : (PHASE_LABELS[phase] || PHASE_LABELS.idle)}</strong>
            <span>{file?.name || "هیچ فایل مشترکی انتخاب نشده"}</span>
          </div>
          <div className="sync-state-meta">
            {settings.enabled && pending && <span className="pending-badge">تغییرهای سینک‌نشده</span>}
            <span className="sync-last-time">آخرین سینک: {formatTime(lastSyncedAt)}</span>
          </div>
        </div>

        {error && <p className="sync-error" role="alert">{error}</p>}
        {!supported && (
          <p className="sync-error" role="status">
            این نسخه امکان انتخاب فایل ندارد. برای سینک، نصاب Windows یا APK اندروید را نصب کن.
          </p>
        )}

        <div className="sync-actions">
          <button
            className="sync-now-btn"
            type="button"
            disabled={!supported || !file || busy || !settings.enabled}
            onClick={() => syncNow({ force: true })}
          >
            {busy ? "در حال همگام‌سازی…" : "همگام‌سازی اکنون"}
          </button>
          <button
            className="primary-btn"
            type="button"
            disabled={!supported || busy}
            onClick={() => selectFile(false)}
          >
            انتخاب فایل موجود
          </button>
          <button
            className="secondary-btn"
            type="button"
            disabled={!supported || busy}
            onClick={() => selectFile(true)}
          >
            ساخت فایل جدید
          </button>
          {platform.id === "desktop" && file && (
            <button className="text-btn" type="button" onClick={() => reveal()}>نمایش فایل در پوشه</button>
          )}
          {file && (
            <button className="text-btn" type="button" disabled={busy} onClick={disconnect}>قطع اتصال</button>
          )}
        </div>
      </div>

      <div className="panel sync-devices">
        <div className="panel-head">
          <h3>دستگاه‌های متصل</h3>
          <span className="muted">DEVICE ROSTER</span>
        </div>
        <div className="device-grid">
          <div className="device-card current">
            <span className="device-icon" aria-hidden="true">{deviceIcon(platform.id)}</span>
            <div>
              <strong>{platform.label}</strong>
              <small>همین دستگاه · {formatTime(lastSyncedAt)}</small>
            </div>
          </div>
          {otherDevices.map((device) => (
            <div className="device-card" key={device.id}>
              <span className="device-icon" aria-hidden="true">{deviceIcon(device.platform)}</span>
              <div>
                <strong>{device.label}</strong>
                <small>آخرین سینک · {formatTime(device.lastSyncedAt)}</small>
              </div>
            </div>
          ))}
          {otherDevices.length === 0 && (
            <div className="device-card empty">
              <span className="device-icon" aria-hidden="true">＋</span>
              <div>
                <strong>هنوز دستگاه دیگری وصل نشده</strong>
                <small>در {partnerName} همین فایل را انتخاب کن تا اینجا دیده شود.</small>
              </div>
            </div>
          )}
        </div>
      </div>

      {log.length > 0 && (
        <div className="panel sync-log">
          <div className="panel-head">
            <h3>گزارش سینک</h3>
            <span className="muted">LAST {log.length}</span>
          </div>
          <ul>
            {log.map((item, index) => (
              <li key={`${item.at}-${index}`} className={item.ok ? "" : "failed"}>
                <span className="log-dot" aria-hidden="true" />
                <span className="log-message">{item.message}</span>
                <time dateTime={item.at}>{formatTime(item.at)}</time>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel sync-guide">
        <div className="eyebrow red">راه‌اندازی یک‌باره</div>
        <ol>
          <li>در یکی از دستگاه‌ها فایل <code>DA Works Sync.json</code> را داخل Google Drive بساز (دکمهٔ «ساخت فایل جدید»).</li>
          <li>در دستگاه دیگر «انتخاب فایل موجود» را بزن و <b>همان فایل</b> را از Google Drive انتخاب کن.</li>
          <li>در Windows، Google Drive for desktop را نصب کن و فایل را در پوشهٔ Drive انتخاب کن؛ بهتر است آن را «Available offline» کنی.</li>
          <li>گزینهٔ «همگام‌سازی» را در هر دو دستگاه روشن کن.</li>
        </ol>
        <p>{isAndroid
          ? "هر وقت به دسکتاپ دسترسی نداری، در همین‌جا بنویس و «همگام‌سازی اکنون» را بزن. دفعهٔ بعد که کامپیوتر آنلاین شود، نسخهٔ ویندوز خودکار همان نوشته‌ها را می‌گیرد."
          : "وقتی در اندروید می‌نویسی و سینک می‌زنی، به‌محض اینکه Google Drive فایل را روی این کامپیوتر به‌روز کند، برنامه تغییرها را می‌خواند و ادغام می‌کند."}</p>
        <p className="sync-privacy-note">
          اگر یک ورودی روی دو دستگاه با محتوای متفاوت تغییر کند، هر دو نسخه نگه داشته می‌شود (یک کپی با برچسب conflict copy).
          محتوای فایل رمزگذاری سرتاسری ندارد؛ دسترسی آن را با تنظیمات حساب Google خودت کنترل کن.
        </p>
      </div>
    </div>
  );
}
