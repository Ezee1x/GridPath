/** Live read-only Phase 4 QA. Uses Census test points, not the Google search UI. No app storage writes. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { analyzeSite } from "../src/lib/gis/analysis";
import { MassGISAdapter } from "../src/lib/intake/adapters";
import {
  createIntakeRecord,
  exportIntake,
  mergeCollectedFields,
  readiness,
} from "../src/lib/intake/model";
import type { GisLayerResult } from "../src/lib/gis/types";
const base = process.env.QORE_QA_ORIGIN ?? "http://localhost:3000";
const cases = [
  {
    address: "25 Southgate St, Worcester, MA",
    lat: 42.247541735785,
    lng: -71.814427152912,
    candidate: "588601",
    city: "Worcester",
    source: "U.S. Census current address geocoder",
  },
  {
    address: "79 Lowland Street, Holliston, MA",
    lat: 42.2096727,
    lng: -71.4137934,
    candidate: null,
    city: "Holliston",
    source: "Google Places",
  },
  {
    address: "77 Massachusetts Ave, Cambridge, MA",
    lat: 42.35895759548,
    lng: -71.093453252047,
    candidate: null,
    city: "Cambridge",
    source: "U.S. Census current address geocoder",
  },
  {
    address: "100 Institute Road, Worcester, MA",
    lat: 42.273133336788,
    lng: -71.81125656808,
    candidate: "2217903",
    city: "Worcester",
    source: "U.S. Census current address geocoder",
  },
];
async function main() {
  const results = [];
  for (const [index, site] of cases.entries()) {
    const params = new URLSearchParams({
      lat: String(site.lat),
      lng: String(site.lng),
      address: site.address,
    });
    if (site.candidate) params.set("parcelId", site.candidate);
    const response = await fetch(`${base}/api/gis/site?${params}`, {
      signal: AbortSignal.timeout(100000),
    });
    assert.equal(response.status, 200);
    const data = (await response.json()) as {
      parcels: GisLayerResult | null;
      buildings: GisLayerResult | null;
      roads: GisLayerResult | null;
      errors: Record<string, string | null>;
    };
    assert.ok(
      data.parcels && data.buildings && data.roads,
      "Live sources must succeed for baseline checks",
    );
    const selected = site.candidate ?? data.parcels.selectedParcelId ?? null;
    const input = {
      latitude: site.lat,
      longitude: site.lng,
      address: site.address,
      parcel:
        data.parcels.features.find((f) => f.properties.id === selected) ?? null,
      manual: !!site.candidate,
      layers: data,
      errors: data.errors,
    };
    const analysis = analyzeSite(input);
    const address = {
      placeId: `qa:${index}`,
      formattedAddress: site.address,
      city: site.city,
      state: "Massachusetts",
      stateCode: "MA" as const,
      countryCode: "US" as const,
      postalCode: null,
      latitude: site.lat,
      longitude: site.lng,
      source: site.source,
      retrievedAt: analysis.generatedAt,
    };
    const normalized = MassGISAdapter(analysis, address, data);
    const record = mergeCollectedFields(
      createIntakeRecord(address.placeId, site.address, selected),
      normalized.fields,
      normalized.sources,
      analysis,
    );
    const exported = exportIntake(record);
    assert.equal(exported.fieldInventory.length, 58);
    assert.equal(readiness(record).required, 47);
    for (const id of [
      "zoning",
      "flood",
      "wetlands",
      "utility",
      "voltage",
      "interval",
    ])
      assert.equal(
        exported.fieldInventory.find((f) => f.id === id)?.currentObservation,
        null,
      );
    for (const { observation } of normalized.fields)
      for (const key of observation.sourceKeys)
        assert.ok(record.sources[key], `Missing reference ${key}`);
    const m = analysis.metrics;
    const area = m.mappedParcelArea.values?.find((v) => v.unit === "m²")?.value;
    const covered = m.mappedRoofprintCoverage.values?.find(
      (v) => v.unit === "m²",
    )?.value;
    const remaining = m.remainingLandArea.values?.find(
      (v) => v.unit === "m²",
    )?.value;
    const union = m.containedRoofprintUnion?.values?.find(
      (v) => v.unit === "m²",
    )?.value;
    if (area !== undefined && covered !== undefined && remaining !== undefined)
      assert.ok(Math.abs(area - covered - remaining) < 0.01);
    if (union !== undefined && covered !== undefined)
      assert.ok(union <= covered + 0.01);
    if (!selected) assert.equal(m.parcelArea.values, null);
    if (index === 0)
      assert.equal(
        data.parcels.selectedParcelId,
        null,
        "Southgate address/point mismatch must stay uncertain",
      );
    if (index === 3)
      assert.ok(
        analysis.buildings.filter((b) => b.association.startsWith("Within"))
          .length > 1,
      );
    // Simulate a road-source outage using the very same successful parcel/building response.
    const partial = analyzeSite({
      ...input,
      layers: { ...data, roads: null },
      errors: { roads: "Simulated QA road-source outage" },
    });
    const partialFields = MassGISAdapter(partial, address, {
      parcels: data.parcels,
      roads: null,
    });
    assert.equal(partial.metrics.roadProximity.values, null);
    assert.deepEqual(partial.metrics.parcelArea.values, m.parcelArea.values);
    assert.deepEqual(
      partial.metrics.remainingLandArea.values,
      m.remainingLandArea.values,
    );
    assert.ok(!partialFields.fields.some((f) => f.fieldId === "roadNames"));
    results.push({
      address: site.address,
      coordinateSource: site.source,
      coordinates: { latitude: site.lat, longitude: site.lng },
      parcel: analysis.parcel,
      candidateMode: site.candidate
        ? "Manual candidate for QA; not verified"
        : "Automatic only",
      candidates: data.parcels.features.map((f) => ({
        id: f.properties.id,
        name: f.properties.name,
        containsPoint: f.properties.containsPoint,
        addressMatch: f.properties.addressMatch,
      })),
      buildings: analysis.buildings.length,
      containedBuildings: analysis.buildings.filter((b) =>
        b.association.startsWith("Within"),
      ).length,
      readiness: readiness(record),
      metrics: m,
      partialOutage:
        "Passed: missing roads do not erase parcel/building calculations",
      sources: record.sources,
    });
    console.log(
      JSON.stringify({
        address: site.address,
        selected,
        buildings: analysis.buildings.length,
        readiness: readiness(record),
        partialOutage: "passed",
      }),
    );
  }
  assert.equal(
    new Set(results.map((r) => JSON.stringify(r.coordinates))).size,
    cases.length,
  );
  await writeFile(
    "docs/PHASE4_LIVE_RESULTS.json",
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        method:
          "One aggregate GIS request per site, then pure analysis and normalization; coordinates previously observed from named providers. QA place identifiers are not real Google IDs.",
        results,
      },
      null,
      2,
    ) + "\n",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
