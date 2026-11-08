import { test } from "node:test";
import assert from "node:assert/strict";
import { centuryTywoodSite, createSite } from "./fixtures";
import { readiness, exportRecord } from "./calculations";
test("new intake contains only manually supplied address, no inferred data", () => {
  const site = createSite("123 Example Avenue");
  assert.equal(site.dataFields.filter((f) => f.value !== null).length, 1);
  assert.equal(site.location.coordinates, null);
  assert.equal(site.dataFields.find((f) => f.id === "utility")?.value, null);
  assert.equal(readiness(site).supported, 0);
  assert.equal(readiness(site).populated, 1);
});
test("proposed design cannot inflate existing-site completeness", () => {
  const original = readiness(centuryTywoodSite);
  const site = structuredClone(centuryTywoodSite);
  site.dataFields = site.dataFields.filter(
    (f) => f.conditionType !== "proposed",
  );
  assert.deepEqual(readiness(site), original);
  assert.equal(original.conflicts, 1);
  assert.ok(original.critical > 0);
});
test("receiving evidence does not verify fields or clear outstanding requirements", () => {
  const site = createSite("Example address");
  site.missingRequirements = site.missingRequirements.map((r) => ({
    ...r,
    status: "Received",
  }));
  assert.equal(readiness(site).outstanding, site.missingRequirements.length);
  assert.equal(
    site.dataFields.filter((f) => f.status === "Engineer verified").length,
    0,
  );
});
test("JSON exports current edits and traceable existing/proposed values", () => {
  const site = structuredClone(centuryTywoodSite);
  site.missingRequirements[0].assignedTo = "Facility manager";
  const result = JSON.parse(exportRecord(site));
  assert.equal(result.missingRequirements[0].assignedTo, "Facility manager");
  assert.ok(result.exportedAt);
  assert.equal(result.application, "QoreSites");
  assert.ok(result.sourceDocuments.length);
  assert.equal(
    result.dataFields.find((f: { id: string }) => f.id === "isolation")
      .conditionType,
    "proposed",
  );
  assert.equal(
    result.dataFields.find((f: { id: string }) => f.id === "transformer").value,
    null,
  );
});
