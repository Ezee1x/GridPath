import { test } from "node:test";
import assert from "node:assert/strict";
import { centuryTywoodSite } from "./fixtures";
import {
  loadSavedWorkspace,
  WORKSPACE_STORAGE_KEY,
  loadExplorerPlaceId,
  EXPLORER_PLACE_ID_KEY,
} from "./persistence";
function memoryStorage(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
test("renaming the product retains legacy records and their review edits", () => {
  const site = structuredClone(centuryTywoodSite);
  site.missingRequirements[0].assignedTo = "Facility manager";
  site.missingRequirements[0].status = "Requested";
  site.missingRequirements[0].notes = "Original follow-up";
  const raw = JSON.stringify([site]);
  const storage = memoryStorage({ "gridpath-workspace-v1": raw });
  const loaded = loadSavedWorkspace(storage);
  assert.deepEqual(loaded.sites, [site]);
  assert.equal(storage.getItem(WORKSPACE_STORAGE_KEY), raw);
  assert.equal(storage.getItem("gridpath-workspace-v1"), raw);
});
test("current workspace wins over a stale legacy copy", () => {
  const storage = memoryStorage({
    [WORKSPACE_STORAGE_KEY]: "[]",
    "gridpath-workspace-v1": JSON.stringify([centuryTywoodSite]),
  });
  assert.deepEqual(loadSavedWorkspace(storage).sites, []);
});
test("previous product workspace migrates unchanged and takes precedence over an older backup", () => {
  const site = structuredClone(centuryTywoodSite);
  site.facilityName = "User-edited facility name";
  const raw = JSON.stringify([site]);
  const storage = memoryStorage({
    "qore-projectsync-workspace-v1": raw,
    "gridpath-workspace-v1": "[]",
  });
  assert.deepEqual(loadSavedWorkspace(storage).sites, [site]);
  assert.equal(storage.getItem(WORKSPACE_STORAGE_KEY), raw);
  assert.equal(storage.getItem("qore-projectsync-workspace-v1"), raw);
});
test("explorer place IDs migrate without losing legacy values or overriding a newer selection", () => {
  const storage = memoryStorage({
    "qore-projectsync-explorer-place-id": "legacy-place",
  });
  assert.equal(loadExplorerPlaceId(storage), "legacy-place");
  assert.equal(storage.getItem(EXPLORER_PLACE_ID_KEY), "legacy-place");
  storage.setItem(EXPLORER_PLACE_ID_KEY, "newer-place");
  assert.equal(loadExplorerPlaceId(storage), "newer-place");
  assert.equal(
    storage.getItem("qore-projectsync-explorer-place-id"),
    "legacy-place",
  );
  assert.equal(
    loadExplorerPlaceId({
      getItem: () => "readable",
      setItem: () => {
        throw Error("full");
      },
    }),
    "readable",
  );
});
test("migration storage failure still returns the saved records", () => {
  const storage = {
    getItem: (key: string) =>
      key === WORKSPACE_STORAGE_KEY
        ? null
        : JSON.stringify([centuryTywoodSite]),
    setItem: () => {
      throw Error("Quota exceeded");
    },
  };
  const loaded = loadSavedWorkspace(storage);
  assert.equal(loaded.sites?.[0].id, "century-tywood");
  assert.ok(loaded.warning);
});
