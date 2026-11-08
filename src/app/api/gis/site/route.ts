import { publicAddressLocation } from "@/lib/gis/public-address";
import type { GisLayerResult } from "@/lib/gis/types";
import { collectSiteAnalysis } from "@/lib/gis/collect-analysis";
import {
  collectContext,
  collectParcels,
  confirmMassachusetts,
  GisRequestError,
} from "@/lib/gis/service";
import type { SiteQuery } from "@/lib/gis/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const lat = p.get("lat"),
    lng = p.get("lng"),
    layer = p.get("layer"),
    parcelId = p.get("parcelId");
  if (
    !lat?.trim() ||
    !lng?.trim() ||
    !Number.isFinite(Number(lat)) ||
    !Number.isFinite(Number(lng)) ||
    Number(lat) < 41.18 ||
    Number(lat) > 42.9 ||
    Number(lng) < -73.51 ||
    Number(lng) > -69.85
  )
    return Response.json(
      { error: "Provide finite coordinates within Massachusetts." },
      { status: 400 },
    );
  if (layer && !["parcels", "buildings", "roads", "analysis"].includes(layer))
    return Response.json({ error: "Unknown GIS layer." }, { status: 400 });
  if (parcelId && !/^\d{1,12}$/.test(parcelId))
    return Response.json(
      { error: "Invalid parcel identifier." },
      { status: 400 },
    );
  const address = p.get("address") ?? "";
  if (address.length > 300)
    return Response.json({ error: "Address is too long." }, { status: 400 });
  const q: SiteQuery = {
    lat: Number(lat),
    lng: Number(lng),
    address,
    parcelId,
  };
  try {
    const location =
      p.get("coordinateSource") === "Google Places"
        ? await publicAddressLocation(address)
        : undefined;
    if (location) {
      q.lat = location.latitude;
      q.lng = location.longitude;
      q.address = location.address;
    }
    const located = (result: GisLayerResult) =>
      location ? { ...result, queryLocation: location } : result;
    await confirmMassachusetts(q.lat, q.lng);
    const headers = { "Cache-Control": "no-store" };
    if (layer === "analysis") {
      const analysis = await collectSiteAnalysis(
        q,
        p.get("selection") === "manual",
      );
      if (location) analysis.query.provider = location.provider;
      return Response.json(analysis, { headers });
    }
    if (layer === "parcels")
      return Response.json(located(await collectParcels(q)), { headers });
    if (layer === "buildings" || layer === "roads")
      return Response.json(located(await collectContext(layer, q)), {
        headers,
      });
    // Aggregate clients get partial successes; the UI uses per-layer requests for independent progress and retries.
    let parcels = null;
    let parcelError = null;
    try {
      parcels = located(await collectParcels(q));
    } catch (e) {
      parcelError = e instanceof Error ? e.message : "Parcel lookup failed.";
    }
    const context = {
      ...q,
      parcelId: q.parcelId ?? parcels?.selectedParcelId ?? null,
    };
    const [buildings, roads] = await Promise.allSettled([
      collectContext("buildings", context),
      collectContext("roads", context),
    ]);
    return Response.json(
      {
        parcels,
        buildings:
          buildings.status === "fulfilled" ? located(buildings.value) : null,
        roads: roads.status === "fulfilled" ? located(roads.value) : null,
        errors: {
          parcels: parcelError,
          buildings:
            buildings.status === "rejected"
              ? String(buildings.reason.message)
              : null,
          roads:
            roads.status === "rejected" ? String(roads.reason.message) : null,
        },
      },
      { headers },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "GIS collection failed.",
      },
      { status: error instanceof GisRequestError ? error.status : 502 },
    );
  }
}
