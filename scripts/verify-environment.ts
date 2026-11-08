/** Bounded live public-source QA. No Google coordinates or private site data. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { GIS_SERVICES } from "../src/lib/gis/config";
const origin = process.env.QORE_QA_ORIGIN ?? "http://localhost:3000";
async function main() {
  const results = [];
  for (const [municipality, address, id] of [
    ["Holliston", "79 Lowland Street", "2251987"],
    ["Worcester", "25 Southgate Street", "588601"],
    ["Boston", "200 Clarendon Street", "2380675"],
    ["Springfield", "1500 Main Street", "2475347"],
  ]) {
    const q = new URLSearchParams({
      f: "geojson",
      objectIds: id,
      outFields: "OBJECTID,SITE_ADDR,CITY,LOC_ID,MAP_PAR_ID",
      outSR: "4326",
      returnGeometry: "true",
    });
    const parcel = (
      await (await fetch(GIS_SERVICES.parcels.url + "/query?" + q)).json()
    ).features[0];
    assert.ok(parcel?.geometry, "Public parcel geometry required");
    const input = {
      parcelId: id,
      geometry: parcel.geometry,
      intervalFeet: 5,
      radiusMeters: 250,
    };
    const layers = await Promise.all(
      ["flood", "wetlands", "elevation"].map(async (layer) => {
        const request = () =>
          fetch(origin + "/api/environment?layer=" + layer, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
            signal: AbortSignal.timeout(180000),
          });
        let r = await request();
        assert.equal(r.status, 200);
        let data = await r.json();
        const failedAttempts = [];
        if (data.status === "error") {
          failedAttempts.push({
            status: data.status,
            error: data.error,
            retrievedAt: data.retrievedAt,
          });
          r = await request();
          assert.equal(r.status, 200);
          data = await r.json();
        }
        assert.equal(data.parcelId, id);
        await writeFile(
          `/tmp/qore-${municipality}-${layer}.json`,
          JSON.stringify(data),
        );
        const { features, contours, sources, ...rest } = data;
        return [
          layer,
          {
            ...rest,
            failedAttempts,
            featureCount: features?.length,
            contours: contours
              ? {
                  ...contours,
                  features: undefined,
                  featureCount: contours.features.length,
                }
              : undefined,
            sources,
          },
        ];
      }),
    );
    const result = {
      municipality,
      address,
      parcel: parcel.properties,
      ...Object.fromEntries(layers),
    };
    results.push(result);
    console.log(
      JSON.stringify({
        municipality,
        parcel: parcel.properties,
        layers: layers.map(([k, v]) => ({
          kind: k,
          ...(v as object),
          sources: undefined,
        })),
      }),
    );
    await writeFile(
      "docs/PHASE5B_LIVE_RESULTS.json",
      JSON.stringify(
        { retrievedAt: new Date().toISOString(), results },
        null,
        2,
      ),
    );
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
