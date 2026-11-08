import assert from "node:assert/strict";
import test from "node:test";
import { createSite } from "./fixtures";
import { savedMapSite } from "./saved-map-site";
import { savedSiteReadiness } from "./saved-site-readiness";
import {
  createIntakeRecord,
  INTAKE_STORAGE,
  siteRecordKey,
} from "./intake/model";
const point = {
  latitude: 42.35,
  longitude: -71.07,
  address: "200 CLARENDON ST, BOSTON, MA, 02116",
  provider: "U.S. Census address geocoder" as const,
  retrievedAt: "2026-11-08T01:00:00Z",
};
test("saving a searched address persists independent public content and exempt Place ID", () => {
  const s = savedMapSite("test-place-id", point, "2380675");
  assert.equal(s.mapPlaceId, "test-place-id");
  assert.equal(s.parcelFeatureId, "2380675");
  assert.equal(s.address, point.address);
  assert.equal(s.sample, false);
  assert.deepEqual(s.location.coordinates, [point.longitude, point.latitude]);
  assert.equal(s.sourceDocuments[0].sourceAuthority, point.provider);
  assert.ok(s.dataFields.every((f) => f.reviewedAt === null));
  const restored = JSON.parse(JSON.stringify(s));
  assert.equal(restored.mapPlaceId, "test-place-id");
});
test("saving again preserves identity, custom name, uploaded evidence and review edits", () => {
  const s = savedMapSite("test-place-id", point, "2380675");
  s.dataFields = createSite("Synthetic legacy site").dataFields;
  s.facilityName = "Customer facility";
  s.dataFields[0].notes = "Reviewed source note";
  const updated = savedMapSite("test-place-id", point, "2380675", s);
  assert.equal(updated.id, s.id);
  assert.equal(updated.facilityName, "Customer facility");
  assert.deepEqual(updated.dataFields, s.dataFields);
  assert.deepEqual(updated.sourceDocuments, s.sourceDocuments);
});
test("saved-map table counts use the keyed 59-required-field engineering record and never another site", () => {
  const s = savedMapSite("place-A", point, "2380675");
  const r = createIntakeRecord("place-A", point.address, "2380675");
  const store = {
    getItem: (key: string) =>
      key === INTAKE_STORAGE + siteRecordKey("place-A", "2380675")
        ? JSON.stringify(r)
        : null,
  };
  assert.equal(savedSiteReadiness(s, store).total, 59);
  assert.equal(savedSiteReadiness(s, store).missing, 59);
  assert.equal(
    savedSiteReadiness({ ...s, mapPlaceId: "place-B" }, store).populated,
    0,
  );
});
