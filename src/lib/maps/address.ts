export const MASSACHUSETTS_BOUNDS = {
  north: 42.9,
  south: 41.18,
  west: -73.51,
  east: -69.85,
};
export const CENTURY_TYWOOD_ADDRESS = "79 Lowland Street, Holliston, MA";
export interface SelectedAddress {
  placeId: string;
  formattedAddress: string;
  city: string | null;
  state: string;
  stateCode: "MA";
  countryCode: "US";
  postalCode: string | null;
  latitude: number;
  longitude: number;
  source: "Google Places";
  retrievedAt: string;
}
export interface AddressComponent {
  longText: string | null;
  shortText: string | null;
  types: string[];
}
export interface AddressResult {
  id: string;
  formattedAddress?: string | null;
  addressComponents?: AddressComponent[] | null;
  latitude: number;
  longitude: number;
}
export class AddressValidationError extends Error {}
export function validateMassachusettsAddress(
  place: AddressResult,
): SelectedAddress {
  const component = (type: string) =>
    place.addressComponents?.find((item) => item.types.includes(type));
  if (
    component("country")?.shortText?.toUpperCase() !== "US" ||
    component("administrative_area_level_1")?.shortText?.toUpperCase() !== "MA"
  ) {
    throw new AddressValidationError(
      "Select a street address in Massachusetts, United States. Locations outside Massachusetts are not supported.",
    );
  }
  if (
    !component("street_number")?.longText ||
    !component("route")?.longText ||
    !place.formattedAddress
  )
    throw new AddressValidationError(
      "Select a full street address, including a building number, from the Google suggestions.",
    );
  if (
    !Number.isFinite(place.latitude) ||
    !Number.isFinite(place.longitude) ||
    Math.abs(place.latitude) > 90 ||
    Math.abs(place.longitude) > 180
  )
    throw new AddressValidationError(
      "Google did not return a usable location for this address. Select another result.",
    );
  return {
    placeId: place.id,
    formattedAddress: place.formattedAddress,
    city:
      component("locality")?.longText ??
      component("postal_town")?.longText ??
      component("administrative_area_level_3")?.longText ??
      null,
    state:
      component("administrative_area_level_1")?.longText ?? "Massachusetts",
    stateCode: "MA",
    countryCode: "US",
    postalCode: component("postal_code")?.longText ?? null,
    latitude: place.latitude,
    longitude: place.longitude,
    source: "Google Places",
    retrievedAt: new Date().toISOString(),
  };
}
export const MISSING_MAPS_KEY_MESSAGE =
  "Google Maps is not configured. Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to the root .env.local file, then restart the development server. Saved records and manual intake are still available.";
export function requireMapsKey(key: string | undefined): string {
  if (!key?.trim()) throw new Error(MISSING_MAPS_KEY_MESSAGE);
  return key.trim();
}
