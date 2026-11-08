"use client";
import { useEffect, useRef, useState } from "react";
import { importLibrary } from "@googlemaps/js-api-loader";
import { Camera, Compass, ExternalLink } from "lucide-react";
import { loadGoogleMaps } from "@/lib/maps/google-maps";
import { bearingToPoint } from "@/lib/annotations/camera-position";

export interface StreetViewCapture {
  panoId: string;
  heading: number;
  pitch: number;
  fov: number;
}
export interface StreetViewPosition {
  lat: number;
  lng: number;
  heading: number;
}

const HAS_KEY = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim());

/** Google Maps URLs open Street View in a new tab without an API key. */
function streetViewUrl(location: { lat: number; lng: number }) {
  const q = new URLSearchParams({
    api: "1",
    map_action: "pano",
    viewpoint: `${location.lat.toFixed(6)},${location.lng.toFixed(6)}`,
  });
  return `https://www.google.com/maps/@?${q}`;
}
function searchUrl(address: string) {
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: address })}`;
}

export function StreetViewExplorer({
  address,
  location,
  analysisPermitted,
  busy,
  onCapture,
  onPositionChange,
  authorizedComparison = false,
  moveTarget,
}: {
  address: string;
  location: { lat: number; lng: number } | null;
  analysisPermitted: boolean;
  busy: boolean;
  onCapture: (view: StreetViewCapture) => void;
  onPositionChange?: (position: StreetViewPosition | null) => void;
  authorizedComparison?: boolean;
  moveTarget?: { lat: number; lng: number; id: number } | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const panorama = useRef<google.maps.StreetViewPanorama | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");
  const [moveMessage, setMoveMessage] = useState("");
  const lat = location?.lat;
  const lng = location?.lng;
  const report = useRef(onPositionChange);
  useEffect(() => {
    report.current = onPositionChange;
  }, [onPositionChange]);

  useEffect(() => {
    if (!HAS_KEY || lat === undefined || lng === undefined) return;
    let cancelled = false;
    const listeners: google.maps.MapsEventListener[] = [];
    (async () => {
      try {
        setStatus("loading");
        await loadGoogleMaps();
        const sv = (await importLibrary(
          "streetView",
        )) as google.maps.StreetViewLibrary;
        const target = { lat, lng };
        const { data } = await new sv.StreetViewService().getPanorama({
          location: target,
          radius: 120,
          source: sv.StreetViewSource.OUTDOOR,
        });
        if (cancelled) return;
        if (!data.location?.pano)
          throw new Error(
            "No Street View imagery is published near this address.",
          );
        // Face the property from where the panorama was taken.
        const from = data.location.latLng?.toJSON() ?? target;
        const heading = bearingToPoint(from, target);
        panorama.current = new sv.StreetViewPanorama(el.current!, {
          pano: data.location.pano,
          pov: { heading: (heading + 360) % 360, pitch: 0 },
          zoom: 1,
          addressControl: false,
          motionTracking: false,
          motionTrackingControl: false,
          fullscreenControl: true,
        });
        const updatePosition = () => {
          const p = panorama.current;
          const position = p?.getPosition();
          if (!cancelled && position)
            report.current?.({
              ...position.toJSON(),
              heading: p!.getPov().heading,
            });
        };
        listeners.push(
          panorama.current.addListener("position_changed", updatePosition),
          panorama.current.addListener("pov_changed", updatePosition),
        );
        updatePosition();
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setMessage(
          e instanceof Error && /ZERO_RESULTS|No Street View/i.test(e.message)
            ? "No Street View imagery is published within 120 m of this address."
            : e instanceof Error
              ? e.message
              : "Street View could not be opened.",
        );
      }
    })();
    return () => {
      cancelled = true;
      listeners.forEach((listener) => listener.remove());
      panorama.current?.setVisible(false);
      panorama.current = null;
      report.current?.(null);
    };
  }, [lat, lng]);

  useEffect(() => {
    if (!moveTarget || status !== "ready") return;
    let cancelled = false;
    (async () => {
      try {
        const sv = (await importLibrary(
          "streetView",
        )) as google.maps.StreetViewLibrary;
        if (cancelled) return;
        setMoveMessage("Finding Street View near the selected point…");
        const { data } = await new sv.StreetViewService().getPanorama({
          location: { lat: moveTarget.lat, lng: moveTarget.lng },
          radius: 120,
          preference: sv.StreetViewPreference.NEAREST,
          sources: [sv.StreetViewSource.OUTDOOR],
        });
        if (cancelled) return;
        const from = data.location?.latLng?.toJSON();
        if (!data.location?.pano || !from || !panorama.current)
          throw Error("No imagery");
        panorama.current.setPano(data.location.pano);
        panorama.current.setPov({
          heading: bearingToPoint(from, moveTarget),
          pitch: 0,
        });
        panorama.current.setVisible(true);
        setMoveMessage(
          "Moved to the nearest available Street View within 120 m, facing the selected point.",
        );
      } catch {
        if (!cancelled)
          setMoveMessage(
            "No Street View found within 120 m of that point. Your current view is unchanged; try a nearby road.",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [moveTarget, status]);

  if (!HAS_KEY || !location)
    return (
      <div className="viewer-empty">
        <Compass size={30} />
        <h3>
          {location
            ? "Explore Street View in Google Maps"
            : "Locate the property first"}
        </h3>
        <p>
          {location
            ? "Street View opens in a new tab at the geocoded address. Walk the street, look for the service entrance and transformer, then upload your own photos here for analysis."
            : "Run Analyze site to geocode the address. You can still search for it in Google Maps now."}
        </p>
        <div className="button-row">
          <a
            className="button primary"
            href={location ? streetViewUrl(location) : searchUrl(address)}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={16} />
            {location ? "Open Street View" : "Search Google Maps"}
          </a>
          {location && (
            <a
              className="button secondary"
              href={searchUrl(address)}
              target="_blank"
              rel="noreferrer"
            >
              Open map
            </a>
          )}
        </div>
        {!HAS_KEY && (
          <p className="small-text">
            To explore inside QoreSites, set{" "}
            <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> with the Maps
            JavaScript API enabled.
          </p>
        )}
      </div>
    );

  return (
    <div className="street-view">
      <div
        ref={el}
        className="street-view-pano"
        aria-label={`Street View near ${address}`}
      />
      {status !== "ready" && (
        <div className="viewer-empty overlay">
          <Compass size={30} />
          <h3>
            {status === "loading"
              ? "Finding Street View imagery"
              : "Street View unavailable"}
          </h3>
          <p>{status === "loading" ? address : message}</p>
        </div>
      )}
      <div className="street-view-bar">
        {moveMessage && <p role="status">{moveMessage}</p>}
        <p>
          {authorizedComparison
            ? "Drag to look around or follow the navigation arrows. Imagery © Google."
            : analysisPermitted
              ? "Drag to look around, then analyze the current view. Imagery © Google."
              : "Explore only. Google's terms restrict analyzing Street View imagery, so it is never sent to the detection model. Upload your own photos for analysis. Imagery © Google."}
        </p>
        {analysisPermitted && (
          <button
            className="button secondary"
            disabled={status !== "ready" || busy}
            onClick={() => {
              const p = panorama.current!;
              const pov = p.getPov();
              onCapture({
                panoId: p.getPano(),
                heading: Math.round(pov.heading * 10) / 10,
                pitch: Math.round(pov.pitch * 10) / 10,
                fov: Math.round(180 / 2 ** (p.getZoom() ?? 1)),
              });
            }}
          >
            <Camera size={16} />
            Analyze this view
          </button>
        )}
      </div>
    </div>
  );
}
