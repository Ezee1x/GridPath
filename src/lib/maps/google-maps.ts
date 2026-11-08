import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import {
  AddressValidationError,
  CENTURY_TYWOOD_ADDRESS,
  MASSACHUSETTS_BOUNDS,
  SelectedAddress,
  requireMapsKey,
  validateMassachusettsAddress,
} from "./address";
export interface MapsLibraries {
  maps: google.maps.MapsLibrary;
  places: google.maps.PlacesLibrary;
  marker: google.maps.MarkerLibrary;
}
const AUTH_MESSAGE =
  "Google Maps could not authorize this browser. Check that Maps JavaScript API and Places API (New) are enabled, billing is active, and this localhost origin is allowed by the key restrictions.";
export const MAPS_AUTH_EVENT = "qoresites-google-maps-auth-error";
declare global {
  interface Window {
    __qoreSitesMaps?: {
      promise: Promise<MapsLibraries>;
      authError: string | null;
    };
    gm_authFailure?: () => void;
  }
}

/** One browser-wide loader survives route changes, Strict Mode, and hot reload. */
export function loadGoogleMaps(): Promise<MapsLibraries> {
  if (typeof window === "undefined")
    return Promise.reject(
      new Error("Google Maps is available in the browser only."),
    );
  if (window.__qoreSitesMaps?.authError)
    return Promise.reject(new Error(window.__qoreSitesMaps.authError));
  if (window.__qoreSitesMaps) return window.__qoreSitesMaps.promise;
  let key: string;
  try {
    key = requireMapsKey(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
  } catch (error) {
    return Promise.reject(error);
  }
  const previousAuthFailure = window.gm_authFailure;
  window.gm_authFailure = () => {
    if (window.__qoreSitesMaps)
      window.__qoreSitesMaps.authError = AUTH_MESSAGE;
    window.dispatchEvent(new Event(MAPS_AUTH_EVENT));
    previousAuthFailure?.();
  };
  if (!window.google?.maps?.importLibrary)
    setOptions({ key, v: "weekly", region: "US", language: "en" });
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            "Google Maps took too long to load. Check your connection and browser content blockers, then reload the page.",
          ),
        ),
      20000,
    );
  });
  const request = Promise.all([
    importLibrary("maps"),
    importLibrary("places"),
    importLibrary("marker"),
  ])
    .then(([maps, places, marker]) => ({ maps, places, marker }))
    .catch(() => {
      throw new Error(
        "Google Maps could not load. Check your connection, enabled Google APIs, and API-key restrictions.",
      );
    });
  const promise = Promise.race([request, timeout]).finally(() =>
    clearTimeout(timer),
  );
  window.__qoreSitesMaps = { promise, authError: null };
  return promise;
}
export function mapsAuthError(): string {
  return window.__qoreSitesMaps?.authError ?? AUTH_MESSAGE;
}
export const ADDRESS_FIELDS = [
  "id",
  "formattedAddress",
  "addressComponents",
  "location",
];
export function selectedAddressFromPlace(
  place: google.maps.places.Place,
): SelectedAddress {
  return validateMassachusettsAddress({
    id: place.id,
    formattedAddress: place.formattedAddress,
    addressComponents: place.addressComponents,
    latitude: place.location?.lat() ?? NaN,
    longitude: place.location?.lng() ?? NaN,
  });
}
export async function resolveCenturyTywood(): Promise<SelectedAddress> {
  const { places } = await loadGoogleMaps();
  const result = await places.Place.searchByText({
    textQuery: CENTURY_TYWOOD_ADDRESS,
    fields: ADDRESS_FIELDS,
    locationBias: MASSACHUSETTS_BOUNDS,
    region: "us",
    language: "en-US",
    maxResultCount: 5,
  });
  const place = result.places.find((place) => {
    const components = place.addressComponents ?? [];
    return (
      components.some(
        (item) =>
          item.types.includes("street_number") && item.longText === "79",
      ) &&
      components.some(
        (item) =>
          item.types.includes("route") && /lowland/i.test(item.longText ?? ""),
      ) &&
      components.some(
        (item) =>
          item.types.includes("locality") &&
          /holliston/i.test(item.longText ?? ""),
      )
    );
  });
  if (!place)
    throw new AddressValidationError(
      "Google did not return the exact 79 Lowland Street reference address. Search for it above and select the matching street address.",
    );
  return selectedAddressFromPlace(place);
}
