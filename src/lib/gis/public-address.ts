import { GisRequestError } from "./service";
export interface PublicQueryLocation {
  latitude: number;
  longitude: number;
  address: string;
  provider: "U.S. Census address geocoder";
  retrievedAt: string;
}
const pending = new Map<
  string,
  { expires: number; promise: Promise<PublicQueryLocation> }
>();
/** Independent public location for GIS. Google Places coordinates remain exclusively in the Maps view. */
export function publicAddressLocation(
  address: string,
): Promise<PublicQueryLocation> {
  const key = address.trim();
  const old = pending.get(key);
  if (old && old.expires > Date.now()) return old.promise;
  const promise = (async () => {
    const params = new URLSearchParams({
      address: key,
      benchmark: "Public_AR_Current",
      format: "json",
    });
    const response = await fetch(
      "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?" +
        params,
      { signal: AbortSignal.timeout(20000), cache: "no-store" },
    );
    if (!response.ok)
      throw new GisRequestError(
        "Independent public address lookup is unavailable. GIS lookup cannot use the Google map coordinates.",
      );
    const data = await response.json();
    const matches = data.result?.addressMatches ?? [];
    if (matches.length !== 1 || matches[0].addressComponents?.state !== "MA")
      throw new GisRequestError(
        "The public address geocoder did not resolve one Massachusetts address. Google Maps remains available; GIS requires an independently sourced location.",
      );
    const { x, y } = matches[0].coordinates ?? {};
    if (!Number.isFinite(x) || !Number.isFinite(y))
      throw new GisRequestError("Public address coordinates are missing.");
    return {
      latitude: y,
      longitude: x,
      address: String(matches[0].matchedAddress),
      provider: "U.S. Census address geocoder" as const,
      retrievedAt: new Date().toISOString(),
    };
  })().catch((e) => {
    pending.delete(key);
    throw e;
  });
  if (pending.size >= 128) pending.delete(pending.keys().next().value!);
  pending.set(key, { expires: Date.now() + 300000, promise });
  return promise;
}
