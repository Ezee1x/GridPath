import test from "node:test";
import assert from "node:assert/strict";
import { clearBrowserRecords } from "./workspace-reset";
import { createEngineeringStore } from "./intake/record-store";
import { createIntakeRecord, INTAKE_STORAGE } from "./intake/model";
import { verifyManualValue } from "./intake/manual-value";
import { WORKSPACE_STORAGE_KEY, loadSavedWorkspace } from "./persistence";

test("reset clears saved manual values, verification and cached records without clearing configuration", async () => {
  const data = new Map<string, string>();
  const storage = {
    get length() { return data.size; },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
  const initialize = () => createIntakeRecord("reset-site", "25 Southgate St", null);
  const store = createEngineeringStore(storage);
  const entry = store.open(initialize().siteKey, initialize);
  await entry.restoring;
  entry.update(record => verifyManualValue(record, {
    siteKey: record.siteKey, fieldId: "facilityName", value: "southpark",
    unit: "", reviewer: "Demo reviewer", note: "", expectedObservationId: null,
  }));
  assert.ok(storage.getItem(INTAKE_STORAGE + initialize().siteKey)?.includes("southpark"));
  data.set("qore-projectsync-workspace-v1", "[]");
  data.set("qoresites-explorer-place-id", "reset-site");
  data.set("app-configuration", "keep");
  clearBrowserRecords(storage);
  store.reset();
  // Late jobs holding the previous entry cannot resurrect cleared values.
  entry.flush();
  entry.update(record => ({ ...record, identity: { ...record.identity, address: "old job" } }));
  assert.equal(storage.getItem(INTAKE_STORAGE + initialize().siteKey), null);
  assert.equal(storage.getItem(WORKSPACE_STORAGE_KEY), "[]");
  assert.deepEqual(loadSavedWorkspace(storage).sites, []);
  assert.equal(storage.getItem("app-configuration"), "keep");
  assert.equal(storage.getItem("qoresites-explorer-place-id"), null);
  const fresh = store.open(initialize().siteKey, initialize).getSnapshot().record;
  const field = fresh.fields.find(field => field.id === "facilityName")!;
  assert.equal(field.selectedId, null);
  assert.equal(field.review.status, "Unreviewed");
  assert.equal(field.request.status, "Missing");
  assert.equal(fresh.energyImports, undefined);
});
