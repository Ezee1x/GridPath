import { createSiteMetadata } from "./site-metadata";
import type { SiteRecord } from "./types";
import type { PublicQueryLocation } from "./gis/public-address";
/** Persist an exempt Place ID and independently sourced Census location only. */
export function savedMapSite(
  placeId: string,
  point: PublicQueryLocation,
  parcelId: string | null,
  existing?: SiteRecord,
): SiteRecord {
  const site = existing
    ? structuredClone(existing)
    : createSiteMetadata(point.address);
  if (!existing) {
    site.facilityName = point.address;
    site.location.municipality = null;
    site.location.coordinates = [point.longitude, point.latitude];
    site.sourceDocuments = [
      {
        id: "census-address",
        title: "U.S. Census address lookup",
        type: "Public address record",
        fileName: "",
        url: "https://geocoding.geo.census.gov/geocoder/",
        uploadedAt: point.retrievedAt,
        retrievedAt: point.retrievedAt,
        referencePage: null,
        sourceAuthority: point.provider,
        size: null,
      },
    ];
  }
  return {
    ...site,
    mapPlaceId: placeId,
    parcelFeatureId: parcelId,
    updatedAt: new Date().toISOString(),
  };
}
