import { test } from "node:test";
import assert from "node:assert/strict";
import {
  referenceProjects,
  mergeReferenceProjects,
} from "./reference-projects";
import { findProjects } from "./project-search";
import { centuryTywoodSite, createSite } from "./fixtures";

test("project suggestions match names and locations without case sensitivity", () => {
  assert.equal(
    findProjects(referenceProjects, "thermo")[0]?.id,
    "thermofusion",
  );
  assert.equal(
    findProjects(referenceProjects, "HAYWARD california")[0]?.id,
    "thermofusion",
  );
  assert.equal(
    findProjects(referenceProjects, "new hampshire")[0]?.id,
    "aalberts-surface-technologies",
  );
  assert.equal(
    findProjects(referenceProjects, "lowland")[0]?.id,
    "century-tywood",
  );
  assert.equal(findProjects(referenceProjects, "").length, 3);
  assert.equal(findProjects(referenceProjects, "no such facility").length, 0);
});
test("new references are merged once without overwriting saved evidence or custom records", () => {
  const saved = structuredClone(centuryTywoodSite);
  saved.missingRequirements[0].assignedTo = "Facility manager";
  saved.dataFields[0].notes = "Saved review note";
  const custom = createSite("Custom property");
  const records = mergeReferenceProjects([saved, custom]);
  assert.equal(records.length, 4);
  assert.equal(records[0].dataFields[0].notes, "Saved review note");
  assert.equal(
    records[0].missingRequirements[0].assignedTo,
    "Facility manager",
  );
  assert.equal(records[1], custom);
  assert.equal(mergeReferenceProjects(records), records);
  assert.equal(
    saved.dataFields.some((field) => field.id === "reportedProjectStatus"),
    false,
  );
});
test("new project seeds leave full addresses, ratings and geographic coordinates unknown", () => {
  for (const site of referenceProjects.slice(1)) {
    assert.equal(
      site.dataFields.find((field) => field.id === "address")?.value,
      null,
    );
    assert.equal(
      site.dataFields.find((field) => field.id === "voltage")?.value,
      null,
    );
    assert.equal(site.location.coordinates, null);
    const field = site.dataFields.find(
      (field) => field.id === "reportedProjectStatus",
    )!;
    assert.equal(field.status, "Needs review");
    assert.equal(field.reviewedBy, null);
    assert.ok(
      site.sourceDocuments.some(
        (source) =>
          field.sourceIds.includes(source.id) && source.retrievedAt === null,
      ),
    );
    assert.ok(
      !site.missingRequirements
        .find((requirement) => requirement.fieldId === "poles")
        ?.explanation.includes("54/6A"),
    );
  }
});
