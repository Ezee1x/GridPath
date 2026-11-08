"use client";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SelectedAddress } from "@/lib/maps/address";
import {
  ADDRESS_FIELDS,
  loadGoogleMaps,
  selectedAddressFromPlace,
} from "@/lib/maps/google-maps";
import { GoogleAddressSearch } from "./GoogleAddressSearch";
import { GisSiteContext } from "@/components/gis/GisSiteContext";
import { useWorkspace } from "@/lib/store";
import { savedParcelForPlace } from "@/lib/parcel-selection";
import { EXPLORER_PLACE_ID_KEY, loadExplorerPlaceId } from "@/lib/persistence";
export function GoogleAddressWorkspace({
  compact = false,
  initialPlaceId,
  initialParcelId,
  initialFieldId,
  hideDashboard = false,
  dashboard,
  fixedSite = false,
  onContourAction,
  sourcesContainer,
}: {
  compact?: boolean;
  initialPlaceId?: string;
  initialParcelId?: string | null;
  initialFieldId?: string | null;
  hideDashboard?: boolean;
  dashboard?: ReactNode;
  sourcesContainer?: HTMLElement | null;
  fixedSite?: boolean;
  onContourAction?: (action: (() => void) | null) => void;
}) {
  const { sites } = useWorkspace();
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
      sessionStorage.setItem(EXPLORER_PLACE_ID_KEY, address.placeId);
    } catch {
      /* Preview still works when session storage is unavailable. */
    }
  }, []);
  useEffect(() => {
    if (compact && !initialPlaceId) return;
    let cancelled = false;
    const version = selectionVersion.current;
    let placeId: string | null = null;
    try {
      placeId = initialPlaceId ?? loadExplorerPlaceId(sessionStorage);
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
  }, [compact, initialPlaceId]);
  const showMap = !compact || selected !== null;
  return (
    <div
      className={`google-address-workspace ${compact ? "compact-map-workspace" : ""}`}
    >
      <div className="google-search-section">
        {!fixedSite && <GoogleAddressSearch onSelect={handleSelection} />}
        {compact && (
          <Link href="/explorer" className="text-link">
            Open site explorer
            <ArrowUpRight size={15} />
          </Link>
        )}
        {resolving && <p role="status">Restoring saved site…</p>}
        {error && (
          <div className="notice" role="alert">
            {error}
          </div>
        )}
      </div>
      {showMap && (
        <GisSiteContext
          key={
            selected
              ? `${selected.placeId}:${selected.latitude}:${selected.longitude}`
              : "no-address"
          }
          address={selected}
          sourcesContainer={sourcesContainer}
          hideDashboard={hideDashboard}
          dashboard={dashboard}
          onContourAction={onContourAction}
          initialFieldId={
            selected?.placeId === initialPlaceId ? initialFieldId : undefined
          }
          initialParcelId={
            selected?.placeId === initialPlaceId
              ? initialParcelId
              : savedParcelForPlace(sites, selected?.placeId)
          }
        >
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
        </GisSiteContext>
      )}
    </div>
  );
}
