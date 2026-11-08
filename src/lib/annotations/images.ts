// Original analysis images, kept byte-for-byte in IndexedDB so the
// localStorage workspace stays small. Annotations never modify these bytes.
const DB = "qore-projectsync-annotation-images";
const STORE = "analysis-images";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function run<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close()) as Promise<T>;
}
export const saveAnalysisImage = (id: string, blob: Blob) =>
  run("readwrite", (s) => s.put(blob, id));
export const loadAnalysisImage = (id: string) =>
  run<Blob | undefined>("readonly", (s) => s.get(id));
export const deleteAnalysisImage = (id: string) =>
  run("readwrite", (s) => s.delete(id));
