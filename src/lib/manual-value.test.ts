import test from "node:test";
import assert from "node:assert/strict";
import {
  createIntakeRecord,
  readiness,
  selectedObservation,
} from "./intake/model";
import { verifyManualValue } from "./intake/manual-value";

test("manual verification fills missing fields and retains prior verified history", () => {
  const record = createIntakeRecord("manual-demo", "Fictional property", null);
  const input = {
    siteKey: record.siteKey,
    fieldId: "facilityName",
    value: "Demo manufacturing",
    unit: "",
    reviewer: "Demo reviewer",
    note: "Confirmed with customer",
    expectedObservationId: null,
  };
  const verified = verifyManualValue(record, input);
  const field = verified.fields.find((f) => f.id === "facilityName")!;
  assert.equal(selectedObservation(field)?.value, input.value);
  assert.equal(field.request.status, "Verified");
  assert.equal(field.review.status, "Engineer verified");
  assert.equal(field.review.reviewer, input.reviewer);
  assert.ok(field.review.at);
  const source = verified.sources[selectedObservation(field)!.sourceKeys[0]];
  assert.match(source.matchingMethod!, /User attestation/);
  assert.equal(source.provider, "User supplied");
  assert.equal(
    readiness(verified, "property").missing,
    readiness(record, "property").missing - 1,
  );
  const changed = verifyManualValue(verified, {
    ...input,
    value: "Corrected facility",
    expectedObservationId: field.selectedId,
  });
  const next = changed.fields.find((f) => f.id === field.id)!;
  assert.equal(selectedObservation(next)?.value, "Corrected facility");
  assert.ok(next.observations.some((o) => o.value === input.value));
  assert.ok(
    next.reviewHistory?.some(
      (h) =>
        h.observationId === field.selectedId &&
        h.review.reviewer === input.reviewer,
    ),
  );
  assert.equal(next.request.status, "Verified");
  assert.throws(
    () => verifyManualValue(changed, { ...input, value: "stale edit" }),
    /changed while/,
  );
  assert.throws(
    () => verifyManualValue(record, { ...input, siteKey: "different site" }),
    /site changed/,
  );
  assert.throws(
    () => verifyManualValue(record, { ...input, value: "Missing" }),
    /cannot be verified/,
  );
  assert.throws(
    () => verifyManualValue(record, { ...input, reviewer: "" }),
    /your name/,
  );
});

test("incomplete equipment cannot be verified and other fields stay isolated", () => {
  const record = createIntakeRecord(
    "manual-equipment",
    "Fictional property",
    null,
  );
  const input = {
    siteKey: record.siteKey,
    fieldId: "breaker",
    value: { mainBreakerAmps: 400 },
    unit: "A",
    reviewer: "Demo reviewer",
    note: "Nameplate review",
    expectedObservationId: null,
  };
  assert.throws(
    () => verifyManualValue(record, input),
    /Complete the required/,
  );
  const next = verifyManualValue(record, {
    ...input,
    value: { mainBreakerAmps: 400, mainBusAmps: 600 },
  });
  assert.equal(
    next.fields.find((f) => f.id === "breaker")?.request.status,
    "Verified",
  );
  assert.equal(next.fields.find((f) => f.id === "voltage")?.selectedId, null);
  assert.equal(record.fields.find((f) => f.id === "breaker")?.selectedId, null);
});
