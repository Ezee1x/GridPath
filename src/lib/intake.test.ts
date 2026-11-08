import assert from "node:assert/strict";
import test from "node:test";
import { FIELD_SCHEMA, CATEGORIES } from "./intake/schema";
import {
  createIntakeRecord,
  exportIntake,
  hasConflict,
  INTAKE_STORAGE,
  loadIntake,
  mergeCollectedFields,
  observationId,
  readiness,
  reviewField,
  selectedObservation,
  siteRecordKey,
  updateRequest,
} from "./intake/model";
import type { FieldObservation, EvidenceReference } from "./intake/types";
const source: EvidenceReference = {
  key: "test:source",
  dataset: "Synthetic test source",
  provider: "Unit test",
  serviceUrl: "https://example.test/evidence",
  featureId: "test-feature",
  featureName: "Synthetic only",
  recordDate: "2020",
  datasetUpdated: null,
  retrievedAt: "2026-01-01",
};
const observation = (id: string, value: number): FieldObservation => ({
  id: observationId(
    id,
    value,
    "Unit test",
    [source.key],
    "Explicit synthetic test observation",
    "V",
  ),
  value,
  unit: "V",
  originalUnits: "V",
  provider: "Unit test",
  provenance: "User supplied",
  sourceKeys: [source.key],
  method: "Explicit synthetic test observation",
  confidence: "Documented",
  observedAt: "2026-01-01",
});
test("standardized schema has exactly 69 fields in seven expected categories and excludes proposed conditions from readiness", () => {
  assert.equal(FIELD_SCHEMA.length, 69);
  assert.equal(new Set(FIELD_SCHEMA.map((d) => d.id)).size, 69);
  assert.deepEqual(
    CATEGORIES.map(
      (c) => FIELD_SCHEMA.filter((d) => d.category === c.id).length,
    ),
    [9, 9, 8, 8, 20, 7, 8],
  );
  const r = createIntakeRecord("test", "Synthetic address", "1");
  assert.equal(readiness(r).required, 52);
  assert.equal(readiness(r).missing, 52);
  assert.equal(exportIntake(r).fieldInventory.length, 52);
  assert.equal(exportIntake(r).missingFields.length, 52);
  const updated = mergeCollectedFields(
    r,
    [{ fieldId: "power", observation: observation("power", 100) }],
    { [source.key]: source },
  );
  assert.equal(readiness(updated).populated, 0);
  assert.equal(readiness(updated, "design").populated, 0);
  assert.equal(
    readiness({ ...updated, stage: "design" }, "design").populated,
    0,
  );
});
test("received is distinct from verified and empty fields cannot be verified", () => {
  let r = createIntakeRecord("test", "Synthetic", "1");
  r = updateRequest(
    r,
    "voltage",
    "Received",
    "Engineer",
    "Document received; value not extracted",
  );
  assert.equal(readiness(r).populated, 0);
  assert.equal(
    r.fields.find((f) => f.id === "voltage")!.review.status,
    "Unreviewed",
  );
  assert.throws(
    () => updateRequest(r, "voltage", "Verified", "Engineer", ""),
    /Verify a populated field/,
  );
  assert.throws(() => reviewField(r, "voltage", "Engineer", "review"), /value/);
  r = mergeCollectedFields(
    r,
    [{ fieldId: "voltage", observation: observation("voltage", 480) }],
    { [source.key]: source },
  );
  assert.equal(readiness(r).awaitingVerification, 1);
  r = reviewField(
    r,
    "voltage",
    "Test reviewer",
    "Source compared with explicit test value",
  );
  assert.equal(readiness(r).awaitingVerification, 0);
  assert.equal(readiness(r).evidence, 1);
});
test("new collection preserves a verified value and retains conflicting source observations without duplicate refresh records", () => {
  let r = createIntakeRecord("test", "Synthetic", "1");
  r = mergeCollectedFields(
    r,
    [{ fieldId: "voltage", observation: observation("voltage", 480) }],
    { [source.key]: source },
  );
  r = reviewField(r, "voltage", "Engineer", "Test review");
  const incoming = [
    { fieldId: "voltage", observation: observation("voltage", 208) },
  ];
  r = mergeCollectedFields(r, incoming, { [source.key]: source });
  r = mergeCollectedFields(r, incoming, { [source.key]: source });
  const field = r.fields.find((f) => f.id === "voltage")!;
  assert.equal(selectedObservation(field)!.value, 480);
  assert.equal(field.review.status, "Engineer verified");
  assert.equal(field.observations.length, 2);
  assert.equal(hasConflict(field), true);
  assert.equal(readiness(r).awaitingVerification, 1);
});
test("site and parcel persistence keys are isolated and reject mismatched identities", () => {
  const a = createIntakeRecord("place-a", "Synthetic A", "1"),
    b = createIntakeRecord("place-b", "Synthetic B", "1"),
    c = createIntakeRecord("place-a", "Synthetic C", "2");
  const map = new Map<string, string>();
  for (const r of [a, b, c])
    map.set(INTAKE_STORAGE + r.siteKey, JSON.stringify(r));
  const storage = { getItem: (key: string) => map.get(key) ?? null };
  assert.equal(loadIntake(storage, a.siteKey)!.identity.address, "Synthetic A");
  assert.equal(loadIntake(storage, b.siteKey)!.identity.address, "Synthetic B");
  assert.notEqual(a.siteKey, c.siteKey);
  map.set(
    INTAKE_STORAGE + a.siteKey,
    JSON.stringify({ ...b, siteKey: a.siteKey }),
  );
  assert.throws(() => loadIntake(storage, a.siteKey), /invalid/);
  assert.equal(siteRecordKey("place-a", "1"), a.siteKey);
});
test("partial compound field remains incomplete and export uses actual state rather than placeholder values", () => {
  let r = createIntakeRecord("test", "Synthetic", "1");
  r = mergeCollectedFields(
    r,
    [
      {
        fieldId: "municipalityAhj",
        observation: {
          ...observation("municipalityAhj", 1),
          value: {
            municipality: "Test town",
            authorityHavingJurisdiction: null,
          },
          complete: false,
        },
      },
    ],
    { [source.key]: source },
  );
  assert.equal(readiness(r).populated, 0);
  assert.equal(readiness(r).missing, 52);
  const out = exportIntake(r);
  assert.equal(
    out.fieldInventory.find((f) => f.id === "zoning")!.currentObservation,
    null,
  );
  assert.ok(out.missingFields.includes("municipalityAhj"));
  assert.equal(JSON.parse(JSON.stringify(out)).schemaVersion, "2.0");
});

test("missing placeholder strings never become populated measurements", () => {
  const record = createIntakeRecord("qa", "Synthetic", null);
  for (const value of [
    "Unknown",
    "Not retrieved",
    "Not available",
    "Missing",
    "N/A",
    "  ",
  ]) {
    const result = mergeCollectedFields(
      record,
      [
        {
          fieldId: "utility",
          observation: { ...observation("utility", 1), value },
        },
      ],
      {},
    );
    assert.equal(readiness(result).populated, 0);
    assert.equal(
      exportIntake(result).fieldInventory.find((f) => f.id === "utility")!
        .currentObservation,
      null,
    );
  }
});
