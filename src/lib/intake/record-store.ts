import type { IntakeRecord } from "./types";
import { loadIntake, INTAKE_STORAGE } from "./model";
import { portableIntake } from "./portable";
type StorageAccess = Pick<Storage, "getItem" | "setItem">;
export function createEngineeringStore(
  storage?: StorageAccess,
  onSave?: () => void,
) {
  const entries = new Map<string, ReturnType<typeof makeEntry>>();
  function makeEntry(key: string, initialize: () => IntakeRecord) {
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
    let snapshot = { record: saved ?? initialize(), warning, blocked };
    const files = new Map<string, File>(),
      listeners = new Set<() => void>();
    let persisted = "";
    function persist() {
      if (snapshot.blocked || !storage) return;
      try {
        const raw = JSON.stringify({
          ...portableIntake(snapshot.record),
          environment: undefined,
        });
        if (raw === persisted) return;
        storage.setItem(INTAKE_STORAGE + key, raw);
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
      flush: () => {
        persist();
        notify();
      },
      update: (fn: (r: IntakeRecord) => IntakeRecord) => {
        const record = fn(snapshot.record);
        if (record.siteKey !== key)
          throw Error("Engineering update belongs to another site.");
        if (record === snapshot.record) return;
        snapshot = { ...snapshot, record };
        persist();
        notify();
      },
      reload: () => {
        try {
          const record = storage && loadIntake(storage, key);
          if (record) {
            snapshot = { ...snapshot, record };
            notify();
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
    browserStore = createEngineeringStore(storage, () => {
      if (typeof window !== "undefined")
        window.dispatchEvent(new Event("qore-intake-saved"));
    });
    if (typeof window !== "undefined")
      window.addEventListener("storage", (event) => {
        if (event.key?.startsWith(INTAKE_STORAGE))
          browserStore?.reload(event.key.slice(INTAKE_STORAGE.length));
      });
  }
  return browserStore;
}
