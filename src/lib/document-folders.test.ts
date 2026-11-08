import test from "node:test";
import assert from "node:assert/strict";
import { documentFolder, folderSources } from "./documents/folders";
import type { EvidenceReference } from "./intake/types";
const source = (
  key: string,
  patch: Partial<EvidenceReference> = {},
): EvidenceReference => ({
  key,
  provider: "Test",
  dataset: key,
  serviceUrl: "",
  featureId: null,
  featureName: null,
  recordDate: null,
  datasetUpdated: null,
  retrievedAt: "2026-11-08T12:00:00Z",
  ...patch,
});
test("documents group real attachments into three folders, exclude manual attestations and show latest map views", () => {
  const csv = source("csv", { fileName: "customer.csv" });
  const photo = source("photo", { fileName: "transformer.jpg" });
  const nameplate = source("drawing", {
    fileName: "nameplate.png",
    documentFolder: "additional-files",
  });
  const old = source("old", {
    fileName: "GIS.png",
    documentFolder: "map-images",
    mapImageKind: "gis",
  });
  const current = source("new", {
    fileName: "GIS.png",
    documentFolder: "map-images",
    mapImageKind: "gis",
    retrievedAt: "2026-11-08T13:00:00Z",
  });
  const annotation = source("annotation", {
    fileName: "Annotated.png",
    documentFolder: "map-images",
    mapImageKind: "annotated",
  });
  const manual = source("manual", { documentId: "manual:attestation" });
  const sources = Object.fromEntries(
    [csv, photo, nameplate, old, current, annotation, manual].map((s) => [
      s.key,
      s,
    ]),
  );
  assert.equal(documentFolder(csv), "additional-files");
  assert.equal(documentFolder(photo), "site-photos");
  assert.equal(documentFolder(nameplate), "additional-files");
  assert.deepEqual(
    folderSources(sources, "map-images").map((s) => s.key),
    ["new", "annotation"],
  );
  assert.deepEqual(
    folderSources(sources, "additional-files").map((s) => s.key),
    ["csv", "drawing"],
  );
  assert.deepEqual(
    folderSources(sources, "site-photos").map((s) => s.key),
    ["photo"],
  );
  assert.equal(Object.keys(sources).length, 7);
});

test("the same file linked to multiple fields appears once without losing source references", () => {
  const first = source("first", {
    fileName: "customer.csv",
    fileHash: "same-bytes",
  });
  const second = source("second", {
    fileName: "customer.csv",
    fileHash: "same-bytes",
  });
  const refs = { first, second };
  assert.equal(folderSources(refs, "additional-files").length, 1);
  assert.equal(Object.keys(refs).length, 2);
});

test("older saved map images appear in the map folder rather than site photos",()=>{
  const old=source("legacy-map",{provider:"Saved site map",fileName:"QoreSites_GIS_Layer.png"});
  assert.equal(documentFolder(old),"map-images");
  assert.equal(folderSources({old},"map-images")[0].mapImageKind,"gis");
  assert.equal(old.mapImageKind,undefined);
});
