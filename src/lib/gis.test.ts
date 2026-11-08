import assert from "node:assert/strict";
import test from "node:test";
import type { Polygon, MultiPolygon } from "geojson";
import {
  buildingAssociation,
  chooseParcel,
  containsPoint,
  envelope,
  geometryMeasurement,
  measurement,
  normalizeFeatureSet,
  SQFT_PER_SQM,
  parcelSourceMeasurement,
} from "./gis/geometry";
import type { GisFeature } from "./gis/types";
import { queryLayer, requestJson } from "./gis/service";
const rect = (x: number, y: number, w: number, h: number): Polygon => ({
  type: "Polygon",
  coordinates: [
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
      [x, y],
    ],
  ],
});
// Synthetic geometry below is used only for deterministic geometry/matching tests.
test("geodesic area accounts for holes and converts units, not degree area", () => {
  const outer = rect(-71, 42, 0.01, 0.01);
  const hole = rect(-70.998, 42.002, 0.002, 0.002);
  const measured = geometryMeasurement({
    ...outer,
    coordinates: [...outer.coordinates, ...hole.coordinates],
  })!;
  const difference =
    geometryMeasurement(outer)!.squareMeters -
    geometryMeasurement(hole)!.squareMeters;
  assert.ok(Math.abs(measured.squareMeters - difference) < 0.01);
  assert.ok(measured.squareMeters > 800000);
  assert.equal(measured.squareFeet, measured.squareMeters * SQFT_PER_SQM);
  assert.equal(measured.approximate, true);
  assert.equal(measurement(NaN, "invalid"), null);
  assert.equal(measurement(-1, "invalid"), null);
});
test("point containment respects holes and multiple polygons", () => {
  const p: Polygon = {
    type: "Polygon",
    coordinates: [
      ...rect(0, 0, 10, 10).coordinates,
      ...rect(2, 2, 2, 2).coordinates,
    ],
  };
  assert.equal(containsPoint(p, 3, 3), false);
  assert.equal(containsPoint(p, 1, 1), true);
  const multi: MultiPolygon = {
    type: "MultiPolygon",
    coordinates: [p.coordinates, rect(20, 20, 1, 1).coordinates],
  };
  assert.equal(containsPoint(multi, 20.5, 20.5), true);
});
test("never selects nearest, road ROW, ambiguous, or address-mismatched parcel", () => {
  const f = (id: string, contains: boolean, address: string, type = "FEE") =>
    ({
      type: "Feature",
      geometry: rect(0, 0, 1, 1),
      properties: {
        id,
        containsPoint: contains,
        attributes: { SITE_ADDR: address, POLY_TYPE: type },
      },
    }) as unknown as GisFeature;
  const valid = f("1", true, "79 LOWLAND ST");
  assert.equal(chooseParcel([valid], "79 Lowland Street, Holliston, MA"), "1");
  for (const candidates of [
    [f("2", false, "79 LOWLAND ST")],
    [f("3", true, "79 LOWLAND ST", "ROW")],
    [f("4", true, "81 LOWLAND ST")],
    [valid, { ...valid, properties: { ...valid.properties, id: "duplicate" } }],
  ])
    assert.equal(chooseParcel(candidates, "79 LOWLAND ST"), null);
  assert.equal(chooseParcel([valid], ""), null);
});
test("roofprint associations distinguish containment, crossing, outside and unselected parcel", () => {
  const parcel = rect(0, 0, 10, 10);
  assert.match(buildingAssociation(rect(1, 1, 2, 2), parcel), /^Within/);
  assert.match(buildingAssociation(rect(9, 9, 2, 2), parcel), /^Crosses/);
  assert.match(
    buildingAssociation(rect(20, 20, 2, 2), parcel),
    /^Nearby — outside/,
  );
  assert.match(buildingAssociation(rect(1, 1, 2, 2), null), /unconfirmed/);
});
test("bounded envelopes cap huge parcels and keep WGS84 explicit", () => {
  const e = envelope(rect(-72, 41, 4, 4), -71, 42, 250);
  assert.equal(e.clipped, true);
  const g = JSON.parse(e.geometry);
  assert.equal(g.spatialReference.wkid, 4326);
  assert.ok(g.xmax - g.xmin < 0.06);
  assert.ok(g.ymax - g.ymin < 0.04);
});
test("ArcGIS JSON fallback preserves polygon holes and multi-path roads", () => {
  const polygon = normalizeFeatureSet({
    spatialReference: { wkid: 4326 },
    features: [
      {
        attributes: { OBJECTID: 1 },
        geometry: {
          rings: [
            [
              [0, 0],
              [0, 10],
              [10, 10],
              [10, 0],
              [0, 0],
            ],
            [
              [2, 2],
              [4, 2],
              [4, 4],
              [2, 4],
              [2, 2],
            ],
          ],
        },
      },
    ],
  });
  assert.equal(polygon.features[0].properties!.OBJECTID, 1);
  assert.equal(containsPoint(polygon.features[0].geometry, 3, 3), false);
  const road = normalizeFeatureSet({
    features: [
      {
        attributes: { OBJECTID: 2 },
        geometry: {
          paths: [
            [
              [0, 0],
              [1, 1],
            ],
            [
              [2, 2],
              [3, 3],
            ],
          ],
        },
      },
    ],
  });
  assert.equal(road.features[0].geometry.type, "MultiLineString");
  assert.throws(
    () =>
      normalizeFeatureSet({ spatialReference: { wkid: 26986 }, features: [] }),
    /WGS84/,
  );
});
test("query falls back from denied GeoJSON, deduplicates records, and flags incomplete coverage", async (t) => {
  const original = global.fetch;
  const formats: string[] = [];
  t.after(() => {
    global.fetch = original;
  });
  global.fetch = async (_url, init) => {
    const p = init?.body as URLSearchParams;
    formats.push(p.get("f")!);
    return Response.json(
      p.get("f") === "geojson"
        ? { error: { code: 400 } }
        : {
            spatialReference: { wkid: 4326 },
            exceededTransferLimit: true,
            features: [
              {
                attributes: { OBJECTID: 1 },
                geometry: {
                  paths: [
                    [
                      [0, 0],
                      [1, 1],
                    ],
                  ],
                },
              },
              {
                attributes: { OBJECTID: 1 },
                geometry: {
                  paths: [
                    [
                      [0, 0],
                      [1, 1],
                    ],
                  ],
                },
              },
            ],
          },
    );
  };
  const result = await queryLayer(
    "roads",
    {
      name: "test",
      geometryType: "esriGeometryPolyline",
      capabilities: "Query",
      supportedQueryFormats: "JSON, geoJSON",
      objectIdField: "OBJECTID",
      fields: [{ name: "OBJECTID" }],
    },
    { geometry: "0,0", geometryType: "esriGeometryPoint" },
  );
  assert.deepEqual(formats, ["geojson", "json"]);
  assert.equal(result.features.length, 1);
  assert.equal(result.warnings.length, 1);
});
test("unavailable upstream retries at most once and reports failure", async (t) => {
  const original = global.fetch;
  let calls = 0;
  t.after(() => {
    global.fetch = original;
  });
  global.fetch = async () => {
    calls++;
    return new Response("unavailable", { status: 503 });
  };
  await assert.rejects(
    requestJson("https://example.invalid", { f: "json" }),
    /HTTP 503/,
  );
  assert.equal(calls, 2);
});

test("parcel reported lot units are explicit; unknown units never become guessed acres", () => {
  const acres = parcelSourceMeasurement({
    LOT_SIZE: 12.299,
    LOT_UNITS: "Acres",
  })!;
  assert.ok(Math.abs(acres.acres - 12.299) < 0.000001);
  assert.equal(acres.approximate, false);
  assert.equal(
    parcelSourceMeasurement({ LOT_SIZE: 12.299, LOT_UNITS: "unknown" }),
    null,
  );
});

test("API rejects invalid inputs before querying upstream", async () => {
  const { GET } = await import("../app/api/gis/site/route");
  for (const query of [
    "lat=&lng=-71",
    "lat=NaN&lng=-71",
    "lat=40&lng=-74",
    "lat=42&lng=-71&parcelId=1%20OR%201=1",
    "lat=42&lng=-71&layer=unknown",
  ]) {
    const response = await GET(
      new Request("http://localhost/api/gis/site?" + query),
    );
    assert.equal(response.status, 400);
  }
});
test("detailed jurisdiction check rejects a point inside bounding box but outside MA", async (t) => {
  const original = global.fetch;
  t.after(() => {
    global.fetch = original;
  });
  global.fetch = async () => Response.json({ features: [] });
  const { GET } = await import("../app/api/gis/site/route");
  const response = await GET(
    new Request("http://localhost/api/gis/site?lat=41.8&lng=-72.7"),
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /outside Massachusetts/);
});
test("road outage preserves successful parcel and roofprint records in aggregate API", async (t) => {
  const original = global.fetch;
  t.after(() => {
    global.fetch = original;
  });
  global.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("tigerweb"))
      return Response.json({ features: [{ attributes: { STUSAB: "MA" } }] });
    const kind = url.includes("Property_Tax")
      ? "parcels"
      : url.includes("Building_Structures")
        ? "buildings"
        : "roads";
    if (!url.endsWith("/query"))
      return Response.json({
        name: kind,
        capabilities: "Query",
        geometryType:
          kind === "roads" ? "esriGeometryPolyline" : "esriGeometryPolygon",
        objectIdField: "OBJECTID",
        supportedQueryFormats: "JSON, geoJSON",
        fields: [
          "OBJECTID",
          "SITE_ADDR",
          "POLY_TYPE",
          "AREA_SQ_FT",
          "STRUCT_ID",
        ].map((name) => ({ name })),
      });
    if (kind === "roads") return new Response("outage", { status: 503 });
    assert.equal((init!.body as URLSearchParams).get("outSR"), "4326");
    return Response.json({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry:
            kind === "parcels"
              ? rect(-71.5, 42.1, 0.2, 0.2)
              : rect(-71.41, 42.19, 0.01, 0.01),
          properties:
            kind === "parcels"
              ? { OBJECTID: 1, SITE_ADDR: "100 TEST ST", POLY_TYPE: "FEE" }
              : { OBJECTID: 2, STRUCT_ID: "synthetic", AREA_SQ_FT: 100 },
        },
      ],
    });
  };
  const { GET } = await import("../app/api/gis/site/route");
  const response = await GET(
    new Request(
      "http://localhost/api/gis/site?lat=42.2&lng=-71.4&address=100%20Test%20Street",
    ),
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.parcels.features.length, 1);
  assert.equal(body.buildings.features.length, 1);
  assert.equal(body.roads, null);
  assert.ok(body.errors.roads);
  assert.equal(body.errors.parcels, null);
});
