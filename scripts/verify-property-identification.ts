/** Live Phase 5A QA, no browser storage writes. Run with local development server running. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { analyzeSite } from "../src/lib/gis/analysis";
import { MassGISAdapter } from "../src/lib/intake/adapters";
import {
  createIntakeRecord,
  mergeCollectedFields,
  exportIntake,
  readiness,
  selectedObservation,
} from "../src/lib/intake/model";
import { portableIntake } from "../src/lib/intake/portable";
import type { GisLayerResult } from "../src/lib/gis/types";
import type { PropertyData } from "../src/lib/gis/property";
const base = process.env.QORE_QA_ORIGIN ?? "http://localhost:3000";
async function main() {
  const results = [];
  for (const [index, site] of [
    {
      address: "25 Southgate St, Worcester, MA",
      city: "Worcester",
      candidate: "588601",
    },
    {
      address: "200 Clarendon St, Boston, MA",
      city: "Boston",
      candidate: "2380675",
    },
    {
      address: "79 Lowland St, Holliston, MA",
      city: "Holliston",
      candidate: "2251987",
    },
  ].entries()) {
    const q = new URLSearchParams({
      address: site.address,
      lat: "42.2",
      lng: "-71.4",
      coordinateSource: "Google Places",
    });
    if (site.candidate) q.set("parcelId", site.candidate);
    const response = await fetch(base + "/api/gis/site?" + q, {
      signal: AbortSignal.timeout(100000),
    });
    const data = (await response.json()) as {
      parcels: GisLayerResult;
      buildings: GisLayerResult;
      roads: GisLayerResult;
      errors: Record<string, string | null>;
      error?: string;
    };
    assert.equal(response.status, 200, data.error);
    assert.ok(data.parcels && data.buildings && data.roads);
    const candidates = data.parcels.features;
    const id = site.candidate ?? data.parcels.selectedParcelId;
    console.log(
      site.address,
      "candidates",
      candidates
        .map((f) => ({
          id: f.properties.id,
          name: f.properties.name,
          match: f.properties.addressMatch,
          contains: f.properties.containsPoint,
        }))
        .slice(0, 12),
    );
    const parcel = candidates.find((f) => f.properties.id === id);
    assert.ok(
      parcel,
      "Intended parcel must be selected explicitly for this QA site",
    );
    assert.equal(
      parcel.properties.addressMatch,
      true,
      "Selected parcel SITE_ADDR must agree with the requested street address",
    );
    const a = parcel.properties.attributes;
    const point = data.parcels.queryLocation!;
    assert.ok(point);
    assert.notEqual(
      point.latitude,
      42.2,
      "Google/test map coordinates must not drive GIS matching",
    );
    const analysis = analyzeSite({
      latitude: point.latitude,
      longitude: point.longitude,
      address: point.address,
      parcel,
      manual: !!site.candidate,
      layers: data,
      errors: data.errors,
    });
    analysis.query.provider = point.provider;
    const p = new URLSearchParams({
      locId: String(a.LOC_ID),
      townId: String(a.TOWN_ID),
    });
    const r = await fetch(base + "/api/gis/property?" + p, {
      signal: AbortSignal.timeout(50000),
    });
    assert.equal(r.status, 200);
    const property = (await r.json()) as PropertyData;
    assert.equal(property.assessor.status, "ready");
    assert.equal(
      property.municipality?.name.toUpperCase(),
      site.city.toUpperCase(),
    );
    assert.ok(
      property.assessor.records.every(
        (r) => r.LOC_ID === a.LOC_ID && r.TOWN_ID === a.TOWN_ID,
      ),
    );
    const address = {
      placeId: `qa-public:${index}`,
      formattedAddress: site.address,
      city: site.city,
      latitude: point.latitude,
      longitude: point.longitude,
      state: "Massachusetts",
      stateCode: "MA" as const,
      countryCode: "US" as const,
      postalCode: null,
      source: "U.S. Census address geocoder",
      retrievedAt: point.retrievedAt,
    };
    const c = MassGISAdapter(analysis, address, data, property);
    const record = {
      ...mergeCollectedFields(
        createIntakeRecord(address.placeId, site.address, id!),
        c.fields,
        c.sources,
        analysis,
      ),
      propertyIdentification: property,
    };
    const exported = exportIntake(portableIntake(record));
    for (const { observation } of c.fields)
      for (const key of observation.sourceKeys)
        assert.ok(record.sources[key], `Unresolved source ${key}`);
    assert.equal(
      selectedObservation(record.fields.find((f) => f.id === "parcelId")!)!
        .value,
      a.MAP_PAR_ID,
    );
    assert.equal(
      selectedObservation(
        record.fields.find((f) => f.id === "municipalityAhj")!,
      )?.complete,
      false,
    );
    const propertyFields = exported.fieldInventory.filter(
      (f) => f.category === "property",
    );
    assert.equal(propertyFields.length, 7);
    assert.ok(
      propertyFields.every((f) => f.review.status !== "Engineer verified"),
    );
    results.push({
      address: site.address,
      point,
      selectedObjectId: id,
      parcelAttributes: a,
      match: analysis.parcel,
      property,
      readiness: readiness(record, "property"),
      fields: propertyFields,
      sources: record.sources,
      buildingCount: analysis.buildings.length,
    });
    console.log(
      JSON.stringify({
        site: site.address,
        parcel: id,
        locId: a.LOC_ID,
        records: property.assessor.records.length,
        propertyReadiness: readiness(record, "property"),
      }),
    );
  }
  assert.equal(new Set(results.map((r) => r.parcelAttributes.LOC_ID)).size, 3);
  await writeFile(
    "docs/PHASE5A_LIVE_RESULTS.json",
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        note: "Synthetic input map coordinates are deliberately ignored; independent Census geocoder points drive the API lookup. QA IDs are not real Google Place IDs. Records were not seeded into app storage.",
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
