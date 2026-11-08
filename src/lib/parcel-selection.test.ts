import assert from "node:assert/strict";
import test from "node:test";
import { savedMapSite } from "./saved-map-site";
import { resolvedParcelId, savedParcelForPlace } from "./parcel-selection";

const point = {
  latitude: 42.35,
  longitude: -71.07,
  address: "Synthetic test address",
  provider: "U.S. Census address geocoder" as const,
  retrievedAt: "2026-11-08T01:00:00Z",
};

test("saved parcel survives serialization, reopening and a conflicting automatic match", () => {
  const saved = savedMapSite("place-A", point, "chosen-parcel");
  const restored = JSON.parse(JSON.stringify([saved]));
  const parcel = savedParcelForPlace(restored, "place-A");
  assert.equal(parcel, "chosen-parcel");
  assert.equal(
    resolvedParcelId(parcel, "different-auto-match"),
    "chosen-parcel",
  );
  assert.equal(resolvedParcelId(parcel, null), "chosen-parcel");
});

test("restoration is scoped to the exact place, with the latest saved choice in Explorer", () => {
  const older = {
    ...savedMapSite("place-A", point, "old"),
    updatedAt: "2026-11-01",
  };
  const newer = {
    ...savedMapSite("place-A", point, "new"),
    updatedAt: "2026-11-07",
  };
  const other = {
    ...savedMapSite("place-B", point, "other"),
    updatedAt: "2026-11-08",
  };
  assert.equal(savedParcelForPlace([older, other, newer], "place-A"), "new");
  assert.equal(savedParcelForPlace([newer, older, other], "place-A"), "new");
  assert.equal(savedParcelForPlace([older, newer], "place-B"), null);
  assert.equal(savedParcelForPlace([older], undefined), null);
});

test("manual choice takes precedence over stale responses; unsaved sites still use automatic matches", () => {
  assert.equal(resolvedParcelId("manual", "old-response"), "manual");
  assert.equal(resolvedParcelId("manual", undefined), "manual");
  assert.equal(resolvedParcelId(null, "automatic"), "automatic");
  assert.equal(resolvedParcelId(null, null), null);
});
