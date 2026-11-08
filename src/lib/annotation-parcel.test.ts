import test from "node:test";
import assert from "node:assert/strict";
import { getSiteContext } from "./annotations/context.server";
test("annotation context honors saved feature ID without a proximity filter; ambiguous address matches stay null", async () => {
  const original = global.fetch;
  let query: URL | undefined;
  global.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname.includes("census.gov"))
      return Response.json({
        result: {
          addressMatches: [
            {
              matchedAddress: "79 LOWLAND ST, HOLLISTON, MA",
              coordinates: { x: -71.4, y: 42.2 },
              addressComponents: { streetName: "LOWLAND", state: "MA" },
              geographies: {},
            },
          ],
        },
      });
    if (url.hostname.includes("overpass"))
      return Response.json({ elements: [] });
    query = url;
    const f = (id: number) => ({
      attributes: {
        OBJECTID: id,
        SITE_ADDR: "79 LOWLAND ST",
        MAP_PAR_ID: `parcel-${id}`,
      },
      geometry: {
        rings: [
          [
            [-71.4, 42.2],
            [-71.401, 42.2],
            [-71.4, 42.201],
            [-71.4, 42.2],
          ],
        ],
      },
    });
    return Response.json({ features: [f(2251987), f(999)] });
  };
  try {
    const saved = await getSiteContext(
      "79 Lowland St, Holliston, MA",
      "2251987",
    );
    assert.equal(saved.parcel?.featureId, "2251987");
    assert.equal(query!.searchParams.get("where"), "OBJECTID = 2251987");
    assert.equal(query!.searchParams.has("geometry"), false);
    const ambiguous = await getSiteContext("79 Lowland St, Holliston, MA");
    assert.equal(ambiguous.parcel, null);
  } finally {
    global.fetch = original;
  }
});
