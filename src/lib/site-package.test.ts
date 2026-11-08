import test from "node:test";
import assert from "node:assert/strict";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { makeSitePackage, readSitePackage } from "./intake/site-package";
import {
  createIntakeRecord,
  mergeCollectedFields,
  reviewField,
} from "./intake/model";
import type { SiteRecord } from "./types";
test("handoff carries hash-checked evidence and downgrades imported verification, rejects tampering and wrong-site files", async () => {
  const site: SiteRecord = {
    id: "package-test",
    mapPlaceId: "test-place",
    parcelFeatureId: "123",
    facilityName: "Synthetic only",
    address: "Synthetic address",
    location: { municipality: null, coordinates: null, parcelGeometry: null },
    lifecycleStatus: "Preliminary",
    dataFields: [],
    sourceDocuments: [],
    missingRequirements: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sample: false,
  };
  let record = createIntakeRecord(
    site.mapPlaceId!,
    site.address,
    site.parcelFeatureId!,
  );
  const key = `input:${record.siteKey}:evidence`;
  const file = new File(["Synthetic service voltage: 480 V"], "evidence.txt", {
    type: "text/plain",
  });
  const source = {
    key,
    dataset: "Synthetic document",
    provider: "Customer document",
    serviceUrl: "",
    featureId: null,
    featureName: null,
    recordDate: null,
    datasetUpdated: null,
    retrievedAt: new Date().toISOString(),
    fileName: file.name,
    documentId: "test",
  };
  record = mergeCollectedFields(
    record,
    [
      {
        fieldId: "voltage",
        observation: {
          id: "voltage-candidate",
          value: 480,
          unit: "V",
          originalUnits: "V",
          provider: "Customer document",
          sourceKeys: [key],
          method: "Synthetic source",
          confidence: "Documented",
          observedAt: new Date().toISOString(),
          provenance: "Customer document",
        },
      },
    ],
    { [key]: source },
  );
  record = reviewField(
    record,
    "voltage",
    "Test Reviewer",
    "Explicit synthetic comparison",
  );
  const made = await makeSitePackage(
    site,
    record,
    new Map([[key, file]]),
    async () => undefined,
  );
  const restored = await readSitePackage(made.blob);
  assert.equal(await restored.assets[0].file.text(), await file.text());
  assert.equal(
    restored.manifest.record.fields.find((f) => f.id === "voltage")!.review
      .status,
    "Under review",
  );
  const entries = unzipSync(new Uint8Array(await made.blob.arrayBuffer()));
  const manifest = JSON.parse(strFromU8(entries["manifest.json"]));
  entries[manifest.assets[0].path] = strToU8("tampered");
  await assert.rejects(() => readSitePackage(new Blob([zipSync(entries)])));
  manifest.site.parcelFeatureId = "999";
  entries["manifest.json"] = strToU8(JSON.stringify(manifest));
  await assert.rejects(
    () => readSitePackage(new Blob([zipSync(entries)])),
    /identities disagree/,
  );
  const missing = await makeSitePackage(
    site,
    record,
    new Map(),
    async () => undefined,
  );
  assert.equal(missing.manifest.missing.length, 1);
});
