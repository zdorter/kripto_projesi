/** Shared IndexedDB KV (same DB as crypto-dashboard.html). */
export const CRYPTO_DASHBOARD_IDB_NAME = "crypto-dashboard-db";
export const CRYPTO_DASHBOARD_IDB_STORE = "kv";

let idbOpenPromise: Promise<IDBDatabase> | null = null;

function openIdb(): Promise<IDBDatabase> {
  if (idbOpenPromise) {
    return idbOpenPromise;
  }
  idbOpenPromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(CRYPTO_DASHBOARD_IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(CRYPTO_DASHBOARD_IDB_STORE)) {
        req.result.createObjectStore(CRYPTO_DASHBOARD_IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return idbOpenPromise;
}

export async function cryptoDashboardIdbGet(key: string): Promise<unknown> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CRYPTO_DASHBOARD_IDB_STORE, "readonly");
    const req = tx.objectStore(CRYPTO_DASHBOARD_IDB_STORE).get(key);
    req.onsuccess = () =>
      resolve(req.result === undefined ? null : req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cryptoDashboardIdbSet(
  key: string,
  value: unknown
): Promise<void> {
  const db = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CRYPTO_DASHBOARD_IDB_STORE, "readwrite");
    tx.objectStore(CRYPTO_DASHBOARD_IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
