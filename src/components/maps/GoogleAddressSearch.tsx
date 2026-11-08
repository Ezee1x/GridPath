"use client";
import { useEffect, useId, useRef, useState } from "react";
import { MapPin, Search } from "lucide-react";
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

const FEATURED_ADDRESS = "25 Southgate Street, Worcester, MA";
const featuredMatches = (value: string) => {
  const normalize = (text: string) =>
    text
      .toLowerCase()
      .replace(/street\b/g, "st")
      .replace(/,/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const input = normalize(value);
  return input.length >= 2 && normalize(FEATURED_ADDRESS).startsWith(input);
};
interface Suggestion {
  label: string;
  prediction?: google.maps.places.PlacePrediction;
}
export function GoogleAddressSearch({
  onSelect,
}: {
  onSelect: (address: SelectedAddress) => void;
}) {
  const { libraries, error, loading } = useGoogleMaps();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<{ busy: boolean; error: string | null }>(
    { busy: false, error: null },
  );
  const session = useRef<google.maps.places.AutocompleteSessionToken | null>(
    null,
  );
  const selectionVersion = useRef(0);
  const listId = useId();
  const pin = featuredMatches(query);
  const options: Suggestion[] = [
    ...(pin ? [{ label: FEATURED_ADDRESS }] : []),
    ...suggestions.filter(
      (s) => !pin || !/25 southgate (?:st|street)\b.*worcester/i.test(s.label),
    ),
  ];
  useEffect(() => {
    if (!libraries || !query.trim() || !open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        session.current ??= new libraries.places.AutocompleteSessionToken();
        const result =
          await libraries.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(
            {
              input: query,
              includedRegionCodes: ["us"],
              includedPrimaryTypes: ["street_address", "premise", "subpremise"],
              locationBias: MASSACHUSETTS_BOUNDS,
              sessionToken: session.current,
            },
          );
        if (!cancelled) {
          setSuggestions(
            result.suggestions.flatMap((s) =>
              s.placePrediction
                ? [
                    {
                      label: s.placePrediction.text.toString(),
                      prediction: s.placePrediction,
                    },
                  ]
                : [],
            ),
          );
        }
      } catch {
        if (!cancelled)
          setStatus({
            busy: false,
            error:
              "Google Places could not return suggestions. Check your connection and Places API configuration.",
          });
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [libraries, query, open]);

  async function select(option: Suggestion) {
    if (!libraries) return;
    const version = ++selectionVersion.current;
    setOpen(false);
    setQuery(option.label);
    setSuggestions([]);
    setStatus({ busy: true, error: null });
    try {
      let place = option.prediction?.toPlace();
      if (place) await place.fetchFields({ fields: ADDRESS_FIELDS });
      else {
        // The pinned address is supplied by the team, not a fabricated Place ID.
        // Resolve and validate it through the same live Google address pipeline.
        const result = await libraries.places.Place.searchByText({
          textQuery: FEATURED_ADDRESS,
          fields: ADDRESS_FIELDS,
          locationBias: MASSACHUSETTS_BOUNDS,
        });
        place = result.places?.find((candidate) => {
          try {
            const address = selectedAddressFromPlace(candidate);
            return (
              address.city?.toLowerCase() === "worcester" &&
              /^25 southgate (?:st|street)\b/i.test(address.formattedAddress)
            );
          } catch {
            return false;
          }
        });
      }
      if (!place)
        throw new Error(
          "The Southgate Street address could not be confirmed. Try its full address again.",
        );
      const address = selectedAddressFromPlace(place);
      if (version !== selectionVersion.current) return;
      onSelect(address);
      setQuery(address.formattedAddress);
      setStatus({ busy: false, error: null });
    } catch (failure) {
      if (version === selectionVersion.current)
        setStatus({
          busy: false,
          error:
            failure instanceof AddressValidationError
              ? failure.message
              : failure instanceof Error
                ? failure.message
                : "Address details could not be retrieved. Try another suggestion.",
        });
    } finally {
      session.current = null;
    }
  }
  return (
    <div className="google-address-search">
      <div
        className="address-autocomplete"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setOpen(false);
        }}
      >
        <Search size={20} aria-hidden="true" />
        <input
          className="address-autocomplete-input"
          role="combobox"
          aria-label="Massachusetts street address"
          aria-describedby={`${listId}-help`}
          aria-autocomplete="list"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-activedescendant={
            open && options[active] ? `${listId}-${active}` : undefined
          }
          placeholder="Search a Massachusetts street address"
          autoComplete="off"
          value={query}
          disabled={loading || !libraries}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            selectionVersion.current++;
            setQuery(event.target.value);
            setSuggestions([]);
            setActive(0);
            setOpen(true);
            setStatus({ busy: false, error: null });
            if (!event.target.value.trim()) session.current = null;
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              return;
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActive((index) =>
                options.length
                  ? (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      options.length) %
                    options.length
                  : 0,
              );
            }
            if (event.key === "Enter" && open && options[active]) {
              event.preventDefault();
              void select(options[active]);
            }
          }}
        />
        {open && options.length > 0 && (
          <div className="project-suggestions">
            <div id={listId} role="listbox" aria-label="Address suggestions">
              {options.map((option, index) => (
                <button
                  type="button"
                  role="option"
                  id={`${listId}-${index}`}
                  aria-selected={active === index}
                  key={option.prediction?.placeId ?? option.label}
                  className={`project-suggestion ${active === index ? "highlighted" : ""}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void select(option)}
                >
                  <MapPin size={18} aria-hidden="true" />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
            <p className="suggestions-footer">Google Maps · Address search</p>
          </div>
        )}
      </div>
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
      <p id={`${listId}-help`} className="intake-note">
        Select an address suggestion, including a street number. Only
        Massachusetts, United States addresses are accepted.
      </p>
    </div>
  );
}
