import assert from "node:assert/strict";
import test from "node:test";
import { FIELD_SCHEMA, ADDED_FIELD_IDS } from "./intake/schema";
import {
  createIntakeRecord,
  mergeCollectedFields,
  observationId,
  updateRequest,
  reviewField,
  exportIntake,
  readiness,
  loadIntake,
  rejectObservation,
  INTAKE_STORAGE,
  hasConflict,
} from "./intake/model";
import { verificationItems, fieldInView } from "./intake/verification";
import { createEngineeringStore } from "./intake/record-store";
import { equipmentValueComplete } from "./intake/equipment";
import { mergeLegacyRecord, LEGACY_FIELD_MAP } from "./intake/adapters";
import { centuryTywoodSite } from "./fixtures";
import type { EvidenceReference, FieldObservation } from "./intake/types";
const reference: EvidenceReference = {
  key: "test-doc",
  provider: "Explicit synthetic test",
  dataset: "Synthetic electrical record",
  serviceUrl: "https://example.test/panel.pdf",
  featureId: null,
  featureName: null,
  documentId: "test-doc",
  recordDate: "2026-01-01",
  datasetUpdated: null,
  retrievedAt: "2026-11-07",
};
const observation = (id: string, value: number): FieldObservation => ({
  id: observationId(
    id,
    value,
    "Synthetic test",
    [reference.key],
    "Synthetic test only",
    "A",
  ),
  value,
  unit: "A",
  originalUnits: "A",
  provider: "Synthetic test",
  provenance: "Customer document",
  sourceKeys: [reference.key],
  method: "Synthetic test only",
  confidence: "Documented",
  observedAt: "2026-11-07",
});
function memory() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}
test("every legacy verification requirement maps to a canonical field; no independent supplemental entries remain", () => {
  const missing = centuryTywoodSite.missingRequirements.filter(
    (r) => !FIELD_SCHEMA.some((d) => d.id === LEGACY_FIELD_MAP[r.fieldId]),
  );
  assert.deepEqual(missing, []);
  const r = mergeLegacyRecord(
    createIntakeRecord("legacy", "Synthetic", null),
    centuryTywoodSite,
  );
  assert.equal(FIELD_SCHEMA.length, 69);
  assert.equal(r.fields.length, 69);
  assert.equal(Object.keys(r.extraRequests).length, 0);
  assert.ok(r.sources["legacy:century-tywood:source-0"]);
  assert.deepEqual(
    r.legacyMigration?.requirements,
    centuryTywoodSite.missingRequirements,
  );
  const ids = verificationItems(r).map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("serviceAmperage"));
  assert.ok(ids.includes("availableCapacity"));
  assert.ok(ids.includes("utilityPole"));
  assert.ok(ids.includes("breakerSpace"));
  assert.ok(!ids.includes("power"));
  assert.equal(
    verificationItems(r).find((i) => i.id === "voltage")!.priority,
    "Critical",
  );
  assert.equal(
    verificationItems(r).find((i) => i.id === "utilityPole")!.priority,
    "Medium",
  );
});
test("58/59-field migration retains verified evidence, source dates, owners, request state and Slope archive", () => {
  let r = createIntakeRecord("old", "Synthetic", "1");
  r = mergeCollectedFields(
    r,
    [{ fieldId: "voltage", observation: observation("voltage", 480) }],
    { [reference.key]: reference },
  );
  r = reviewField(r, "voltage", "Test reviewer", "Synthetic verification");
  const old = {
    ...r,
    fieldSchemaVersion: undefined,
    fields: r.fields.filter((f) => !ADDED_FIELD_IDS.includes(f.id)),
    extraRequests: {
      bills: {
        status: "Requested" as const,
        owner: "Facilities",
        notes: "Original request",
      },
      underground: {
        status: "Received" as const,
        owner: "Engineer",
        notes: "Locate attached",
      },
    },
  };
  const storage = memory();
  storage.setItem(INTAKE_STORAGE + r.siteKey, JSON.stringify(old));
  const migrated = loadIntake(storage, r.siteKey)!;
  assert.equal(migrated.fields.length, 69);
  assert.equal(
    migrated.fields.find((f) => f.id === "voltage")!.review.status,
    "Engineer verified",
  );
  assert.deepEqual(migrated.sources, r.sources);
  assert.equal(
    migrated.fields.find((f) => f.id === "utilityBills")!.request.owner,
    "Facilities",
  );
  assert.equal(
    migrated.fields.find((f) => f.id === "undergroundUtilities")!.request
      .status,
    "Received",
  );
  assert.deepEqual(migrated.extraRequests, {});
  assert.ok(
    verificationItems(migrated).some(
      (i) => i.id === "utilityBills" && i.field.request.status === "Requested",
    ),
  );
  assert.equal(
    JSON.parse(storage.getItem(INTAKE_STORAGE + r.siteKey)!).fields.length,
    58,
    "Reading migration does not overwrite original storage",
  );
});
test("queue and dashboard share one live record, synchronize requests/reviews, export and isolate sites", () => {
  const storage = memory(),
    store = createEngineeringStore(storage),
    seed = () => createIntakeRecord("site-a", "Synthetic A", "1");
  const dashboard = store.open(seed().siteKey, seed),
    queue = store.open(seed().siteKey, seed);
  assert.equal(dashboard, queue);
  let notifications = 0;
  const unsubscribe = dashboard.subscribe(() => notifications++);
  queue.update((r) =>
    updateRequest(
      r,
      "serviceAmperage",
      "Requested",
      "Facilities",
      "Send service nameplate",
    ),
  );
  assert.equal(
    dashboard
      .getSnapshot()
      .record.fields.find((f) => f.id === "serviceAmperage")!.request.status,
    "Requested",
  );
  queue.update((r) =>
    mergeCollectedFields(
      r,
      [
        {
          fieldId: "serviceAmperage",
          observation: observation("serviceAmperage", 800),
        },
      ],
      { [reference.key]: reference },
    ),
  );
  assert.equal(readiness(dashboard.getSnapshot().record).populated, 1);
  assert.ok(
    verificationItems(queue.getSnapshot().record).some(
      (i) => i.id === "serviceAmperage",
    ),
  );
  dashboard.update((r) =>
    reviewField(
      r,
      "serviceAmperage",
      "Test reviewer",
      "Source reviewed in synthetic test",
    ),
  );
  assert.ok(
    !verificationItems(queue.getSnapshot().record).some(
      (i) => i.id === "serviceAmperage",
    ),
  );
  const exported = exportIntake(queue.getSnapshot().record);
  assert.equal(
    exported.fieldInventory.find((f) => f.id === "serviceAmperage")!.request
      .status,
    "Verified",
  );
  assert.equal(exported.readiness.missing, 51);
  const b = createIntakeRecord("site-b", "Synthetic B", "2");
  const other = store.open(b.siteKey, () => b);
  assert.equal(readiness(other.getSnapshot().record).populated, 0);
  assert.throws(
    () => other.update(() => dashboard.getSnapshot().record),
    /another site/,
  );
  queue.update((r) =>
    updateRequest(
      r,
      "serviceAmperage",
      "Requested",
      "Facilities",
      "New evidence needed",
    ),
  );
  const f = dashboard
    .getSnapshot()
    .record.fields.find((f) => f.id === "serviceAmperage")!;
  assert.equal(f.review.status, "Under review");
  assert.ok(
    f.reviewHistory?.some((h) => h.review.status === "Engineer verified"),
  );
  assert.ok(notifications >= 4);
  unsubscribe();
  const reopened = createEngineeringStore(storage).open(seed().siteKey, seed);
  assert.equal(
    reopened
      .getSnapshot()
      .record.fields.find((f) => f.id === "serviceAmperage")!.request.notes,
    "New evidence needed",
  );
});
test("rejected extraction and conflicts retain observations and history without verifying missing values", () => {
  let r = createIntakeRecord("conflicts", "Synthetic", "1");
  r = mergeCollectedFields(
    r,
    [
      {
        fieldId: "serviceAmperage",
        observation: observation("serviceAmperage", 400),
      },
      {
        fieldId: "serviceAmperage",
        observation: observation("serviceAmperage", 800),
      },
    ],
    { [reference.key]: reference },
  );
  const definition = FIELD_SCHEMA.find((d) => d.id === "serviceAmperage")!;
  assert.equal(fieldInView(r, definition, "conflicts"), true);
  r = rejectObservation(
    r,
    "serviceAmperage",
    observation("serviceAmperage", 800).id,
    "Test reviewer",
    "Wrong equipment",
  );
  const f = r.fields.find((f) => f.id === definition.id)!;
  assert.equal(f.observations.length, 2);
  assert.equal(f.selectedId, null);
  assert.equal(hasConflict(f), false);
  assert.ok(
    verificationItems(r)
      .find((i) => i.id === definition.id)!
      .reasons.includes("Extracted value rejected"),
  );
  assert.throws(
    () => reviewField(r, definition.id, "Reviewer", "No selected value"),
    /supporting/,
  );
});
test("design applicability and per-field priority overrides update queue and JSON consistently", () => {
  let r = createIntakeRecord("stages", "Synthetic", null);
  assert.ok(!exportIntake(r).missingFields.includes("power"));
  assert.equal(
    fieldInView(
      r,
      FIELD_SCHEMA.find((d) => d.id === "power")!,
      "missing",
    ),
    false,
  );
  r = {
    ...r,
    stage: "design",
    fields: r.fields.map((f) =>
      f.id === "utilityPole" ? { ...f, priority: "Low" as const } : f,
    ),
  };
  assert.ok(!verificationItems(r).some((i) => i.id === "power"), "Retired design fields remain excluded at every stage");
  assert.equal(
    verificationItems(r).find((i) => i.id === "utilityPole")!.priority,
    "Low",
  );
  assert.equal(
    exportIntake(r).fieldInventory.find((f) => f.id === "utilityPole")!
      .priority,
    "Low",
  );
});
test("partial structured breaker and transformer ratings stay incomplete", () => {
  assert.equal(
    equipmentValueComplete("breaker", {
      mainBreakerAmps: 400,
      mainBusAmps: null,
    }),
    false,
  );
  assert.equal(
    equipmentValueComplete("breaker", {
      mainBreakerAmps: 400,
      mainBusAmps: 800,
    }),
    true,
  );
  assert.equal(
    equipmentValueComplete("transformerCapacity", {
      transformers: [
        { capacityKva: 1000, primaryVoltageV: 13800, secondaryVoltageV: null },
      ],
    }),
    false,
  );
  assert.equal(
    equipmentValueComplete("availableCapacity", {
      capacityKw: 0,
      basis: "Reviewed load study",
    }),
    true,
  );
});

test("evidence receipt updates only the target field and never verifies or invents a value", async () => {
  const { attachFieldEvidence } = await import("./intake/model");
  let r = createIntakeRecord("evidence", "Synthetic", null);
  r = attachFieldEvidence(r, "singleLine", { [reference.key]: reference });
  const field = r.fields.find((f) => f.id === "singleLine")!;
  assert.deepEqual(field.evidenceKeys, [reference.key]);
  assert.equal(field.request.status, "Received");
  assert.equal(field.review.status, "Unreviewed");
  assert.equal(field.observations.length, 0);
  assert.equal(readiness(r).populated, 0);
  assert.equal(
    r.fields.find((f) => f.id === "voltage")!.evidenceKeys,
    undefined,
  );
  assert.ok(
    verificationItems(r)
      .find((i) => i.id === "singleLine")!
      .reasons.includes("Evidence received — review pending"),
  );
  const out = exportIntake(r);
  assert.deepEqual(
    out.fieldInventory.find((f) => f.id === "singleLine")!.evidenceKeys,
    [reference.key],
  );
});

test("new saved records have no competing legacy field or verification arrays", async () => {
  const { createSiteMetadata } = await import("./site-metadata");
  const { initialEngineeringRecord } = await import("./intake/site-identity");
  const site = createSiteMetadata("Explicit synthetic test address");
  assert.deepEqual(site.dataFields, []);
  assert.deepEqual(site.missingRequirements, []);
  const record = initialEngineeringRecord(site);
  assert.equal(record.fields.length, FIELD_SCHEMA.length);
  assert.equal(
    record.fields.find((f) => f.id === "address")!.observations[0].value,
    site.address,
  );
  assert.equal(
    record.fields.find((f) => f.id === "address")!.review.status,
    "Unreviewed",
  );
});
test("shared file references survive view changes and invalid saved evidence is never overwritten", () => {
  const storage = memory(),
    seed = createIntakeRecord("files", "Synthetic", null),
    store = createEngineeringStore(storage),
    a = store.open(seed.siteKey, () => seed),
    b = store.open(seed.siteKey, () => seed);
  a.files.set(
    reference.key,
    new File(["Explicit synthetic test only"], "qa.txt", {
      type: "text/plain",
    }),
  );
  assert.equal(b.files.get(reference.key)!.name, "qa.txt");
  storage.setItem(INTAKE_STORAGE + seed.siteKey, "invalid stored copy");
  const invalid = createEngineeringStore(storage).open(
    seed.siteKey,
    () => seed,
  );
  assert.equal(invalid.getSnapshot().blocked, true);
  invalid.update((r) =>
    updateRequest(r, "voltage", "Requested", "QA", "Synthetic"),
  );
  assert.equal(
    storage.getItem(INTAKE_STORAGE + seed.siteKey),
    "invalid stored copy",
  );
});
