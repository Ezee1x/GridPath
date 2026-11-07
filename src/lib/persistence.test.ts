import { test } from "node:test";
import assert from "node:assert/strict";
import { centuryTywoodSite } from "./fixtures";
import { loadSavedWorkspace, WORKSPACE_STORAGE_KEY } from "./persistence";
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
