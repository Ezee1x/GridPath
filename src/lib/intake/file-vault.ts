// Legacy IndexedDB namespace retained for existing file/image compatibility after the QoreSites rebrand.
/**
 * Local file-content storage for attached evidence.
 *
 * This is the local-demo tier: file bytes live in this browser's IndexedDB so
 * they survive refresh. They are not shared with teammates. Team use needs
 * shared object storage plus a database (see docs/PERSISTENCE.md).
 */

export interface StoredFile {
  /** Source key in the engineering record: `input:<siteKey>:<fieldId>:<hash>`. */
  key: string;
  siteKey: string;
  hash: string;
  name: string;
  type: string;
  size: number;
  storedAt: string;
  blob: Blob;
}

export interface FileVault {
  kind: "indexeddb" | "memory";
  put(file: StoredFile): Promise<void>;
  list(siteKey: string): Promise<StoredFile[]>;
}

export async function sha256(blob: Blob) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}

/** Only keys created for this site can be stored or restored for it. */
export function belongsToSite(key: string, siteKey: string) {
  return key.startsWith(`input:${siteKey}:`);
}

export function storedFile(
  key: string,
  siteKey: string,
  hash: string,
  file: File,
): StoredFile {
  return {
    key,
    siteKey,
    hash,
    name: file.name,
    type: file.type,
    size: file.size,
    storedAt: new Date().toISOString(),
    blob: file,
  };
}

export function toFile(stored: StoredFile) {
  return new File([stored.blob], stored.name, { type: stored.type });
}

export function memoryVault(): FileVault {
  const rows = new Map<string, StoredFile>();
  return {
    kind: "memory",
    put: async (file) => {
      rows.set(file.key, file);
    },
    list: async (siteKey) =>
      [...rows.values()].filter((row) => row.siteKey === siteKey),
  };
}

const DB_NAME = "qore-projectsync-files";
const STORE = "files";

export function indexedDbVault(): FileVault | null {
  if (typeof indexedDB === "undefined") return null;
  let opening: Promise<IDBDatabase> | null = null;
  const db = () =>
    (opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, {
          keyPath: "key",
        });
        store.createIndex("siteKey", "siteKey");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        opening = null;
        reject(request.error);
      };
    }));
  return {
    kind: "indexeddb",
    put: async (file) => {
      const tx = (await db()).transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(file);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
    },
    list: async (siteKey) => {
      const request = (await db())
        .transaction(STORE)
        .objectStore(STORE)
        .index("siteKey")
        .getAll(siteKey);
      return new Promise<StoredFile[]>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result as StoredFile[]);
        request.onerror = () => reject(request.error);
      });
    },
  };
}
