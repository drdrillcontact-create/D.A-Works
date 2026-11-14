const { app, BrowserWindow, Menu, dialog, ipcMain, powerMonitor, shell } = require("electron");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");

const MAX_SYNC_FILE_BYTES = 20 * 1024 * 1024;
const SELF_WRITE_IGNORE_MS = 1500;
const WATCH_EMIT_DEBOUNCE_MS = 200;

const syncSettingsPath = () => path.join(app.getPath("userData"), "sync-settings.json");

let watcher = null;
let watchTimer = null;
let lastSelfWriteAt = 0;

function broadcast(channel, payload) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload);
  }
}

function notifySyncFileChanged(reason) {
  if (Date.now() - lastSelfWriteAt < SELF_WRITE_IGNORE_MS) return;
  clearTimeout(watchTimer);
  watchTimer = setTimeout(() => broadcast("sync-file:changed", { reason }), WATCH_EMIT_DEBOUNCE_MS);
}

/**
 * Google Drive for desktop usually replaces the file rather than editing it in
 * place, so watch the parent directory and filter by name. This is what makes a
 * phone sync show up on the desktop a moment after Drive downloads it.
 */
function stopWatching() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}

function startWatching(filePath) {
  stopWatching();
  if (!filePath) return;
  try {
    watcher = fsSync.watch(path.dirname(filePath), { persistent: false }, (_event, filename) => {
      if (!filename || filename === path.basename(filePath)) notifySyncFileChanged("file");
    });
    watcher.on("error", () => stopWatching());
  } catch {
    // Folder unavailable (Drive offline / unmounted): the renderer keeps polling.
    watcher = null;
  }
}

async function getSyncPath() {
  try {
    const settings = JSON.parse(await fs.readFile(syncSettingsPath(), "utf8"));
    return typeof settings.filePath === "string" ? settings.filePath : null;
  } catch {
    return null;
  }
}

async function setSyncPath(filePath) {
  await fs.mkdir(path.dirname(syncSettingsPath()), { recursive: true });
  await fs.writeFile(syncSettingsPath(), JSON.stringify({ filePath }), "utf8");
  startWatching(filePath);
  return { configured: true, name: path.basename(filePath), path: filePath };
}

ipcMain.handle("sync-file:get-info", async () => {
  const filePath = await getSyncPath();
  if (!filePath) return null;
  startWatching(filePath);
  return { configured: true, name: path.basename(filePath), path: filePath };
});

ipcMain.handle("sync-file:choose", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const currentPath = await getSyncPath();
  const result = await dialog.showOpenDialog(window, {
    title: "Select the DA Works sync file in Google Drive",
    defaultPath: currentPath || app.getPath("documents"),
    properties: ["openFile"],
    filters: [{ name: "DA Works sync file", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return setSyncPath(result.filePaths[0]);
});

ipcMain.handle("sync-file:create", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(window, {
    title: "Create the DA Works sync file in your Google Drive folder",
    defaultPath: path.join(app.getPath("documents"), "DA Works Sync.json"),
    filters: [{ name: "DA Works sync file", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePath) return null;

  try {
    await fs.access(result.filePath);
  } catch {
    await fs.writeFile(result.filePath, "", { encoding: "utf8", flag: "wx" });
  }
  return setSyncPath(result.filePath);
});

ipcMain.handle("sync-file:read", async () => {
  const filePath = await getSyncPath();
  if (!filePath) throw new Error("Sync file is not configured.");
  const info = await fs.stat(filePath);
  if (info.size > MAX_SYNC_FILE_BYTES) throw new Error("Sync file exceeds the 20 MiB safety limit.");
  const content = await fs.readFile(filePath, "utf8");
  if (Buffer.byteLength(content, "utf8") > MAX_SYNC_FILE_BYTES) {
    throw new Error("Sync file exceeds the 20 MiB safety limit.");
  }
  return { content, modifiedAt: info.mtime.toISOString() };
});

ipcMain.handle("sync-file:write", async (_event, payload) => {
  const filePath = await getSyncPath();
  if (!filePath) throw new Error("Sync file is not configured.");
  if (!payload || typeof payload.content !== "string") throw new Error("Invalid sync data.");
  if (Buffer.byteLength(payload.content, "utf8") > MAX_SYNC_FILE_BYTES) {
    throw new Error("Sync file exceeds the 20 MiB safety limit.");
  }

  // Write next to the target and rename, so Google Drive never uploads a
  // half-written document and the other device cannot read a truncated file.
  const temporaryPath = `${filePath}.da-works-tmp`;
  lastSelfWriteAt = Date.now();
  try {
    await fs.writeFile(temporaryPath, payload.content, "utf8");
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    if (error && ["EXDEV", "EPERM", "EACCES", "EBUSY"].includes(error.code)) {
      await fs.writeFile(filePath, payload.content, "utf8");
    } else {
      throw error;
    }
  }
  lastSelfWriteAt = Date.now();
  const info = await fs.stat(filePath);
  return { modifiedAt: info.mtime.toISOString() };
});

ipcMain.handle("sync-file:clear", async () => {
  stopWatching();
  try {
    await fs.rm(syncSettingsPath(), { force: true });
  } catch {
    return false;
  }
  return true;
});

ipcMain.handle("sync-file:reveal", async () => {
  const filePath = await getSyncPath();
  if (!filePath) return false;
  shell.showItemInFolder(filePath);
  return true;
});

function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Sync now",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => broadcast("sync-file:changed", { reason: "manual" })
        },
        {
          label: "Show sync file in folder",
          click: async () => {
            const filePath = await getSyncPath();
            if (filePath) shell.showItemInFolder(filePath);
          }
        },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
 ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }])
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 420,
    minHeight: 600,
    backgroundColor: "#0b0c0e",
    title: "DA Works",
    icon: path.join(__dirname, "../assets/electron/icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (!app.isPackaged) {
    win.loadURL("http://127.0.0.1:5173");
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

// Two instances writing the same Drive file would race; keep exactly one.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [window] = BrowserWindow.getAllWindows();
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
      broadcast("sync-file:changed", { reason: "focus" });
    } else {
      createWindow();
    }
  });

  app.whenReady().then(() => {
    buildMenu();
    createWindow();
    getSyncPath().then((filePath) => startWatching(filePath)).catch(() => {});

    // Waking from sleep is the classic "desktop came back online" moment.
    powerMonitor.on("resume", () => notifySyncFileChanged("resume"));
    powerMonitor.on("unlock-screen", () => notifySyncFileChanged("unlock"));

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    stopWatching();
    if (process.platform !== "darwin") app.quit();
  });
}
