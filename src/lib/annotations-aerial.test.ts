import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AERIAL_SIZE,
  MASSGIS_IMAGERY,
  USGS_IMAGERY,
  fromImagePixel,
  parseAerialView,
  providerFor,
  toImagePixel,
} from "./annotations/aerial";

test("the view center projects to the image center and back", () => {
  const view = { lat: 42.21007, lng: -71.41342, zoom: 19 };
  const c = toImagePixel(view, view.lat, view.lng);
  assert.ok(Math.abs(c.x - AERIAL_SIZE.width / 2) < 1e-6);
  assert.ok(Math.abs(c.y - AERIAL_SIZE.height / 2) < 1e-6);
  const corner = fromImagePixel(view, 0, 0);
  const back = toImagePixel(view, corner.lat, corner.lng);
  assert.ok(Math.abs(back.x) < 1e-6 && Math.abs(back.y) < 1e-6);
  assert.ok(corner.lat > view.lat && corner.lng < view.lng);
});

test("Massachusetts uses MassGIS imagery and elsewhere uses USGS", () => {
  assert.equal(providerFor(42.21, -71.41), MASSGIS_IMAGERY);
  assert.equal(providerFor(37.67, -122.08), USGS_IMAGERY);
});

test("aerial views are validated and zoom is clamped", () => {
  assert.equal(parseAerialView({ lat: "abc", lng: 1, zoom: 19 }), null);
  assert.equal(parseAerialView({ lat: 91, lng: 1, zoom: 19 }), null);
  assert.deepEqual(parseAerialView({ lat: "42.2", lng: "-71.4", zoom: "25" }), { lat: 42.2, lng: -71.4, zoom: 20 });
  assert.equal(parseAerialView({ lat: 37.6, lng: -122, zoom: 3 })!.zoom, 16);
});
