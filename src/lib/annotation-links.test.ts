import assert from "node:assert/strict";
import test from "node:test";
import {
  attachCandidateReference,
  createIntakeRecord,
  mergeCollectedFields,
  readiness,
  reviewField,
  selectedObservation,
} from "./intake/model";

const annotation = (key: string) => ({
  key,
  provider: "Site annotation (machine-detected)",
  dataset: "Pad-mounted transformer in aerial image",
  serviceUrl: "",
  featureId: "a1",
  featureName: "Pad-mounted transformer",
  recordDate: null,
  datasetUpdated: null,
  retrievedAt: "2026-11-07T00:00:00.000Z",
});

test("linking an annotation adds a reference without changing request, review, value or readiness", () => {
  const record = createIntakeRecord("annot", "Annotation site", "p1");
  const before = readiness(record);
  const linked = attachCandidateReference(record, "transformerId", annotation("annotation:x:1:a1"));
  const field = linked.fields.find((f) => f.id === "transformerId")!;
  assert.deepEqual(field.evidenceKeys, ["annotation:x:1:a1"]);
  assert.equal(field.request.status, "Missing");
  assert.equal(field.review.status, "Unreviewed");
  assert.equal(selectedObservation(field), null);
  assert.equal(linked.sources["annotation:x:1:a1"].referenceOnly, true);
  assert.deepEqual(readiness(linked), before);
  assert.throws(() => attachCandidateReference(record, "nope", annotation("k")), /Unknown field/);
});

test("linking an annotation never reopens an engineer-verified field", () => {
  let record = createIntakeRecord("annot-v", "Verified site", "p1");
  record = mergeCollectedFields(
    record,
    [
      {
        fieldId: "utility",
        observation: {
          id: "bill",
          value: "Eversource",
          unit: null,
          originalUnits: null,
          sourceKeys: ["bill"],
          method: "Utility bill",
          provider: "Customer document",
          provenance: "Customer document",
          confidence: "Documented",
          observedAt: "2026-11-01",
        },
      },
    ],
    {
      bill: {
        key: "bill",
        provider: "Customer document",
        dataset: "bill.pdf",
        serviceUrl: "",
        featureId: null,
        featureName: null,
        recordDate: null,
        datasetUpdated: null,
        retrievedAt: "2026-11-01",
        fileHash: "h",
      },
    },
  );
  record = reviewField(record, "utility", "QA", "Checked bill");
  const linked = attachCandidateReference(record, "utility", annotation("annotation:x:2:a2"));
  const field = linked.fields.find((f) => f.id === "utility")!;
  assert.equal(field.review.status, "Engineer verified");
  assert.equal(field.selectedId, "bill");
});
