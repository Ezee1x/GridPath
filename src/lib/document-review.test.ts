import test from "node:test";
import assert from "node:assert/strict";
import { extractCandidates } from "./documents/candidates";
import { reviewDocumentCandidate } from "./documents/review";
import { createIntakeRecord, reviewField, hasConflict } from "./intake/model";
function setup() {
  const r = createIntakeRecord("doc", "Synthetic address", null),
    key = `input:${r.siteKey}:test`;
  r.sources[key] = {
    key,
    provider: "Test",
    dataset: "Test",
    serviceUrl: "",
    fileHash: "hash",
    featureId: null,
    featureName: null,
    recordDate: null,
    datasetUpdated: null,
    retrievedAt: new Date().toISOString(),
  };
  return { r, key };
}
test("extraction supports partial transformer/breaker/meter fields without inventing equipment relationships", () => {
  const c = extractCandidates([
    {
      page: 2,
      text: "Transformer capacity: 500 kVA; Transformer primary voltage: 13800 V; Main breaker rating: 800 A; Meter model: X200; Pole ID: P-22; Electrical room location: basement.",
    },
  ]);
  assert.ok(c.some((c) => c.fieldId === "transformerCapacity"));
  assert.deepEqual(c.find((c) => c.fieldId === "transformerCapacity")!.value, {
    transformers: [{ capacityKva: 500 }],
  });
  assert.ok(c.some((c) => c.fieldId === "breaker"));
  assert.ok(c.some((c) => c.fieldId === "meterModel"));
  assert.ok(c.every((c) => c.page === 2 && c.quote));
});
test("proposed samples remain references; acceptance updates one correct field and never verifies automatically", () => {
  const { r, key } = setup(),
    c = extractCandidates([{ page: 1, text: "Service voltage: 480 V" }])[0];
  assert.throws(() =>
    reviewDocumentCandidate(r, key, c, "Accepted", "proposed"),
  );
  const proposed = reviewDocumentCandidate(r, key, c, "Pending", "proposed");
  assert.equal(
    proposed.fields.find((f) => f.id === "voltage")!.selectedId,
    null,
  );
  const accepted = reviewDocumentCandidate(
      proposed,
      key,
      c,
      "Accepted",
      "existing",
    ),
    field = accepted.fields.find((f) => f.id === "voltage")!;
  assert.equal(field.request.status, "Under review");
  assert.equal(field.review.status, "Under review");
  assert.equal(hasConflict(field), false);
  const verified = reviewField(
    accepted,
    "voltage",
    "QA",
    "Compared with original",
  );
  const other = { ...c, value: 240 };
  assert.equal(
    reviewDocumentCandidate(
      verified,
      key,
      other,
      "Accepted",
      "existing",
    ).fields.find((f) => f.id === "voltage")!.selectedId,
    field.selectedId,
  );
  assert.throws(() =>
    reviewDocumentCandidate(r, "other-site", c, "Accepted", "existing"),
  );
});
test("edits retain original extraction and rejection clears selection while preserving evidence", () => {
  const { r, key } = setup(),
    c = extractCandidates([{ page: 1, text: "Service voltage: 480 V" }])[0];
  const edited = reviewDocumentCandidate(r, key, c, "Edited", "existing", 240),
    f = edited.fields.find((f) => f.id === "voltage")!;
  assert.equal(f.observations.length, 2);
  assert.ok(Object.keys(f.rejectedObservations ?? {}).length);
  assert.equal(f.observations.find((o) => o.id === f.selectedId)!.value, 240);
  const accepted = reviewDocumentCandidate(r, key, c, "Accepted", "existing"),
    rejected = reviewDocumentCandidate(
      accepted,
      key,
      c,
      "Rejected",
      "existing",
    );
  assert.equal(
    rejected.fields.find((f) => f.id === "voltage")!.selectedId,
    null,
  );
});
test("typed extraction rejects unsupported edited schemas rather than filling ratings with arbitrary text", () => {
  const { r, key } = setup(),
    c = extractCandidates([{ page: 1, text: "Service voltage: 480 V" }])[0];
  assert.throws(
    () =>
      reviewDocumentCandidate(r, key, c, "Edited", "existing", {
        unrelated: "rating",
      }),
    /Invalid candidate/,
  );
});
