/** Opt-in live integration check. Does not alter records or seed app results. Run: npx tsx scripts/verify-site-analysis.ts */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import type { SiteAnalysis } from "../src/lib/gis/analysis-types";
const base = process.env.QORE_QA_ORIGIN ?? "http://localhost:3000";
const cases = [
  {
    address: "79 Lowland Street, Holliston, MA",
    lat: 42.2096727,
    lng: -71.4137934,
    coordinateSource:
      "Observed Google Places point from live featured-site lookup",
    candidate: null,
  },
  { address: "100 Institute Road, Worcester, MA", candidate: "2217903" },
  { address: "1500 Main Street, Springfield, MA", candidate: "2475347" },
];
async function main() {
  const results = [];
  for (const site of cases) {
    let lat = site.lat,
      lng = site.lng,
      coordinateSource = site.coordinateSource;
    if (lat === undefined || lng === undefined) {
      const p = new URLSearchParams({
        address: site.address,
        benchmark: "Public_AR_Current",
        format: "json",
      });
      const r = await fetch(
        "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?" +
          p,
        { signal: AbortSignal.timeout(30000) },
      );
      const matches = (await r.json()).result.addressMatches;
      assert.ok(matches.length, "Census address match required");
      lat = matches[0].coordinates.y;
      lng = matches[0].coordinates.x;
      coordinateSource =
        "U.S. Census current address geocoder (test inputs only)";
    }
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      address: site.address,
      layer: "analysis",
    });
    if (site.candidate) {
      params.set("parcelId", site.candidate);
      params.set("selection", "manual");
    }
    const response = await fetch(base + "/api/gis/site?" + params, {
      signal: AbortSignal.timeout(90000),
    });
    const analysis = (await response.json()) as SiteAnalysis & {
      error?: string;
    };
    assert.equal(response.status, 200, analysis.error);
    if (!analysis.parcel.featureId) {
      const p = new URLSearchParams(params);
      p.set("layer", "parcels");
      const candidates = await (
        await fetch(base + "/api/gis/site?" + p)
      ).json();
      console.log(
        JSON.stringify({
          address: site.address,
          candidates: candidates.features.map(
            (f: { properties: { id: string; name: string } }) => ({
              id: f.properties.id,
              name: f.properties.name,
            }),
          ),
        }),
      );
    }
    for (const metric of [
      ...Object.values(analysis.metrics),
      ...analysis.buildings.flatMap((b) => [b.area, b.boundaryDistance]),
    ]) {
      assert.ok(metric.sources.length);
      for (const key of metric.sources)
        assert.ok(analysis.sources[key], `unresolved source ${key}`);
      for (const value of metric.values ?? [])
        assert.ok(Number.isFinite(value.value) && value.value >= 0);
    }
    const area = analysis.metrics.mappedParcelArea.values?.find(
        (v) => v.unit === "m²",
      )?.value,
      covered = analysis.metrics.mappedRoofprintCoverage.values?.find(
        (v) => v.unit === "m²",
      )?.value,
      remaining = analysis.metrics.remainingLandArea.values?.find(
        (v) => v.unit === "m²",
      )?.value;
    if (area !== undefined && covered !== undefined && remaining !== undefined)
      assert.ok(
        Math.abs(area - covered - remaining) < 0.01,
        "Projected area partition must close",
      );
    assert.equal(analysis.electricalReadiness.length, 6);
    assert.ok(
      analysis.electricalReadiness.every((r) => r.status === "missing"),
    );
    const serialized = JSON.parse(JSON.stringify(analysis));
    assert.equal(serialized.schemaVersion, "1.0");
    const summary = {
      address: site.address,
      latitude: lat,
      longitude: lng,
      coordinateSource,
      parcel: analysis.parcel,
      buildings: analysis.buildings.length,
      metrics: Object.fromEntries(
        Object.entries(analysis.metrics).map(([k, m]) => [
          k,
          { values: m.values, quality: m.quality },
        ]),
      ),
      buildingBoundaryDistances: analysis.buildings.map((b) => ({
        id: b.id,
        name: b.name,
        association: b.association,
        values: b.boundaryDistance.values,
      })),
      coverage: analysis.coverage,
    };
    console.log(
      JSON.stringify({
        ...summary,
        buildingBoundaryDistances: summary.buildingBoundaryDistances.slice(
          0,
          2,
        ),
      }),
    );
    results.push(summary);
  }
  await writeFile(
    "/tmp/qore-phase3-live-results.json",
    JSON.stringify(results, null, 2) + "\n",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
