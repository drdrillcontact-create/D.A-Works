const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("daWorksDesktop", Object.freeze({
  getSyncFileInfo: () => ipcRenderer.invoke("sync-file:get-info"),
  chooseSyncFile: () => ipcRenderer.invoke("sync-file:choose"),
  createSyncFile: () => ipcRenderer.invoke("sync-file:create"),
  readSyncFile: () => ipcRenderer.invoke("sync-file:read"),
  writeSyncFile: (payload) => ipcRenderer.invoke("sync-file:write", payload),
  clearSyncFile: () => ipcRenderer.invoke("sync-file:clear"),
  revealSyncFile: () => ipcRenderer.invoke("sync-file:reveal"),
  /** Wake-up nudges from the file watcher, power resume and the app menu. */
  onSyncFileChanged: (listener) => {
    const handler = (_event, payload) => listener(payload || {});
    ipcRenderer.on("sync-file:changed", handler);
    return () => ipcRenderer.removeListener("sync-file:changed", handler);
  }
}));
