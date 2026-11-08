import assert from "node:assert/strict";
import test from "node:test";
import { annotationLayerContext } from "./annotations/layer-context";
import type { PublicQueryLocation } from "./gis/public-address";
import { cameraOnAerial } from "./annotations/camera-position";
import { fromImagePixel } from "./annotations/aerial";

test("live Street View positions align with aerial image pixels, normalize headings and never pin an off-image camera to a false location", () => {
  const size = { width: 1024, height: 768 };
  for (const view of [
    { lat: 42.35, lng: -71.07, zoom: 19 },
    { lat: 42.25, lng: -71.8, zoom: 18 },
  ]) {
    const point = fromImagePixel(view, 213, 517, size);
    const camera = cameraOnAerial(view, { ...point, heading: -90 }, size)!;
    assert.ok(Math.abs(camera.x - 213) < 0.001);
    assert.ok(Math.abs(camera.y - 517) < 0.001);
    assert.equal(camera.heading, 270);
    const outside = fromImagePixel(view, -100, 300, size);
    assert.equal(cameraOnAerial(view, { ...outside, heading: 0 }, size), null);
    assert.equal(cameraOnAerial(view, { ...point, heading: NaN }, size), null);
  }
});

test("annotation layer reuses independent public points for different municipalities without carrying another site's context", () => {
  // Location fixtures verify isolation, not actual property measurements.
  let previous = null;
  for (const [address, latitude, longitude, parcel] of [
    ["Holliston QA", 42.2, -71.4, "h"],
    ["Worcester QA", 42.25, -71.8, "w"],
    ["Boston QA", 42.35, -71.07, "b"],
  ] as const) {
    const point: PublicQueryLocation = {
      address,
      latitude,
      longitude,
      provider: "U.S. Census address geocoder",
      retrievedAt: "2026-11-08T10:00:00Z",
    };
    const context = annotationLayerContext(
      address,
      point,
      parcel,
      null,
      previous,
    );
    assert.equal(context.address, address);
    assert.equal(context.selectedParcelId, parcel);
    assert.equal(context.location!.lat, latitude);
    assert.equal(context.location!.lng, longitude);
    assert.equal(context.parcel, null);
    assert.equal(
      annotationLayerContext(address, point, parcel, null, context),
      context,
    );
    previous = context;
  }
  const point: PublicQueryLocation = {
    address: "Boston QA",
    latitude: 42.35,
    longitude: -71.07,
    provider: "U.S. Census address geocoder",
    retrievedAt: "2026-11-08T10:00:00Z",
  };
  assert.notEqual(
    annotationLayerContext(
      point.address,
      point,
      "new-manual-parcel",
      null,
      previous,
    ),
    previous,
  );
});
