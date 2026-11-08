import { SiteRecord } from "./types";

export const WORKSPACE_STORAGE_KEY = "qoresites-workspace-v1";
// Keep the original namespace readable so a product rename never resets intake records.
const LEGACY_WORKSPACE_KEYS = [
  "qore-projectsync-workspace-v1",
  "gridpath-workspace-v1",
];
type WorkspaceStorage = Pick<Storage, "getItem" | "setItem">;

export function loadSavedWorkspace(storage: WorkspaceStorage): {
  sites: SiteRecord[] | null;
  warning: string;
} {
  const current = storage.getItem(WORKSPACE_STORAGE_KEY);
  const raw =
    current ??
    LEGACY_WORKSPACE_KEYS.map((key) => storage.getItem(key)).find(
      (value) => value !== null,
    ) ??
    null;
  if (raw === null) return { sites: null, warning: "" };
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(isSiteRecord))
    throw new Error("Invalid saved workspace");
  let warning = "";
  if (current === null) {
    try {
      storage.setItem(WORKSPACE_STORAGE_KEY, raw);
    } catch {
      warning =
        "Your saved records are loaded. Browser storage could not save the updated workspace; export edits to keep a copy.";
    }
  }
  return { sites: parsed, warning };
}

export const EXPLORER_PLACE_ID_KEY = "qoresites-explorer-place-id";
export function loadExplorerPlaceId(storage: WorkspaceStorage): string | null {
  const current = storage.getItem(EXPLORER_PLACE_ID_KEY);
  if (current !== null) return current;
  const previous = storage.getItem("qore-projectsync-explorer-place-id");
  if (previous !== null) {
    try {
      storage.setItem(EXPLORER_PLACE_ID_KEY, previous);
    } catch {
      /* Keep the readable legacy ID when storage is full. */
    }
  }
  return previous;
}

function isSiteRecord(value: unknown): value is SiteRecord {
  if (!value || typeof value !== "object") return false;
  const site = value as Partial<SiteRecord>;
  return (
    typeof site.id === "string" &&
    typeof site.facilityName === "string" &&
    typeof site.address === "string" &&
    Array.isArray(site.dataFields) &&
    Array.isArray(site.sourceDocuments) &&
    Array.isArray(site.missingRequirements) &&
    Boolean(site.location)
  );
}
