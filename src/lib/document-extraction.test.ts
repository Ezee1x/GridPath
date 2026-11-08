import test from "node:test";
import assert from "node:assert/strict";
import { extractCandidates } from "./documents/candidates";
test("explicit ratings retain page and excerpt, ambiguous unlabelled numbers produce no candidates", () => {
  const c = extractCandidates([
    {
      page: 3,
      text: "Existing nameplate. Service voltage: 480/277 V. Service amperage: 800 A. Panel rating: 400 A. Phase: 3.",
    },
  ]);
  assert.equal(c.length, 4);
  assert.equal(c.find((x) => x.fieldId === "voltage")!.value, "480/277");
  assert.ok(
    c.every((x) => x.page === 3 && x.quote && x.confidence === "Estimated"),
  );
  assert.deepEqual(
    extractCandidates([
      { page: 1, text: "480 800 amps, consumption 400 kWh, proposed capacity" },
    ]),
    [],
  );
  assert.deepEqual(
    extractCandidates([{ page: 1, text: "Service voltage: 0 V" }]),
    [],
  );
});
test("unsupported voltage scales and unlabeled units are not silently converted into volts", () => {
  assert.deepEqual(
    extractCandidates([
      { page: 1, text: "Service voltage: 13.8 kV; Service amperage: 800;" },
    ]),
    [],
  );
});
