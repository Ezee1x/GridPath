"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import {
  SelectedAddress,
  AddressValidationError,
  CENTURY_TYWOOD_ADDRESS,
} from "@/lib/maps/address";
import {
  ADDRESS_FIELDS,
  loadGoogleMaps,
  resolveCenturyTywood,
  selectedAddressFromPlace,
} from "@/lib/maps/google-maps";
import { GoogleAddressSearch } from "./GoogleAddressSearch";
import { GoogleSiteMap } from "./GoogleSiteMap";
const PLACE_ID_KEY = "qore-projectsync-explorer-place-id";
const engineeringStatuses = [
  ["Parcel boundaries", "Not retrieved"],
  ["Building footprint", "Not retrieved"],
  ["Road access", "Not evaluated"],
  ["Electrical infrastructure", "Not verified"],
  ["Existing transformer", "Unknown"],
  ["Site measurements", "Pending"],
];
export function GoogleAddressWorkspace({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [selected, setSelected] = useState<SelectedAddress | null>(null);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectionVersion = useRef(0);
  const handleSelection = useCallback((address: SelectedAddress) => {
    selectionVersion.current++;
    setSelected(address);
    setError(null);
    setResolving(false);
    // Only the Place ID is retained. Address content is fetched again after refresh.
    try {
      sessionStorage.setItem(PLACE_ID_KEY, address.placeId);
    } catch {
      /* Preview still works when session storage is unavailable. */
    }
  }, []);
  useEffect(() => {
    if (compact) return;
    let cancelled = false;
    const version = selectionVersion.current;
    let placeId: string | null = null;
    try {
      placeId = sessionStorage.getItem(PLACE_ID_KEY);
    } catch {
      return;
    }
    if (!placeId) return;
    loadGoogleMaps()
      .then(async ({ places }) => {
        const place = new places.Place({ id: placeId! });
        await place.fetchFields({ fields: ADDRESS_FIELDS });
        const restored = selectedAddressFromPlace(place);
        if (!cancelled && version === selectionVersion.current)
          setSelected(restored);
      })
      .catch(() => {
        if (!cancelled && version === selectionVersion.current)
          setError(
            "The previous address could not be restored. Select a Google suggestion to load the site again.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [compact]);
  async function openFeatured() {
    const version = ++selectionVersion.current;
    setResolving(true);
    setError(null);
    try {
      const address = await resolveCenturyTywood();
      if (version === selectionVersion.current) handleSelection(address);
    } catch (error) {
      if (version === selectionVersion.current)
        setError(
          error instanceof AddressValidationError
            ? error.message
            : "The reference address could not be resolved. Check Google Places API access or select the address from the search above.",
        );
    } finally {
      if (version === selectionVersion.current) setResolving(false);
    }
  }
  const showMap = !compact || selected !== null;
  return (
    <div
      className={`google-address-workspace ${compact ? "compact-map-workspace" : ""}`}
    >
      <div className="google-search-section">
        <GoogleAddressSearch onSelect={handleSelection} />
        <div className="featured-map-site">
          <button type="button" onClick={openFeatured} disabled={resolving}>
            <MapPin size={16} />
            <span>
              <strong>
                {resolving
                  ? "Resolving reference address…"
                  : "Century-Tywood J3 Corp"}
              </strong>
              <small>{CENTURY_TYWOOD_ADDRESS}</small>
            </span>
            <ArrowUpRight size={17} />
          </button>
          {compact && (
            <Link href="/explorer" className="text-link">
              Open site explorer
              <ArrowUpRight size={15} />
            </Link>
          )}
        </div>
        {error && (
          <div className="notice" role="alert">
            {error}
          </div>
        )}
      </div>
      {showMap && (
        <div className="satellite-workspace-grid">
          <GoogleSiteMap address={selected} />
          <aside className="site-location-panel">
            <section>
              <h2>Site location</h2>
              {selected ? (
                <dl className="location-details">
                  {[
                    ["Formatted address", selected.formattedAddress],
                    ["City / town", selected.city ?? "Not returned"],
                    ["State", selected.state],
                    ["ZIP code", selected.postalCode ?? "Not returned"],
                    ["Latitude", selected.latitude.toFixed(6)],
                    ["Longitude", selected.longitude.toFixed(6)],
                    ["Address source", selected.source],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="location-empty">
                  Search for a Massachusetts street address or open the
                  Century-Tywood example to see its location.
                </p>
              )}
            </section>
            {selected?.city === "Holliston" &&
              selected.formattedAddress.includes("79 Lowland") &&
              selected.postalCode !== "01747" && (
                <p className="notice">
                  Address review: Google returns ZIP{" "}
                  {selected.postalCode ?? "unavailable"}; the supplied reference
                  record says 01747. The saved record has not been changed.
                </p>
              )}
            <section className="engineering-location-status">
              <h3>Engineering data status</h3>
              <dl>
                {engineeringStatuses.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <p>
                Satellite imagery is visual context. It does not verify
                electrical equipment, clearances, dimensions, or parcel
                boundaries.
              </p>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
