/**
 * Browser fallback for the shared sync file (Chromium's File System Access API).
 *
 * The desktop app uses Electron and Android uses the Storage Access Framework;
 * this module lets the plain web build point at the same `DA Works Sync.json`
 * inside a Google Drive for desktop folder, which is handy for testing the flow
 * without packaging an installer first.
 */
const DB_NAME = "da-works-sync";
const STORE_NAME = "handles";
const HANDLE_KEY = "sync-file";
const MAX_SYNC_FILE_BYTES = 20 * 1024 * 1024;

export function isWebFileAccessSupported() {
  return typeof window !== "undefined"
    && typeof window.showOpenFilePicker === "function"
    && typeof window.showSaveFilePicker === "function";
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("مرورگر اجازهٔ نگه‌داشتن فایل همگام‌سازی را نمی‌دهد."));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("ذخیرهٔ تنظیمات فایل در مرورگر ناموفق بود."));
  });
}

async function withStore(mode, run) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = run(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("دسترسی به تنظیمات فایل ناموفق بود."));
    });
  } finally {
    database.close();
  }
}

const readHandle = () => withStore("readonly", (store) => store.get(HANDLE_KEY));
const writeHandle = (handle) => withStore("readwrite", (store) => store.put(handle, HANDLE_KEY));
const deleteHandle = () => withStore("readwrite", (store) => store.delete(HANDLE_KEY));

function pickerFailure(error) {
  if (error?.name === "AbortError") return null;
  if (error?.name === "SecurityError") {
    return new Error("مرورگر در این حالت (مثلاً داخل قاب پیش‌نمایش) اجازهٔ انتخاب فایل نمی‌دهد؛ نسخهٔ دسکتاپ یا Android را استفاده کن.");
  }
  return error;
}

export async function webFileInfo() {
  if (!isWebFileAccessSupported()) return null;
  try {
    const handle = await readHandle();
    if (!handle) return null;
    const permission = await handle.queryPermission?.({ mode: "readwrite" });
    return { configured: true, name: handle.name, needsPermission: permission !== "granted" };
  } catch {
    return null;
  }
}

export async function webChooseSyncFile(createNew) {
  try {
    const options = {
      types: [{ description: "DA Works sync file", accept: { "application/json": [".json"] } }],
      excludeAcceptAllOption: false,
      multiple: false
    };
    const [handle] = createNew
      ? [await window.showSaveFilePicker({ ...options, suggestedName: "DA Works Sync.json" })]
      : await window.showOpenFilePicker(options);
    if (!handle) return null;
    await handle.requestPermission?.({ mode: "readwrite" });
    await writeHandle(handle);
    return { configured: true, name: handle.name };
  } catch (error) {
    const failure = pickerFailure(error);
    if (failure) throw failure;
    return null;
  }
}

async function requireHandle() {
  const handle = await readHandle();
  if (!handle) throw new Error("ابتدا فایل همگام‌سازی مشترک را انتخاب کن.");

  let permission = await handle.queryPermission?.({ mode: "readwrite" });
  if (permission === "prompt") permission = await handle.requestPermission?.({ mode: "readwrite" });
  if (permission === "denied") {
    throw new Error("مرورگر دسترسی به فایل همگام‌سازی را پس گرفت؛ یک بار دیگر فایل را انتخاب کن.");
  }
  return handle;
}

export async function webReadSyncFile() {
  const handle = await requireHandle();
  const file = await handle.getFile();
  if (file.size > MAX_SYNC_FILE_BYTES) throw new Error("فایل همگام‌سازی بیش از حد بزرگ است (بیش از ۲۰ مگابایت).");
  return { content: await file.text(), modifiedAt: new Date(file.lastModified).toISOString() };
}

export async function webWriteSyncFile(content) {
  if (new TextEncoder().encode(content).length > MAX_SYNC_FILE_BYTES) {
    throw new Error("فایل همگام‌سازی بیش از حد بزرگ است (بیش از ۲۰ مگابایت).");
  }
  const handle = await requireHandle();
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
  const file = await handle.getFile();
  return { modifiedAt: new Date(file.lastModified).toISOString() };
}

export async function webClearSyncFile() {
  try {
    await deleteHandle();
    return true;
  } catch {
    return false;
  }
}
