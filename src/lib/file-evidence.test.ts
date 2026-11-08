import assert from "node:assert/strict";
import test from "node:test";
import {
  createIntakeRecord,
  attachFieldEvidence,
  readiness,
  selectedObservation,
  exportIntake,
} from "./intake/model";
import { requirementCoverage } from "./engineering/coverage";
import { extractCandidates } from "./documents/candidates";
import { reviewDocumentCandidate } from "./documents/review";
import { createEngineeringStore } from "./intake/record-store";
import { prepareFieldFiles, MAX_FILE_BYTES } from "./intake/file-evidence";

test("file collection shares field evidence across views without inventing values or completing missing fields", async () => {
  const storage = new Map<string, string>();
  const backing = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
  };
  const store = createEngineeringStore(backing);
  const initialize = () =>
    createIntakeRecord("qa-place", "QA site", "qa-parcel");
  const key = initialize().siteKey;
  const dashboard = store.open(key, initialize);
  const queue = store.open(key, initialize);
  const before = readiness(dashboard.getSnapshot().record);
  const file = new File(
    ["QA attachment only; no engineering values."],
    "utility-notes.txt",
    { type: "text/plain" },
  );
  const prepared = await prepareFieldFiles(
    dashboard.getSnapshot().record,
    "serviceAmperage",
    [file],
    "Test document context",
  );
  for (const [key, file] of prepared.bytes) dashboard.files.set(key, file);
  dashboard.update((r) =>
    attachFieldEvidence(r, "serviceAmperage", prepared.sources),
  );
  const record = queue.getSnapshot().record;
  const field = record.fields.find((f) => f.id === "serviceAmperage")!;
  assert.equal(field.request.status, "Received");
  assert.equal(field.review.status, "Unreviewed");
  assert.equal(selectedObservation(field), null);
  assert.deepEqual(readiness(record), before);
  assert.equal(field.evidenceKeys?.length, 1);
  const source = record.sources[field.evidenceKeys![0]];
  assert.equal(source.fileName, file.name);
  assert.equal(source.fileHash?.length, 64);
  assert.equal(source.matchingMethod, "Test document context");
  assert.equal(queue.files.get(source.key), file);
  assert.equal(
    record.fields.find((f) => f.id === "voltage")?.evidenceKeys?.length ?? 0,
    0,
  );
  const other = store.open(
    createIntakeRecord("other", "Other site", "other").siteKey,
    () => createIntakeRecord("other", "Other site", "other"),
  );
  assert.equal(Object.keys(other.getSnapshot().record.sources).length, 0);
  assert.equal(other.files.size, 0);
  const restored = createEngineeringStore(backing)
    .open(key, initialize)
    .getSnapshot().record;
  assert.equal(restored.sources[source.key].fileHash, source.fileHash);
  assert.equal(
    restored.fields.find((f) => f.id === field.id)?.request.status,
    "Received",
  );
  const duplicate = await prepareFieldFiles(restored, field.id, [file, file]);
  assert.equal(Object.keys(duplicate.sources).length, 1);
  assert.equal(duplicate.sources[source.key].retrievedAt, source.retrievedAt);
});

test("upload validation rejects unsupported, empty, oversized, excessive files and unknown fields before reading bytes", async () => {
  const record = createIntakeRecord("qa", "QA", null);
  const good = new File(["notes"], "notes.txt");
  await assert.rejects(
    prepareFieldFiles(record, "serviceAmperage", []),
    /at least one/,
  );
  await assert.rejects(
    prepareFieldFiles(record, "unknown", [good]),
    /Choose a field/,
  );
  await assert.rejects(
    prepareFieldFiles(record, "serviceAmperage", [new File(["x"], "run.exe")]),
    /Unsupported/,
  );
  await assert.rejects(
    prepareFieldFiles(record, "serviceAmperage", [new File([], "empty.pdf")]),
    /empty/,
  );
  const oversized = { name: "huge.pdf", size: MAX_FILE_BYTES + 1 } as File;
  await assert.rejects(
    prepareFieldFiles(record, "serviceAmperage", [oversized]),
    /25 MB/,
  );
  await assert.rejects(
    prepareFieldFiles(record, "serviceAmperage", Array(11).fill(good)),
    /10 files/,
  );
});

test("sample plan uploads remain references through attachment, extraction review, reload and export", async () => {
  const initial = createIntakeRecord(
    "reference-site",
    "Synthetic QA address",
    null,
  );
  const file = new File(["Service voltage: 480 V"], "generic-sample.txt");
  const prepared = await prepareFieldFiles(
    initial,
    "voltage",
    [file],
    "Generic design",
    "reference-only",
  );
  const key = Object.keys(prepared.sources)[0];
  const attached = attachFieldEvidence(initial, "voltage", prepared.sources);
  assert.equal(
    attached.fields.find((f) => f.id === "voltage")!.request.status,
    "Missing",
  );
  assert.deepEqual(
    requirementCoverage(attached).map((r) => r.status),
    requirementCoverage(initial).map((r) => r.status),
  );
  const candidate = extractCandidates([
    { page: 1, text: "Service voltage: 480 V" },
  ])[0];
  assert.throws(
    () =>
      reviewDocumentCandidate(attached, key, candidate, "Accepted", "existing"),
    /Reference-only/,
  );
  const retained = reviewDocumentCandidate(
    attached,
    key,
    candidate,
    "Pending",
    "proposed",
  );
  assert.equal(
    retained.fields.find((f) => f.id === "voltage")!.selectedId,
    null,
  );
  const serialized = JSON.parse(JSON.stringify(retained));
  const output = exportIntake(serialized);
  assert.equal(output.sources[key].referenceOnly, true);
  assert.equal(output.sources[key].documentScope, "reference-only");
  assert.equal(output.sources[key].fileHash, prepared.sources[key].fileHash);
  const siteEvidence = await prepareFieldFiles(
    retained,
    "voltage",
    [file],
    "Confirmed independently",
    "site-evidence",
  );
  assert.notEqual(Object.keys(siteEvidence.sources)[0], key);
  assert.equal(retained.sources[key].referenceOnly, true);
  assert.equal(Object.values(siteEvidence.sources)[0].referenceOnly, false);
});

test("adding a reference sample preserves a verified field's selection and review", async () => {
  const record = createIntakeRecord("verified-reference", "Synthetic QA", null);
  const field = record.fields.find((f) => f.id === "voltage")!;
  field.review = {
    status: "Engineer verified",
    reviewer: "QA",
    note: "Existing review",
    at: "2026-11-08T00:00:00Z",
  };
  field.request.status = "Verified";
  const prepared = await prepareFieldFiles(
    record,
    "voltage",
    [new File(["Generic reference"], "sample.txt")],
    "",
    "reference-only",
  );
  const next = attachFieldEvidence(
    record,
    "voltage",
    prepared.sources,
  ).fields.find((f) => f.id === "voltage")!;
  assert.deepEqual(next.review, field.review);
  assert.equal(next.request.status, "Verified");
  assert.equal(next.selectedId, field.selectedId);
});
