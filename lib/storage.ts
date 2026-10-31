export type Asset = {
  id: string;
  name: string;
  type: string;
  blob: Blob;
  created: number;
};
export type Job = {
  id: string;
  model: string;
  kind: string;
  prompt: string;
  assetId: string;
  created: number;
  status: "processing" | "completed";
  demo: true;
};
const DB_NAME = "aiorbust-local";
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      for (const name of ["assets", "jobs"])
        r.result.createObjectStore(name, { keyPath: "id" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function records<T>(store: "assets" | "jobs"): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store);
    const r = tx.objectStore(store).getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    tx.oncomplete = () => db.close();
  });
}
export async function saveRecord(store: "assets" | "jobs", value: Asset | Job) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function removeRecord(store: "assets" | "jobs", id: string) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
