import assert from "node:assert/strict";
import test from "node:test";
import { propertyFields } from "./intake/property";
import { collectProperty, ASSESSOR_URL } from "./gis/property";
import {
  createIntakeRecord,
  mergeCollectedFields,
  readiness,
  selectedObservation,
  reviewField,
} from "./intake/model";
import { portableIntake } from "./intake/portable";
import { parcelSourceMeasurement } from "./gis/geometry";
import { analyzeSite } from "./gis/analysis";
import type { GisLayerResult } from "./gis/types";
import type { PropertyData } from "./gis/property";
const address = {
  placeId: "synthetic-map-place",
  formattedAddress: "10 Test Street, Test Town, MA",
  city: "Test Town",
  state: "Massachusetts",
  stateCode: "MA" as const,
  countryCode: "US" as const,
  postalCode: "00000",
  latitude: 42,
  longitude: -71,
  source: "Google Places" as const,
  retrievedAt: "2026-11-07",
};
const layer: GisLayerResult = {
  kind: "parcels",
  source: {
    name: "Synthetic parcel fixture",
    url: "https://example.test/parcels/0",
    geometryType: "esriGeometryPolygon",
    nativeWkid: 4326,
    datasetUpdated: null,
    retrievedAt: "2026-11-07",
    attribution: "Synthetic unit-test fixture",
  },
  warnings: [],
  selectedParcelId: "1",
  features: [],
};
layer.features = [
  {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-71, 42],
          [-70.999, 42],
          [-70.999, 42.001],
          [-71, 42.001],
          [-71, 42],
        ],
      ],
    },
    properties: {
      id: "1",
      kind: "parcels",
      name: "10 TEST ST",
      attributes: {
        MAP_PAR_ID: "TEST-MAP-ID",
        LOC_ID: "M_100_200",
        TOWN_ID: 35,
        PROP_ID: "TAX-1",
        NO_MATCH: "N",
        SITE_ADDR: "10 TEST ST",
        CITY: "TEST TOWN",
        ZIP: "00000",
        FY: 2025,
        LOT_SIZE: 1,
        LOT_UNITS: "A",
        USE_CODE: "400",
        USE_DESC: "Buildings for manufacturing operations",
        TOWNID_UC: "35_400",
        ZONING: "I",
      },
      source: layer.source,
      sourceDate: null,
      verification: "Public GIS record — needs verification",
      measurement: null,
      association: "Synthetic fixture",
      containsPoint: true,
      addressMatch: true,
    },
  },
];
layer.features[0].properties.measurement = parcelSourceMeasurement(
  layer.features[0].properties.attributes,
);
const analysis = analyzeSite({
  latitude: 42,
  longitude: -71,
  address: address.formattedAddress,
  parcel: layer.features[0],
  manual: false,
  layers: { parcels: layer, buildings: null, roads: null },
  errors: {},
});
analysis.query.provider = "U.S. Census address geocoder";
const data: PropertyData = {
  locId: "M_100_200",
  townId: 35,
  retrievedAt: "2026-11-07",
  assessor: {
    status: "ready",
    complete: true,
    error: null,
    records: [
      {
        OBJECTID: 100,
        LOC_ID: "M_100_200",
        TOWN_ID: 35,
        PROP_ID: "TAX-1",
        SITE_ADDR: null,
        FY: 2025,
        USE_CODE: "400",
        ZONING: "I",
        LOT_SIZE: 1,
        LOT_UNITS: "A",
      },
    ],
  },
  municipality: { name: "TEST TOWN", recordId: "35" },
  warnings: [],
};
function normalize(p = layer, d: PropertyData | undefined = data) {
  return propertyFields(analysis, address, p, d);
}
function record(p = layer, d: PropertyData | undefined = data) {
  const c = normalize(p, d);
  return mergeCollectedFields(
    createIntakeRecord(address.placeId, address.formattedAddress, "1"),
    c.fields,
    c.sources,
    analysis,
  );
}
test("property normalization retains MAP_PAR_ID, separate LOC_ID/FY, resolved use description and non-authoritative zoning", () => {
  const c = normalize();
  for (const id of [
    "address",
    "coordinates",
    "municipalityAhj",
    "parcelId",
    "parcelArea",
    "landUse",
    "zoning",
  ])
    assert.ok(c.fields.some((f) => f.fieldId === id));
  const r = record();
  assert.equal(
    selectedObservation(r.fields.find((f) => f.id === "parcelId")!)!.value,
    "TEST-MAP-ID",
  );
  assert.equal(readiness(r, "property").populated, 6);
  assert.equal(
    selectedObservation(r.fields.find((f) => f.id === "municipalityAhj")!)!
      .complete,
    false,
  );
  assert.equal(c.sources["assessor:35:100"].locId, "M_100_200");
  assert.equal(c.sources["assessor:35:100"].fiscalYear, 2025);
  const use = selectedObservation(r.fields.find((f) => f.id === "landUse")!)!
    .value as { description: string };
  assert.match(use.description, /manufacturing/);
});
test("missing LOC_ID and NO_MATCH do not attach assessor facts; wrong-site data is ignored", () => {
  for (const attributes of [
    { ...layer.features[0].properties.attributes, LOC_ID: null },
    { ...layer.features[0].properties.attributes, NO_MATCH: "Y" },
  ]) {
    const p = {
      ...layer,
      features: [
        {
          ...layer.features[0],
          properties: { ...layer.features[0].properties, attributes },
        },
      ],
    };
    const c = normalize(p);
    assert.ok(!c.fields.some((f) => ["landUse", "zoning"].includes(f.fieldId)));
  }
  const c = normalize(layer, {
    ...data,
    locId: "M_999_999",
    municipality: { name: "WRONG SITE", recordId: "99" },
  });
  assert.ok(!c.fields.some((f) => f.fieldId === "municipalityAhj"));
  assert.ok(!Object.keys(c.sources).some((k) => k.startsWith("assessor:")));
});
test("an unmapped use code remains missing instead of being classified from digits", () => {
  const p = {
    ...layer,
    features: [
      {
        ...layer.features[0],
        properties: {
          ...layer.features[0].properties,
          attributes: {
            ...layer.features[0].properties.attributes,
            USE_DESC: null,
          },
        },
      },
    ],
  };
  assert.ok(!normalize(p).fields.some((f) => f.fieldId === "landUse"));
});
test("multiple assessor observations and address disagreement are retained without replacing verified value", () => {
  const d = {
    ...data,
    assessor: {
      ...data.assessor,
      records: [
        ...data.assessor.records,
        {
          ...data.assessor.records[0],
          OBJECTID: 101,
          PROP_ID: "TAX-2",
          SITE_ADDR: "99 DIFFERENT ST",
          ZONING: "R",
        },
      ],
    },
  };
  let r = record();
  r = reviewField(r, "zoning", "Test engineer", "Explicit synthetic review");
  const old = selectedObservation(r.fields.find((f) => f.id === "zoning")!)!.id;
  const c = normalize(layer, d);
  r = mergeCollectedFields(r, c.fields, c.sources, analysis);
  const z = r.fields.find((f) => f.id === "zoning")!;
  assert.equal(z.selectedId, old);
  assert.equal(z.review.status, "Engineer verified");
  assert.ok(z.observations.length >= 3);
  assert.ok(
    selectedObservation(
      r.fields.find((f) => f.id === "address")!,
    )!.warnings?.some((w) => w.includes("differs")),
  );
  assert.equal(
    selectedObservation(r.fields.find((f) => f.id === "address")!)!.value,
    address.formattedAddress,
  );
});
test("portable records exclude Google content while preserving public evidence and Place ID", () => {
  const r = portableIntake(record());
  assert.equal(r.identity.placeId, address.placeId);
  assert.equal(
    r.fields.find((f) => f.id === "coordinates")!.observations.length,
    0,
  );
  assert.ok(
    !Object.values(r.sources).some((s) => s.provider === "Google Places"),
  );
  assert.equal(r.identity.address, "10 TEST ST, TEST TOWN, MA, 00000");
  assert.ok(r.analysis);
  assert.ok(r.fields.find((f) => f.id === "landUse")!.observations.length);
});
test("assessor collector constrains LOC_ID AND TOWN_ID and rejects unrelated response records", async () => {
  const original = global.fetch;
  const calls: string[] = [];
  global.fetch = (async (input) => {
    const u = new URL(String(input));
    calls.push(u.href);
    return Response.json(
      u.href.startsWith(ASSESSOR_URL)
        ? {
            features: [
              { attributes: data.assessor.records[0] },
              {
                attributes: {
                  ...data.assessor.records[0],
                  LOC_ID: "M_999_999",
                },
              },
            ],
          }
        : {
            features: [
              { attributes: { OBJECTID: 35, TOWN_ID: 35, TOWN: "TEST TOWN" } },
            ],
          },
    );
  }) as typeof fetch;
  try {
    const r = await collectProperty("M_100_200", 35);
    assert.equal(r.assessor.records.length, 1);
    assert.equal(r.assessor.complete, false);
    const q = new URL(calls.find((u) => u.startsWith(ASSESSOR_URL))!)
      .searchParams;
    assert.equal(q.get("where"), "LOC_ID = 'M_100_200' AND TOWN_ID = 35");
    assert.equal(q.get("returnGeometry"), "false");
    await assert.rejects(() => collectProperty("bad' OR 1=1", 35));
  } finally {
    global.fetch = original;
  }
});

test("independent public address lookup deduplicates concurrent layer requests and never accepts ambiguous matches", async () => {
  const { publicAddressLocation } = await import("./gis/public-address");
  const original = global.fetch;
  let count = 0;
  global.fetch = (async () => {
    count++;
    return Response.json({
      result: {
        addressMatches: [
          {
            matchedAddress: "8 TEST ST, TEST TOWN, MA",
            addressComponents: { state: "MA" },
            coordinates: { x: -71, y: 42 },
          },
        ],
      },
    });
  }) as typeof fetch;
  try {
    const [a, b] = await Promise.all([
      publicAddressLocation("8 Synthetic QA Test St"),
      publicAddressLocation("8 Synthetic QA Test St"),
    ]);
    assert.equal(count, 1);
    assert.deepEqual(a, b);
    assert.equal(a.provider, "U.S. Census address geocoder");
    global.fetch = (async () =>
      Response.json({ result: { addressMatches: [] } })) as typeof fetch;
    await assert.rejects(
      () => publicAddressLocation("9 Synthetic Missing Test St"),
      /did not resolve/,
    );
  } finally {
    global.fetch = original;
  }
});

test("source unit conversions do not produce false area conflicts", async () => {
  const { hasConflict } = await import("./intake/model");
  const r = record();
  assert.equal(
    hasConflict(r.fields.find((f) => f.id === "parcelArea")!),
    false,
  );
});

test("other tax listings remain alternatives without replacing the selected PROP_ID", () => {
  const other = {
    ...data.assessor.records[0],
    OBJECTID: 101,
    PROP_ID: "OTHER-UNIT",
    ZONING: "R",
  };
  const d = {
    ...data,
    assessor: { ...data.assessor, records: [...data.assessor.records, other] },
  };
  const r = record(layer, d);
  const field = r.fields.find((f) => f.id === "zoning")!;
  assert.equal(
    (selectedObservation(field)!.value as { assessorZoning: string })
      .assessorZoning,
    "I",
  );
  assert.ok(
    field.observations.some(
      (o) =>
        (o.value as { assessorZoning: string }).assessorZoning === "R" &&
        o.autoSelect === false,
    ),
  );
});

test("a new fiscal year cannot rewrite evidence attached to a verified observation", () => {
  let r = record();
  r = reviewField(r, "zoning", "Test engineer", "Synthetic review");
  const original = selectedObservation(
    r.fields.find((f) => f.id === "zoning")!,
  )!;
  const key = original.sourceKeys[0];
  const oldFY = r.sources[key].fiscalYear;
  const c = normalize();
  c.sources[key] = { ...c.sources[key], fiscalYear: 2026 };
  r = mergeCollectedFields(r, c.fields, c.sources, analysis);
  assert.equal(r.sources[key].fiscalYear, oldFY);
  assert.equal(
    selectedObservation(r.fields.find((f) => f.id === "zoning")!)!.id,
    original.id,
  );
  assert.ok(Object.values(r.sources).some((s) => s.fiscalYear === 2026));
});
