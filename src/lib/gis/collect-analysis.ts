import { analyzeSite } from "./analysis";
import { collectContext, collectParcels, GisRequestError } from "./service";
import type { GisLayerResult } from "./types";
import type { SiteQuery } from "./service";
export async function collectSiteAnalysis(q: SiteQuery, manual: boolean) {
  let parcels: GisLayerResult | null = null;
  let parcelError: string | null = null;
  try {
    parcels = await collectParcels(q);
  } catch (error) {
    parcelError =
      error instanceof Error ? error.message : "Parcel lookup failed.";
  }
  const parcelId = parcels
    ? (q.parcelId ?? parcels.selectedParcelId ?? null)
    : null;
  const parcel = parcelId
    ? (parcels?.features.find((f) => f.properties.id === parcelId) ?? null)
    : null;
  if (parcelId && !parcel)
    throw new GisRequestError(
      "The parcel is not in the current bounded candidate results. Refresh parcel lookup and select it again.",
      409,
    );
  const context = { ...q, parcelId };
  const [buildings, roads] = await Promise.allSettled([
    collectContext("buildings", context),
    collectContext("roads", context),
  ]);
  return analyzeSite({
    latitude: q.lat,
    longitude: q.lng,
    address: q.address,
    manual: manual || (!!parcelId && parcelId !== parcels?.selectedParcelId),
    parcel,
    layers: {
      parcels,
      buildings: buildings.status === "fulfilled" ? buildings.value : null,
      roads: roads.status === "fulfilled" ? roads.value : null,
    },
    errors: {
      parcels: parcelError,
      buildings:
        buildings.status === "rejected"
          ? String(buildings.reason.message)
          : null,
      roads: roads.status === "rejected" ? String(roads.reason.message) : null,
    },
  });
}
