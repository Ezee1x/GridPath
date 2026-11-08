import { queueTeamRecord, syncTeamFile, sharedFiles } from "../team/client";
import type { IntakeRecord } from "./types";
import { loadIntake, INTAKE_STORAGE } from "./model";
import { portableIntake } from "./portable";
import { reconcileElectricalDiscovery } from "../electrical/record";
import {
  belongsToSite,
  indexedDbVault,
  sha256,
  storedFile,
  toFile,
  type FileVault,
} from "./file-vault";
type StorageAccess = Pick<Storage, "getItem" | "setItem">;
export function createEngineeringStore(
  storage?: StorageAccess,
  onSave?: () => void,
  vault?: FileVault | null,
) {
  const entries = new Map<string, ReturnType<typeof makeEntry>>();
  function makeEntry(key: string, initialize: () => IntakeRecord) {
    let disposed = false;
    let saved: IntakeRecord | null = null,
      blocked = false,
      warning = "";
    try {
      if (storage) saved = loadIntake(storage, key);
    } catch {
      blocked = true;
      warning =
        "Saved engineering record could not be loaded. Its stored copy is preserved; export session changes before replacing it.";
    }
    let snapshot = {
      record: saved ?? initialize(),
      warning,
      blocked,
      /** "browser": file contents survive refresh here. "session": memory only. */
      fileStorage: (vault ? "browser" : "session") as "browser" | "session",
    };
    const listeners = new Set<() => void>();
    const fileWarning = (text: string) => {
      snapshot = { ...snapshot, warning: text };
      notify();
    };
    // Every attachment written to the shared map is also kept in the vault.
    class FileMap extends Map<string, File> {
      set(fileKey: string, file: File) {
        if (disposed) return this;
        super.set(fileKey, file);
        syncTeamFile(fileKey, key, file);
        if (vault && belongsToSite(fileKey, key))
          void sha256(file)
            .then((hash) => vault.put(storedFile(fileKey, key, hash, file)))
            .catch(() =>
              fileWarning(
                "This file is attached for the current session only. Browser file storage is unavailable or full.",
              ),
            );
        return this;
      }
    }
    const files = new FileMap();
    // Discovery statuses follow the record: evidence, values and reviews update them.
    const current = (record: IntakeRecord) =>
      reconcileElectricalDiscovery(record, files);
    snapshot = { ...snapshot, record: current(snapshot.record) };
    async function restoreFiles() {
      try {
        let restored = 0;
        for (const row of await sharedFiles(key)) {
          if (disposed) return;
          if (!snapshot.record.sources[row.key]?.fileName || files.has(row.key))
            continue;
          if ((await sha256(row.file)) !== row.hash) continue;
          Map.prototype.set.call(files, row.key, row.file);
          restored++;
          if (vault)
            await vault.put(storedFile(row.key, key, row.hash, row.file));
        }
        for (const row of (await vault?.list(key)) ?? []) {
          if (disposed) return;
          const source = snapshot.record.sources[row.key];
          // Restore only files this site's record still references, unaltered.
          if (!source?.fileName || files.has(row.key)) continue;
          if (!belongsToSite(row.key, key) || row.siteKey !== key) continue;
          if (source.fileHash && source.fileHash !== row.hash) continue;
          if ((await sha256(row.blob)) !== row.hash) continue;
          Map.prototype.set.call(files, row.key, toFile(row));
          restored++;
        }
        if (restored && !disposed) {
          snapshot = { ...snapshot, record: current(snapshot.record) };
          persist();
          notify();
        }
      } catch {
        fileWarning(
          "Stored file contents could not be read from this browser. File references are kept; re-add files to open them.",
        );
      }
    }
    const restoring = restoreFiles();
    let persisted = "";
    function persist() {
      if (disposed || snapshot.blocked || !storage) return;
      try {
        const raw = JSON.stringify({
          ...portableIntake(snapshot.record),
          environment: undefined,
        });
        if (raw === persisted) return;
        storage.setItem(INTAKE_STORAGE + key, raw);
        queueTeamRecord("engineering", key, JSON.parse(raw));
        persisted = raw;
        onSave?.();
      } catch {
        snapshot = {
          ...snapshot,
          warning:
            "Browser storage is unavailable or full. Export this engineering record to retain session changes.",
        };
      }
    }
    function notify() {
      listeners.forEach((fn) => fn());
    }
    return {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      files,
      restoring,
      dispose: () => {
        disposed = true;
        files.clear();
      },
      flush: () => {
        persist();
        notify();
      },
      update: (fn: (r: IntakeRecord) => IntakeRecord) => {
        if (disposed) return;
        const record = current(fn(snapshot.record));
        if (record.siteKey !== key)
          throw Error("Engineering update belongs to another site.");
        if (record === snapshot.record) return;
        snapshot = { ...snapshot, record };
        persist();
        notify();
      },
      reload: () => {
        if (disposed) return;
        try {
          const record = storage && loadIntake(storage, key);
          if (record) {
            snapshot = { ...snapshot, record: current(record) };
            notify();
            void restoreFiles();
          }
        } catch {
          /* Preserve current record and unreadable stored copy. */
        }
      },
    };
  }
  return {
    open: (key: string, initialize: () => IntakeRecord) => {
      let entry = entries.get(key);
      if (!entry) {
        entry = makeEntry(key, initialize);
        entries.set(key, entry);
      }
      return entry;
    },
    reload: (key: string) => entries.get(key)?.reload(),
    reset: () => {
      for (const entry of entries.values()) entry.dispose();
      entries.clear();
    },
  };
}
let browserStore: ReturnType<typeof createEngineeringStore> | undefined;
export function engineeringStore() {
  if (!browserStore) {
    let storage: StorageAccess | undefined;
    try {
      if (typeof window !== "undefined") storage = window.localStorage;
    } catch {
      /* Session-only mode. */
    }
    let vault: FileVault | null = null;
    try {
      vault = indexedDbVault();
    } catch {
      /* Session-only file contents. */
    }
    browserStore = createEngineeringStore(
      storage,
      () => {
        if (typeof window !== "undefined")
          window.dispatchEvent(new Event("qore-intake-saved"));
      },
      vault,
    );
    if (typeof window !== "undefined")
      window.addEventListener("qore-team-engineering", (event) =>
        browserStore?.reload((event as CustomEvent<string>).detail),
      );
    if (typeof window !== "undefined")
      window.addEventListener("storage", (event) => {
        if (event.key?.startsWith(INTAKE_STORAGE))
          browserStore?.reload(event.key.slice(INTAKE_STORAGE.length));
      });
  }
  return browserStore;
}
