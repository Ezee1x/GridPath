import assert from "node:assert/strict";
import test from "node:test";
import { marchingIsolines } from "./environment/isolines";
import {
  sampleParcel,
  validPixel,
  demContours,
  type DemGrid,
} from "./environment/elevation";
import {
  toMeters,
  toWgs84,
  validateEnvironmentInput,
} from "./environment/spatial";
import { collectFlood, collectWetlands } from "./environment/polygons";
import {
  environmentalCollection,
  MassGISElevationAdapter,
} from "./environment/adapters";
import type { EnvironmentInput, ElevationResult } from "./environment/types";
import {
  createIntakeRecord,
  exportIntake,
  loadIntake,
  readiness,
} from "./intake/model";
const origin = toMeters([-71.4, 42.2]);
const ring = (x: number, y: number, w: number, h: number) =>
  [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
    [x, y],
  ].map(toWgs84);
const input: EnvironmentInput = {
  parcelId: "1",
  geometry: {
    type: "Polygon",
    coordinates: [ring(origin[0], origin[1], 4, 4)],
  },
  intervalFeet: 5,
  radiusMeters: 250,
};
function grid(): DemGrid {
  return {
    values: Float32Array.from(Array.from({ length: 16 }, (_, i) => i)),
    mask: null,
    width: 4,
    height: 4,
    origin: [origin[0], origin[1] + 4],
    resolution: [1, -1],
    offset: 0.5,
    noData: -9999,
    extent: [origin[0], origin[1], origin[0] + 4, origin[1] + 4],
    exportUrl: "https://example.test/synthetic-dem",
  };
}
test("marching squares interpolates a known plane and adds no bounding-box lines", () => {
  const result = marchingIsolines(
    [0, 1, 2, 0, 1, 2, 0, 1, 2],
    3,
    3,
    [0.5, 1.5, 4],
    () => true,
  );
  assert.equal(result[0].lines.length, 1);
  assert.deepEqual(result[0].lines[0], [
    [0.5, 0],
    [0.5, 1],
    [0.5, 2],
  ]);
  assert.ok(result[1].lines[0].every((p) => p[0] === 1.5));
  assert.equal(result[2].lines.length, 0);
  assert.equal(
    marchingIsolines([0, 1, 0, 1], 2, 2, [0.5], (i) => i !== 3)[0].lines.length,
    0,
  );
  assert.equal(
    marchingIsolines([1, -1, -1, 1], 2, 2, [0], () => true)[0].lines.length,
    2,
  );
});
test("projected parcel sampling excludes NoData, masks and holes; units are feet", () => {
  const g = grid();
  g.values[0] = -9999;
  g.mask = Float32Array.from({ length: 16 }, (_, i) => (i === 1 ? 0 : 1));
  const summary = sampleParcel(g, input)!;
  assert.equal(summary.validSamples, 14);
  assert.equal(summary.parcelSamples, 16);
  assert.equal(summary.validCoverageFraction, 14 / 16);
  assert.equal(summary.minimumFeet, 2 / 0.3048);
  assert.equal(summary.maximumFeet, 15 / 0.3048);
  assert.equal(summary.medianFeet, 8.5 / 0.3048);
  assert.equal(summary.rangeFeet, 13 / 0.3048);
  assert.equal(validPixel(g, 0), false);
  assert.equal(validPixel(g, 1), false);
  const hole = {
    ...input,
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        input.geometry.type === "Polygon" ? input.geometry.coordinates[0] : [],
        ring(origin[0] + 1, origin[1] + 1, 2, 2),
      ],
    },
  };
  assert.equal(sampleParcel(grid(), hole)!.parcelSamples, 12);
  const none = grid();
  none.values.fill(-9999);
  assert.equal(sampleParcel(none, input), null);
  assert.deepEqual(demContours(none, 5), []);
});
test("DEM isolines retain real interpolated geometry and foot labels", () => {
  const features = demContours(grid(), 5);
  assert.ok(features.length > 0);
  for (const f of features) {
    assert.equal(f.properties.elevationFeet % 5, 0);
    assert.ok(
      Math.abs(
        f.properties.elevationMeters - f.properties.elevationFeet * 0.3048,
      ) < 1e-8,
    );
    assert.ok(f.geometry.coordinates.length > 1);
  }
  const flat = grid();
  flat.values.fill(10);
  assert.equal(demContours(flat, 5).length, 0);
});
test("bounded input rejects malformed or oversized geometry and illegal intervals", () => {
  assert.equal(validateEnvironmentInput(input).parcelId, "1");
  assert.throws(() => validateEnvironmentInput({ ...input, intervalFeet: 3 }));
  assert.throws(() =>
    validateEnvironmentInput({
      ...input,
      geometry: {
        type: "Polygon",
        coordinates: [ring(origin[0], origin[1], 7000, 10)],
      },
    }),
  );
  const p = toWgs84(origin);
  assert.ok(Math.abs(p[0] + 71.4) < 1e-8);
});
test("failed upstream flood and wetlands sources never become absence findings", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error("Explicit synthetic outage");
  };
  try {
    const [f, w] = await Promise.all([
      collectFlood(input),
      collectWetlands(input),
    ]);
    assert.equal(f.status, "error");
    assert.equal(f.coverage, "unknown");
    assert.equal(f.specialHazardOverlapSquareFeet, null);
    assert.equal(w.status, "error");
    assert.equal(w.intersects, null);
    assert.equal(w.nearestBoundaryFeet, null);
  } finally {
    globalThis.fetch = original;
  }
});
test("partial elevation is incomplete; wrong-site bundle is ignored", () => {
  const e = {
    kind: "elevation",
    parcelId: "1",
    status: "ready",
    summary: {
      medianFeet: 10,
      minimumFeet: 5,
      maximumFeet: 15,
      rangeFeet: 10,
      validSamples: 5,
      parcelSamples: 10,
      validCoverageFraction: 0.5,
      completeParcelExtent: true,
    },
    sources: {},
    method: "Synthetic test",
    retrievedAt: "2026-11-07",
    warnings: ["Partial test coverage"],
  } as ElevationResult;
  assert.equal(
    MassGISElevationAdapter(e).fields[0].observation.complete,
    false,
  );
  assert.equal(
    environmentalCollection({ parcelId: "2", elevation: e }, "1").fields.length,
    0,
  );
  const r = createIntakeRecord("test", "Synthetic", "1");
  assert.equal(readiness(r).required, 59);
});
test("legacy Slope moves to retired data and disappears from active export and checklist", () => {
  const r = createIntakeRecord("legacy", "Synthetic", "1");
  const legacy = {
    ...r,
    fields: [...r.fields, { ...r.fields[0], id: "slope" }],
  };
  const loaded = loadIntake(
    { getItem: () => JSON.stringify(legacy) },
    r.siteKey,
  );
  assert.ok(loaded);
  assert.equal(loaded.fields.length, 69);
  assert.equal(loaded.retiredFields?.length, 1);
  const exported = exportIntake(loaded);
  assert.ok(!exported.fieldInventory.some((f) => f.id === "slope"));
  assert.ok(!JSON.stringify(exported.missingFields).includes("Slope"));
});

test("LiDAR tile sentinel values cannot advertise official vector coverage", async () => {
  const { publicTileUrl } = await import("./environment/elevation");
  assert.equal(publicTileUrl("Not Available"), null);
  assert.equal(publicTileUrl(""), null);
  assert.equal(publicTileUrl("javascript:alert(1)"), null);
  assert.equal(
    publicTileUrl("https://example.test/tile.zip"),
    "https://example.test/tile.zip",
  );
});
test("failed DEM and contour services preserve a missing result without invented elevations", async () => {
  const { collectElevation } = await import("./environment/elevation");
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error("Synthetic DEM/index outage");
  };
  try {
    const e = await collectElevation({ ...input, parcelId: "99" });
    assert.equal(e.status, "error");
    assert.equal(e.summary, null);
    assert.equal(e.contours.status, "error");
    assert.equal(e.contours.features.length, 0);
  } finally {
    globalThis.fetch = original;
  }
});
test("FEMA empty response distinguishes absent coverage from covered empty results", async () => {
  const original = globalThis.fetch;
  const { geojsonToArcGIS } = await import("@terraformer/arcgis");
  let covered = false;
  globalThis.fetch = async (resource) => {
    const url = String(resource);
    if (!url.includes("/query"))
      return Response.json({
        capabilities: "Query",
        geometryType: "esriGeometryPolygon",
        fields: [{ name: "OBJECTID" }],
      });
    return Response.json({
      spatialReference: { wkid: 4269 },
      features:
        covered && url.includes("/0/query")
          ? [
              {
                attributes: { OBJECTID: 1 },
                geometry: geojsonToArcGIS(input.geometry),
              },
            ]
          : [],
    });
  };
  try {
    const no = await collectFlood(input);
    assert.equal(no.status, "no-data");
    assert.equal(no.coverage, "no-coverage");
    covered = true;
    const yes = await collectFlood(input);
    assert.equal(yes.coverage, "no-mapped-hazard");
    assert.equal(yes.status, "ready");
    assert.equal(yes.overlapSquareFeet, 0);
  } finally {
    globalThis.fetch = original;
  }
});
test("partial raster extent is flagged even with valid remaining pixels", () => {
  const g = grid();
  const large = {
    ...input,
    geometry: {
      type: "Polygon" as const,
      coordinates: [ring(origin[0] - 700, origin[1] - 700, 1400, 1400)],
    },
  };
  const s = sampleParcel(g, large)!;
  assert.equal(s.completeParcelExtent, false);
});

test("Float32 GeoTIFF decoder preserves projection, pixel centers, NoData and values", async () => {
  const { writeArrayBuffer } = await import("geotiff");
  const { decodeDem } = await import("./environment/elevation");
  const bytes = writeArrayBuffer(Float32Array.from([1.25, -9999, 3.5, 4.75]), {
    width: 2,
    height: 2,
    ProjectedCSTypeGeoKey: 26986,
    GTModelTypeGeoKey: 1,
    GTRasterTypeGeoKey: 1,
    ModelPixelScale: [1, 1, 0],
    ModelTiepoint: [0, 0, 0, origin[0], origin[1] + 2, 0],
    GDAL_NODATA: "-9999",
  });
  const g = await decodeDem(bytes, "https://example.test/synthetic-float32");
  assert.equal(g.values[0], 1.25);
  assert.equal(g.offset, 0.5);
  assert.equal(g.noData, -9999);
  assert.deepEqual(g.resolution, [1, -1]);
  assert.equal(validPixel(g, 1), false);
  const wrong = writeArrayBuffer(Float32Array.from([1]), {
    width: 1,
    height: 1,
    GeographicTypeGeoKey: 4326,
  });
  await assert.rejects(
    () => decodeDem(wrong, "https://example.test/wrong-crs"),
    /unexpected projection/,
  );
});
