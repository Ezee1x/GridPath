import { INTAKE_STORAGE } from "./intake/model";
import { WORKSPACE_STORAGE_KEY, EXPLORER_PLACE_ID_KEY } from "./persistence";

/** Reset browser records together with the address/parcel-specific field values. */
export function clearBrowserRecords(
  storage: Pick<Storage, "length" | "key" | "removeItem" | "setItem">,
) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith(INTAKE_STORAGE)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
  // Empty legacy namespaces too, so migrations cannot restore cleared sites.
  for (const key of [
    WORKSPACE_STORAGE_KEY,
    "qore-projectsync-workspace-v1",
    "gridpath-workspace-v1",
  ])
    storage.setItem(key, "[]");
  storage.removeItem(EXPLORER_PLACE_ID_KEY);
  storage.removeItem("qore-projectsync-explorer-place-id");
}
