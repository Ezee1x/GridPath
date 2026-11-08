"use client";
import {
  useEffect,
  createContext,
  useContext,
  useSyncExternalStore,
  ReactNode,
} from "react";
import { refreshTeam, syncTeamSite } from "./team/client";
import { SiteRecord } from "./types";

import { loadSavedWorkspace, WORKSPACE_STORAGE_KEY } from "./persistence";
interface Snapshot {
  sites: SiteRecord[];
  ready: boolean;
  warning: string;
  files: Record<string, File>;
}
interface Store extends Snapshot {
  save: (site: SiteRecord) => void;
  reset: () => void;
  stage: (id: string, file: File) => void;
}
const serverSnapshot: Snapshot = {
  sites: [],
  ready: false,
  warning: "",
  files: {},
};
let snapshot: Snapshot = serverSnapshot;
const listeners = new Set<() => void>();
function getSnapshot() {
  if (!snapshot.ready) {
    let sites = serverSnapshot.sites;
    let warning = "";
    try {
      const saved = loadSavedWorkspace(localStorage);
      sites = (saved.sites ?? []).filter(
        (site) =>
          !site.sample &&
          ![
            "century-tywood",
            "thermofusion",
            "aalberts-surface-technologies",
          ].includes(site.id),
      );
      warning = saved.warning;
      if (saved.sites && sites !== saved.sites) {
        try {
          localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(sites));
        } catch {
          warning =
            "Browser storage could not save the record cleanup; changes remain in this session.";
        }
      }
    } catch {
      warning =
        "Saved workspace could not be loaded. No records are shown; export your saved copy before resetting it.";
    }
    snapshot = { ...snapshot, sites, warning, ready: true };
  }
  return snapshot;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function notify() {
  listeners.forEach((listener) => listener());
}
function persist(sites: SiteRecord[]) {
  let warning = "";
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(sites));
  } catch {
    warning =
      "Browser storage is unavailable or full. Changes remain in this session; export your record to keep a copy.";
  }
  snapshot = { ...snapshot, sites, warning };
  notify();
}
const Context = createContext<Store | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const receive = (event: Event) => {
      const incoming = (event as CustomEvent<SiteRecord[]>).detail;
      const map = new Map(snapshot.sites.map((s) => [s.id, s]));
      incoming.forEach((s) => map.set(s.id, s));
      persist([...map.values()]);
    };
    window.addEventListener("qore-team-sites", receive);
    void refreshTeam().catch(() => {});
    return () => window.removeEventListener("qore-team-sites", receive);
  }, []);
  const state = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => serverSnapshot,
  );
  function save(site: SiteRecord) {
    const updated = { ...site, updatedAt: new Date().toISOString() };
    syncTeamSite(updated);
    persist(
      snapshot.sites.some((s) => s.id === site.id)
        ? snapshot.sites.map((s) => (s.id === site.id ? updated : s))
        : [updated, ...snapshot.sites],
    );
  }
  return (
    <Context.Provider
      value={{
        ...state,
        save,
        stage: (id, file) => {
          snapshot = { ...snapshot, files: { ...snapshot.files, [id]: file } };
          notify();
        },
        reset: () => {
          snapshot = { ...snapshot, files: {} };
          persist([]);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw Error("Workspace provider missing");
  return value;
}
