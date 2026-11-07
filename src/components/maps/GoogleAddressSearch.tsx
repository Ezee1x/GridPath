"use client";
import { useEffect, useRef, useState } from "react";
import {
  SelectedAddress,
  MASSACHUSETTS_BOUNDS,
  AddressValidationError,
} from "@/lib/maps/address";
import {
  ADDRESS_FIELDS,
  selectedAddressFromPlace,
} from "@/lib/maps/google-maps";
import { useGoogleMaps } from "./useGoogleMaps";
export function GoogleAddressSearch({
  onSelect,
}: {
  onSelect: (address: SelectedAddress) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const { libraries, error, loading } = useGoogleMaps();
  const [status, setStatus] = useState<{ busy: boolean; error: string | null }>(
    { busy: false, error: null },
  );
  useEffect(() => {
    if (!libraries || !host.current) return;
    const element = new libraries.places.PlaceAutocompleteElement({
      includedRegionCodes: ["us"],
      includedPrimaryTypes: ["street_address", "premise", "subpremise"],
      locationBias: MASSACHUSETTS_BOUNDS,
    });
    element.placeholder = "Search a Massachusetts street address";
    element.setAttribute("aria-label", "Massachusetts street address");
    element.setAttribute("aria-describedby", "google-address-help");
    element.style.colorScheme = "light";
    const container = host.current;
    container.replaceChildren(element);
    let cancelled = false;
    let request = 0;
    const onSelection = async (event: Event) => {
      const version = ++request;
      setStatus({ busy: true, error: null });
      try {
        const place = (
          event as google.maps.places.PlacePredictionSelectEvent
        ).placePrediction.toPlace();
        await place.fetchFields({ fields: ADDRESS_FIELDS });
        if (cancelled || version !== request) return;
        const selected = selectedAddressFromPlace(place);
        onSelect(selected);
        setStatus({ busy: false, error: null });
      } catch (error) {
        if (!cancelled && version === request)
          setStatus({
            busy: false,
            error:
              error instanceof AddressValidationError
                ? error.message
                : "Address details could not be retrieved. Try another Google suggestion, or check Places API (New), billing, and key restrictions.",
          });
      }
    };
    const onFailure = () => {
      if (!cancelled)
        setStatus({
          busy: false,
          error:
            "Google Places could not return suggestions. Check your connection and that Places API (New) is enabled for this key.",
        });
    };
    element.addEventListener("gmp-select", onSelection);
    element.addEventListener("gmp-error", onFailure);
    return () => {
      cancelled = true;
      request++;
      element.removeEventListener("gmp-select", onSelection);
      element.removeEventListener("gmp-error", onFailure);
      element.remove();
    };
  }, [libraries, onSelect]);
  return (
    <div className="google-address-search">
      <label className="input-label">Massachusetts street address</label>
      <div ref={host} className="google-autocomplete-host" />
      {loading && (
        <p className="map-status" role="status">
          Loading Google address search…
        </p>
      )}
      {status.busy && (
        <p className="map-status" role="status">
          Retrieving address details…
        </p>
      )}
      {(error || status.error) && (
        <div className="notice" role="alert">
          {error ?? status.error}
        </div>
      )}
      <p id="google-address-help" className="intake-note">
        Select a Google suggestion, including a street number. Only
        Massachusetts, United States addresses are accepted.
      </p>
    </div>
  );
}
