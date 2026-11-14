const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const MAX_SYNC_FILE_BYTES = 20 * 1024 * 1024;
const syncSettingsPath = () => path.join(app.getPath("userData"), "sync-settings.json");

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
  return { configured: true, name: path.basename(filePath) };
}

ipcMain.handle("sync-file:get-info", async () => {
  const filePath = await getSyncPath();
  return filePath ? { configured: true, name: path.basename(filePath) } : null;
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
  await fs.writeFile(filePath, payload.content, "utf8");
  const info = await fs.stat(filePath);
  return { modifiedAt: info.mtime.toISOString() };
});

ipcMain.handle("sync-file:clear", async () => {
  try {
    await fs.rm(syncSettingsPath(), { force: true });
  } catch {
    return false;
  }
  return true;
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#0b0c0e",
    title: "DA Works",
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

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
