import test from "node:test";
import assert from "node:assert/strict";
import { roadNames, roadClassGroups } from "./intake/road-display";

test("road summaries deduplicate segments, use the correct source domain and preserve source records", () => {
  const original = [
    { featureId: "1", road: "SOUTHGATE STREET", sourceClassificationCode: "5" },
    { featureId: "2", road: "Southgate Street", sourceClassificationCode: "5" },
    { featureId: "3", road: "DOUGLAS STREET", sourceClassificationCode: "3" },
    { featureId: "4", road: "OTHER ROAD", sourceClassificationCode: "99" },
  ];
  const before = JSON.stringify(original);
  const result = roadClassGroups(original)!;
  assert.deepEqual(result.find(group => group.code === "5"), {
    code: "5", label: "Local road", names: ["Southgate Street"],
  });
  assert.equal(result.find(group => group.code === "3")?.label, "Collector road");
  assert.match(result.find(group => group.code === "99")!.label, /Unrecognized/);
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual(roadNames([" SOUTHGATE STREET ", "Southgate Street", "BURNS COURT"]), ["Burns Court", "Southgate Street"]);
  assert.equal(roadNames("User-entered custom road list"), null);
  assert.equal(roadClassGroups("User-entered classification"), null);
});
