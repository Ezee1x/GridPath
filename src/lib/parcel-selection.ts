import type { SiteRecord } from "./types";

/** The saved-site route supplies its exact parcel. Explorer restores the most
 * recently saved record for this Place ID, never a nearby site's choice. */
export function savedParcelForPlace(
  sites: SiteRecord[],
  placeId: string | undefined,
): string | null {
  if (!placeId) return null;
  const matching = sites.filter(
    (site) => site.mapPlaceId === placeId && site.parcelFeatureId,
  );
  return (
    matching.reduce<SiteRecord | undefined>(
      (latest, site) =>
        !latest || site.updatedAt > latest.updatedAt ? site : latest,
      undefined,
    )?.parcelFeatureId ?? null
  );
}

/** Explicit saved/manual selections always take precedence over an automatic
 * address match, including when the service no longer returns that candidate. */
export function resolvedParcelId(
  explicitId: string | null,
  automaticId: string | null | undefined,
): string | null {
  return explicitId ?? automaticId ?? null;
}
