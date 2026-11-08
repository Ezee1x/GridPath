import assert from "node:assert/strict";
import test from "node:test";
import proj4 from "proj4";
import { analyzeSite } from "./gis/analysis";
import {
  localProjection,
  projectedArea,
  segmentDistance,
  polygonRoadDistance,
  minimumLineDistance,
  clippedCoverage,
  remainingPolygon,
} from "./gis/projected";
import type { GisFeature, GisLayerResult, LayerKind } from "./gis/types";
import type { AnalysisInput } from "./gis/analysis";
import type { Geometry, Polygon } from "geojson";
const xy = (x: number, y: number) => [x, y] as [number, number];
const rect = (x: number, y: number, w: number, h: number) => [
  xy(x, y),
  xy(x + w, y),
  xy(x + w, y + h),
  xy(x, y + h),
  xy(x, y),
];
const origin = { latitude: 42.2, longitude: -71.4 };
const projection = localProjection(origin.latitude, origin.longitude);
const toWgs = (ring: [number, number][]) =>
  ring.map((point) => proj4(projection.definition, "EPSG:4326", point));
const polygon = (x: number, y: number, w: number, h: number): Polygon => ({
  type: "Polygon",
  coordinates: [toWgs(rect(x, y, w, h))],
});
function feature(
  kind: LayerKind,
  id: string,
  geometry: Geometry,
  association = "",
  fields: Record<string, unknown> = {},
): GisFeature {
  return {
    type: "Feature",
    geometry,
    properties: {
      id,
      kind,
      name: `synthetic-${id}`,
      attributes: fields,
      source: {
        attribution: "Synthetic test fixture only",
        name: `Synthetic ${kind} test fixture`,
        url: `https://example.test/${kind}`,
        geometryType: "test",
        nativeWkid: 4326,
        datasetUpdated: "2020-01-01",
        retrievedAt: "2026-01-01",
      },
      sourceDate: "2019",
      verification: "Public GIS record — needs verification",
      measurement: null,
      association,
      containsPoint: true,
      addressMatch: true,
    },
  };
}
function layer(kind: LayerKind, features: GisFeature[]): GisLayerResult {
  return {
    kind,
    features,
    source: feature(kind, "source", polygon(0, 0, 1, 1)).properties.source,
    warnings: [],
  };
}
function input(): AnalysisInput {
  const parcel = feature("parcels", "p", polygon(0, 0, 100, 100), "", {
    MAP_PAR_ID: "test-p",
  });
  return {
    ...origin,
    address: "Synthetic test only",
    parcel,
    manual: false,
    layers: {
      parcels: layer("parcels", [parcel]),
      buildings: layer("buildings", []),
      roads: layer("roads", []),
    },
    errors: {},
  };
}
const metricValue = (
  m: { values: { value: number; unit: string }[] | null },
  unit: string,
) => m.values?.find((v) => v.unit === unit)?.value;
// Known meter-space fixtures are inverse-projected for input; no fixture is rendered in the product.
test("projected area subtracts holes and unions overlaps before estimating remaining land", () => {
  const parcel = [[rect(0, 0, 100, 100), rect(40, 40, 20, 20)]];
  assert.equal(projectedArea(parcel), 9600);
  const roofs = [[[rect(10, 10, 20, 10)]], [[rect(20, 10, 20, 10)]]];
  const coverage = clippedCoverage(parcel, roofs);
  assert.equal(projectedArea(coverage), 300);
  assert.equal(projectedArea(remainingPolygon(parcel, coverage)), 9300);
});
test("segment distances include endpoint-to-interior minima, intersections and touching", () => {
  assert.equal(segmentDistance([xy(0, 0), xy(10, 0)], [xy(5, 3), xy(5, 8)]), 3);
  assert.equal(
    segmentDistance([xy(0, 0), xy(10, 0)], [xy(5, -3), xy(5, 8)]),
    0,
  );
  assert.equal(
    segmentDistance([xy(0, 0), xy(10, 0)], [xy(10, 0), xy(20, 0)]),
    0,
  );
  assert.equal(minimumLineDistance([], [[xy(0, 0), xy(1, 1)]]), null);
});
test("road within parcel is zero; road inside excluded hole has positive separation", () => {
  const parcel = [[rect(0, 0, 100, 100), rect(40, 40, 20, 20)]];
  assert.equal(polygonRoadDistance(parcel, [[xy(10, 10), xy(20, 20)]]), 0);
  assert.equal(polygonRoadDistance(parcel, [[xy(45, 45), xy(55, 55)]]), 5);
  assert.equal(polygonRoadDistance(parcel, [[xy(-10, -10), xy(-10, 110)]]), 10);
});
test("site analysis measures meter-space geometry, handles crossing roofprints and traces every value", () => {
  const q = input();
  q.layers.buildings = layer("buildings", [
    feature(
      "buildings",
      "a",
      polygon(10, 10, 20, 10),
      "Within selected parcel — unverified association",
      { AREA_SQ_FT: 2152.782083342 },
    ),
    feature(
      "buildings",
      "b",
      polygon(20, 10, 20, 10),
      "Within selected parcel — unverified association",
      { AREA_SQ_FT: 2152.782083342 },
    ),
    feature(
      "buildings",
      "c",
      polygon(95, 10, 20, 10),
      "Crosses parcel boundary — review required",
      { AREA_SQ_FT: 2152.782083342 },
    ),
  ]);
  q.layers.roads = layer("roads", [
    feature("roads", "r", {
      type: "LineString",
      coordinates: toWgs([xy(-10, -20), xy(-10, 120)]),
    }),
  ]);
  const report = analyzeSite(q);
  assert.ok(
    Math.abs(metricValue(report.metrics.mappedParcelArea, "m²")! - 10000) <
      0.001,
  );
  assert.ok(
    Math.abs(metricValue(report.metrics.mappedRoofprintCoverage, "m²")! - 350) <
      0.001,
  );
  assert.ok(
    Math.abs(metricValue(report.metrics.remainingLandArea, "m²")! - 9650) <
      0.001,
  );
  assert.ok(
    Math.abs(metricValue(report.buildings[0].boundaryDistance, "m")! - 10) <
      0.001,
  );
  assert.equal(metricValue(report.buildings[2].boundaryDistance, "m"), 0);
  assert.equal(
    report.buildings[2].boundaryDistance.quality,
    "needs verification",
  );
  assert.ok(
    Math.abs(metricValue(report.metrics.roadProximity, "m")! - 10) < 0.001,
  );
  assert.ok(
    Math.abs(
      metricValue(report.metrics.containedRoofprintUnion!, "m²")! - 300,
    ) < 0.001,
  );
  assert.ok(
    Math.abs(metricValue(report.metrics.totalRoofprintArea, "m²")! - 400) <
      0.001,
  );
  for (const m of [
    ...Object.values(report.metrics),
    ...report.buildings.flatMap((b) => [b.area, b.boundaryDistance]),
  ]) {
    assert.ok(m.sources.length);
    for (const key of m.sources) assert.ok(report.sources[key]);
    assert.ok(m.method);
  }
  assert.equal(report.sources["buildings:a"].recordDate, "2019");
  assert.equal(
    JSON.parse(JSON.stringify(report)).electricalReadiness.length,
    6,
  );
});
test("partial building coverage suppresses remaining land rather than inflating available space", () => {
  const q = input();
  q.layers.buildings!.warnings = ["Result limit reached"];
  const report = analyzeSite(q);
  assert.equal(report.metrics.remainingLandArea.values, null);
  assert.equal(report.metrics.remainingLandArea.quality, "needs verification");
  assert.equal(report.metrics.mappedParcelArea.quality, "estimated");
});
test("no selected parcel never sums neighborhood roofs or asserts boundary/road distances", () => {
  const q = input();
  q.parcel = null;
  q.layers.buildings = layer("buildings", [
    feature(
      "buildings",
      "nearby",
      polygon(0, 0, 10, 10),
      "Nearby — parcel association unconfirmed",
      { AREA_SQ_FT: 100 },
    ),
  ]);
  const report = analyzeSite(q);
  assert.equal(report.parcel.selection, "unselected");
  assert.equal(report.metrics.totalRoofprintArea.values, null);
  assert.equal(report.metrics.remainingLandArea.values, null);
  assert.equal(report.buildings[0].boundaryDistance.values, null);
  assert.equal(report.metrics.roadProximity.values, null);
  assert.equal(report.buildings[0].area.quality, "source-backed");
  assert.ok(report.electricalReadiness.every((r) => r.status === "missing"));
});
test("road outage leaves geographic areas available and exports a missing distance with dataset reference", () => {
  const q = input();
  q.layers.roads = null;
  q.errors.roads = "Source unavailable";
  const report = analyzeSite(q);
  assert.notEqual(report.metrics.remainingLandArea.values, null);
  assert.equal(report.metrics.roadProximity.values, null);
  assert.equal(report.coverage.roads.error, "Source unavailable");
  assert.ok(report.metrics.roadProximity.sources.includes("roads:dataset"));
});

test("an upstream outage still yields an exportable missing-data record and electrical checklist", async (t) => {
  const original = global.fetch;
  t.after(() => {
    global.fetch = original;
  });
  global.fetch = async () => new Response("unavailable", { status: 503 });
  const { collectSiteAnalysis } = await import("./gis/collect-analysis");
  const report = await collectSiteAnalysis(
    { lat: 42.2, lng: -71.4, address: "Synthetic outage test", parcelId: null },
    false,
  );
  assert.equal(report.parcel.featureId, null);
  assert.equal(report.metrics.remainingLandArea.values, null);
  assert.ok(report.coverage.parcels.error);
  assert.equal(report.electricalReadiness.length, 6);
  assert.equal(JSON.parse(JSON.stringify(report)).schemaVersion, "1.0");
});
