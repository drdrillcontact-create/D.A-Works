import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";

const isAndroid = () => Capacitor.getPlatform() === "android";

/**
 * The app is always dark, but Android derives the status-bar icon colour from the
 * system theme — without this, a phone in light mode paints dark icons on our
 * carbon background and they disappear.
 */
export function applyNativeChrome() {
  if (!isAndroid()) return;
  SystemBars.setStyle({ style: SystemBarsStyle.Dark }).catch(() => {
    // Older WebViews / unsupported builds keep the theme default.
  });
}

/** Hardware/gesture back: close the sheet, then step out to Overview, then exit. */
export function subscribeBackButton(handler) {
  if (!isAndroid()) return () => {};
  let disposed = false;
  let handle;
  CapacitorApp.addListener("backButton", handler).then((listener) => {
    if (disposed) listener.remove();
    else handle = listener;
  }).catch(() => { /* not available on this build */ });
  return () => {
    disposed = true;
    handle?.remove();
  };
}

export function exitNativeApp() {
  if (!isAndroid()) return;
  CapacitorApp.exitApp().catch(() => {});
}
