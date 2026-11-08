"use client";
import { useEffect, useRef, useState } from "react";
import { MASSACHUSETTS_BOUNDS, SelectedAddress } from "@/lib/maps/address";
import { useGoogleMaps } from "./useGoogleMaps";
export interface GeoJsonMapLayer {
  id: string;
  labels?: { position: { lat: number; lng: number }; text: string }[];
  onFeatureClick?: (id: string) => void;
  featureCollection: { type: "FeatureCollection"; features: object[] };
  style?: google.maps.Data.StylingFunction | google.maps.Data.StyleOptions;
}
const NO_LAYERS: GeoJsonMapLayer[] = [];
export function GoogleSiteMap({
  address,
  layers = NO_LAYERS,
  mode = "satellite",
  viewBounds,
}: {
  address: SelectedAddress | null;
  layers?: GeoJsonMapLayer[];
  mode?: "satellite" | "roadmap";
  viewBounds?: { north: number; south: number; east: number; west: number };
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const marker = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const { libraries, error, loading } = useGoogleMaps();
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  useEffect(() => {
    if (!libraries || !host.current) return;
    try {
      const instance = new libraries.maps.Map(host.current, {
        mapId: "DEMO_MAP_ID",
        mapTypeId: "satellite",
        tilt: 0,
        heading: 0,
        zoom: 7,
        center: { lat: 42.2, lng: -71.8 },
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        rotateControl: false,
        gestureHandling: "cooperative",
      });
      map.current = instance;
      instance.fitBounds(MASSACHUSETTS_BOUNDS, 25);
      // Report ready asynchronously: creating the map is an external API side effect.
      const listener = instance.addListener("idle", () => setReady(true));
      return () => {
        listener.remove();
        if (marker.current) marker.current.map = null;
        marker.current = null;
        google.maps.event.clearInstanceListeners(instance);
        map.current = null;
      };
    } catch {
      queueMicrotask(() =>
        setMapError(
          "The satellite map could not initialize. Reload the page or check Maps JavaScript API access.",
        ),
      );
    }
  }, [libraries]);
  useEffect(() => {
    if (!ready || !map.current || !libraries) return;
    if (!address) {
      if (marker.current) marker.current.map = null;
      return;
    }
    const position = { lat: address.latitude, lng: address.longitude };
    map.current.setCenter(position);
    map.current.setZoom(19);
    map.current.setTilt(0);
    map.current.setHeading(0);
    if (!marker.current)
      marker.current = new libraries.marker.AdvancedMarkerElement({
        map: map.current,
        position,
        title: address.formattedAddress,
      });
    else {
      marker.current.position = position;
      marker.current.title = address.formattedAddress;
      marker.current.map = map.current;
    }
  }, [address, ready, libraries]);
  const boundsKey = viewBounds ? JSON.stringify(viewBounds) : "";
  useEffect(() => {
    if (!ready || !map.current) return;
    map.current.setMapTypeId(mode);
    if (boundsKey) map.current.fitBounds(JSON.parse(boundsKey), 35);
  }, [mode, boundsKey, ready]);
  useEffect(() => {
    if (!ready || !map.current || !libraries) return;
    const instance = map.current;
    const overlays = layers.map((layer) => {
      const data = new google.maps.Data({
        map: instance,
        style: layer.style,
      });
      data.addGeoJson(layer.featureCollection);
      const click = data.addListener(
        "click",
        (event: google.maps.Data.MouseEvent) => {
          layer.onFeatureClick?.(String(event.feature.getProperty("gisId")));
        },
      );
      const labels = (layer.labels ?? []).map((label) => {
        const content = document.createElement("span");
        content.className = "contour-map-label";
        content.textContent = label.text;
        return new libraries.marker.AdvancedMarkerElement({
          map: instance,
          position: label.position,
          content,
          title: label.text,
          collisionBehavior:
            google.maps.CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY,
        });
      });
      return { data, click, labels };
    });
    return () =>
      overlays.forEach(({ data, click, labels }) => {
        labels.forEach((label) => {
          label.map = null;
        });
        click.remove();
        data.setMap(null);
      });
  }, [layers, ready, libraries]);
  return (
    <section
      className="google-map-frame"
      aria-label={
        mode === "satellite"
          ? "Google satellite site map"
          : "LiDAR elevation and contours map"
      }
    >
      <div ref={host} className="google-map-canvas" />
      {(loading || (!ready && !error && !mapError)) && (
        <div className="map-loading" role="status">
          Loading satellite map…
        </div>
      )}
      {(error || mapError) && (
        <div className="map-loading map-failure" role="alert">
          <strong>Satellite map unavailable</strong>
          <p>{error ?? mapError}</p>
        </div>
      )}
      <div className="google-map-caption">
        {address
          ? mode === "satellite"
            ? "Google Places address marker. MassGIS overlays are public records requiring verification."
            : "Google basemap and address marker. Elevation contours come from MassGIS LiDAR, not Google imagery."
          : "Massachusetts overview — select a street address to inspect a site."}
      </div>
    </section>
  );
}
