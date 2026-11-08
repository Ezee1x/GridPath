import test from "node:test";
import assert from "node:assert/strict";
import { createIntakeRecord, exportIntake } from "./intake/model";
import { printableSummary } from "./engineering/printable";
test("engineering export contains linked requirements/references, null missing data and no fabricated savings; printable HTML escapes site input", () => {
  const r = createIntakeRecord("export", "<img src=x onerror=alert(1)>", null);
  const output = exportIntake(r);
  assert.ok(output.requirements.length);
  assert.ok(
    output.engineeringReferences.every((ref) => ref.url.startsWith("https://")),
  );
  assert.equal(output.benchmark.timeSavingsClaim, null);
  assert.equal(output.benchmark.elapsedIncludingReviewSeconds, null);
  assert.ok(
    output.fieldInventory.every(
      (f) =>
        f.siteKey === r.siteKey && Array.isArray(f.applicableRequirementIds),
    ),
  );
  assert.ok(!printableSummary(r).includes("<img src=x"));
  assert.ok(printableSummary(r).includes("&lt;img"));
  JSON.parse(JSON.stringify(output));
});
