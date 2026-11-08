import assert from "node:assert/strict";
import test from "node:test";
import {
  AddressResult,
  validateMassachusettsAddress,
  requireMapsKey,
  MISSING_MAPS_KEY_MESSAGE,
} from "./maps/address";
// Synthetic fixtures exercise validation only; they are never displayed as Places results.
const component = (type: string, longText: string, shortText = longText) => ({
  types: [type],
  longText,
  shortText,
});
function fixture(): AddressResult {
  return {
    id: "synthetic-test-only",
    formattedAddress: "100 Test Street, Test Town, MA",
    latitude: 42,
    longitude: -71,
    addressComponents: [
      component("country", "United States", "US"),
      component("administrative_area_level_1", "Massachusetts", "MA"),
      component("street_number", "100"),
      component("route", "Test Street"),
      component("locality", "Test Town"),
    ],
  };
}
test("valid MA street address preserves returned data without engineering enrichment", () => {
  const result = validateMassachusettsAddress(fixture());
  assert.equal(result.city, "Test Town");
  assert.equal(result.postalCode, null);
  assert.equal(result.source, "Google Places");
  assert.equal(result.latitude, 42);
  assert.ok(!("parcel" in result));
});
test("rejects non-MA states and non-US countries even when coordinates look local", () => {
  for (const [type, code] of [
    ["administrative_area_level_1", "NY"],
    ["country", "CA"],
  ]) {
    const place = fixture();
    place.addressComponents!.find((c) => c.types.includes(type))!.shortText =
      code;
    assert.throws(
      () => validateMassachusettsAddress(place),
      /outside Massachusetts/,
    );
  }
});
test("rejects incomplete addresses and unusable coordinates", () => {
  const place = fixture();
  place.addressComponents = place.addressComponents!.filter(
    (c) => !c.types.includes("street_number"),
  );
  assert.throws(() => validateMassachusettsAddress(place), /building number/);
  for (const latitude of [NaN, Infinity, 91])
    assert.throws(
      () => validateMassachusettsAddress({ ...fixture(), latitude }),
      /usable location/,
    );
});
test("missing or blank key gives actionable configuration message", () => {
  for (const key of [undefined, "", "  "])
    assert.throws(() => requireMapsKey(key), {
      message: MISSING_MAPS_KEY_MESSAGE,
    });
  assert.equal(requireMapsKey(" synthetic-key "), "synthetic-key");
});
