import type { PublicQueryLocation } from "../gis/public-address";
import type { GisFeature } from "../gis/types";
import type { SiteContext } from "./types";

/** Reuse the map's independent public lookup, never Google imagery/coordinates. */
export function annotationLayerContext(
  address: string,
  point: PublicQueryLocation,
  parcelId: string | null,
  parcel: GisFeature | null,
  previous?: SiteContext | null,
): SiteContext {
  if (
    previous?.location &&
    previous.address === address &&
    previous.selectedParcelId === parcelId
  )
    return previous;
  const geometry = parcel?.properties.id === parcelId ? parcel.geometry : null;
  const rings =
    geometry?.type === "Polygon"
      ? geometry.coordinates
      : geometry?.type === "MultiPolygon"
        ? geometry.coordinates.flat()
        : null;
  return {
    address,
    selectedParcelId: parcelId,
    retrievedAt: point.retrievedAt,
    location: {
      lat: point.latitude,
      lng: point.longitude,
      matchedAddress: point.address,
      state: "MA",
      county: null,
      municipality: null,
      source: {
        name: point.provider,
        url: "https://geocoding.geo.census.gov/geocoder/",
      },
    },
    parcel:
      rings && parcel
        ? {
            featureId: parcelId!,
            id: String(parcel.properties.attributes.MAP_PAR_ID ?? parcelId),
            rings: rings.map((ring) =>
              ring.map(([lng, lat]) => [lng, lat] as [number, number]),
            ),
          }
        : null,
    features: [],
    sourcesQueried: [
      {
        name: point.provider,
        url: "https://geocoding.geo.census.gov/geocoder/",
        ok: true,
        note: "Reused public location already retrieved for the GIS layers.",
      },
    ],
  };
}
