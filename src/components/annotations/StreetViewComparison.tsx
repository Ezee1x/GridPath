"use client";
import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/maps/google-maps";
import { fromImagePixel, toImagePixel } from "@/lib/annotations/aerial";
import type { SiteAnalysis, NormalizedBox } from "@/lib/annotations/types";
import {
  StreetViewExplorer,
  type StreetViewPosition,
} from "./StreetViewExplorer";

/** Google panorama positions remain transient and appear only on a Google map. */
export function StreetViewComparison({
  analysis,
  address,
  location,
  selectedId,
  drawMode,
  onSelect,
  onDraw,
}: {
  analysis: SiteAnalysis;
  address: string;
  location: { lat: number; lng: number } | null;
  selectedId: string | null;
  drawMode: boolean;
  onSelect: (id: string) => void;
  onDraw: (box: NormalizedBox) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const camera = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const arrow = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [position, setPosition] = useState<StreetViewPosition | null>(null);
  const [drawHint, setDrawHint] = useState("");
  const corner = useRef<{ lat: number; lng: number } | null>(null);
  const current = useRef({ analysis, drawMode, onSelect, onDraw });
  useEffect(() => {
    current.current = { analysis, drawMode, onSelect, onDraw };
  }, [analysis, drawMode, onSelect, onDraw]);
  useEffect(() => {
    corner.current = null;
  }, [drawMode, analysis.id]);
  useEffect(() => {
    let cancelled = false;
    let click: google.maps.MapsEventListener | undefined;
    loadGoogleMaps()
      .then((libs) => {
        if (cancelled || !host.current) return;
        const a = current.current.analysis,
          v = a.image.aerial!;
        const instance = new libs.maps.Map(host.current, {
          mapId: "DEMO_MAP_ID",
          center: { lat: v.lat, lng: v.lng },
          zoom: v.zoom,
          mapTypeId: "satellite",
          tilt: 0,
          heading: 0,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
          gestureHandling: "cooperative",
        });
        map.current = instance;
        const nw = fromImagePixel(v, 0, 0, a.image),
          se = fromImagePixel(v, a.image.width, a.image.height, a.image);
        instance.fitBounds(
          { north: nw.lat, west: nw.lng, south: se.lat, east: se.lng },
          24,
        );
        const content = document.createElement("div");
        content.className = "street-position-marker";
        content.setAttribute(
          "aria-label",
          "Street View camera position and viewing direction",
        );
        content.innerHTML =
          '<span class="street-heading-arrow"></span><span class="street-camera-dot"></span>';
        arrow.current = content;
        camera.current = new libs.marker.AdvancedMarkerElement({
          map: instance,
          content,
          title: "Street View position",
          anchorLeft: "-50%",
          anchorTop: "-50%",
          zIndex: 1000,
        });
        click = instance.addListener(
          "click",
          (event: google.maps.MapMouseEvent) => {
            const { analysis: a, drawMode, onDraw } = current.current;
            if (!drawMode || !event.latLng || !a.image.aerial) return;
            const point = event.latLng.toJSON();
            const pixel = toImagePixel(
              a.image.aerial,
              point.lat,
              point.lng,
              a.image,
            );
            if (
              pixel.x < 0 ||
              pixel.y < 0 ||
              pixel.x > a.image.width ||
              pixel.y > a.image.height
            ) {
              corner.current = null;
              setDrawHint("Choose corners within the original analyzed area.");
              return;
            }
            if (!corner.current) {
              corner.current = point;
              setDrawHint("First corner selected. Click the opposite corner.");
              return;
            }
            const first = toImagePixel(
              a.image.aerial,
              corner.current.lat,
              corner.current.lng,
              a.image,
            );
            const last = toImagePixel(
              a.image.aerial,
              point.lat,
              point.lng,
              a.image,
            );
            const clamp = (n: number) => Math.max(0, Math.min(1, n));
            const x1 = clamp(first.x / a.image.width),
              x2 = clamp(last.x / a.image.width);
            const y1 = clamp(first.y / a.image.height),
              y2 = clamp(last.y / a.image.height);
            corner.current = null;
            setDrawHint("");
            if (Math.abs(x1 - x2) > 0.002 && Math.abs(y1 - y2) > 0.002)
              onDraw([
                Math.min(x1, x2),
                Math.min(y1, y2),
                Math.max(x1, x2),
                Math.max(y1, y2),
              ]);
          },
        );
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setError("The Google comparison map could not load.");
      });
    return () => {
      cancelled = true;
      click?.remove();
      if (camera.current) camera.current.map = null;
      if (map.current) google.maps.event.clearInstanceListeners(map.current);
      map.current = null;
      camera.current = null;
      arrow.current = null;
    };
  }, []);
  useEffect(() => {
    if (!ready || !map.current || !analysis.image.aerial) return;
    const v = analysis.image.aerial;
    const data = new google.maps.Data({
      map: map.current,
      style: (feature) => ({
        strokeColor:
          feature.getProperty("gisId") === selectedId ? "#326b60" : "#ffffff",
        strokeWeight: 2,
        fillOpacity: 0,
        clickable: !drawMode,
        zIndex: 5,
      }),
    });
    analysis.annotations
      .filter((a) => !a.hidden)
      .forEach((a) => {
        const point = (x: number, y: number) =>
          fromImagePixel(
            v,
            x * analysis.image.width,
            y * analysis.image.height,
            analysis.image,
          );
        const points = [
          point(a.box[0], a.box[1]),
          point(a.box[2], a.box[1]),
          point(a.box[2], a.box[3]),
          point(a.box[0], a.box[3]),
        ];
        data.addGeoJson({
          type: "Feature",
          properties: { gisId: a.id },
          geometry: {
            type: "Polygon",
            coordinates: [[...points, points[0]].map((p) => [p.lng, p.lat])],
          },
        });
      });
    const labels: google.maps.marker.AdvancedMarkerElement[] = [];
    let disposed = false;
    loadGoogleMaps().then((libs) => {
      if (disposed || !map.current) return;
      analysis.annotations.forEach((a, i) => {
        if (a.hidden) return;
        const content = document.createElement("button");
        content.type = "button";
        content.className = `comparison-callout ${selectedId === a.id ? "selected" : ""}`;
        content.textContent = `E${i + 1} ${a.label}`;
        content.onclick = () => current.current.onSelect(a.id);
        labels.push(
          new libs.marker.AdvancedMarkerElement({
            map: map.current,
            position: fromImagePixel(v, a.box[0], a.box[1], analysis.image),
            content,
            title: content.textContent,
            collisionBehavior:
              google.maps.CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY,
            zIndex: selectedId === a.id ? 999 : 100 - i,
          }),
        );
      });
    });
    const listener = data.addListener(
      "click",
      (event: google.maps.Data.MouseEvent) =>
        current.current.onSelect(String(event.feature.getProperty("gisId"))),
    );
    return () => {
      disposed = true;
      listener.remove();
      data.setMap(null);
      labels.forEach((l) => (l.map = null));
    };
  }, [ready, analysis, selectedId, drawMode]);
  useEffect(() => {
    if (!ready || !camera.current || !map.current) return;
    camera.current.position = position ?? undefined;
    if (position) {
      camera.current.title = `Street View camera: ${position.lat.toFixed(6)}, ${position.lng.toFixed(6)} · ${Math.round(position.heading)}°`;
      arrow.current?.style.setProperty(
        "--camera-heading",
        `${position.heading}deg`,
      );
      if (!map.current.getBounds()?.contains(position))
        map.current.panTo(position);
    }
  }, [ready, position]);
  return (
    <div className="street-comparison">
      <section aria-label="Annotated satellite map with live Street View indicator">
        <h3>Annotated map</h3>
        <p className="muted">
          Google satellite · annotations from public aerial analysis
        </p>
        <div className="comparison-map" ref={host} />
        {error && <p role="alert">{error}</p>}
        {!ready && !error && (
          <p role="status">Loading annotated comparison map…</p>
        )}
        <p>
          {drawMode
            ? drawHint ||
              "Click two opposite corners inside the analyzed area to add an annotation."
            : "Select a tag to edit it. The blue arrow shows your Street View camera and viewing direction."}
        </p>
        {position && (
          <small className="street-camera-coordinates">
            Camera: {position.lat.toFixed(6)}, {position.lng.toFixed(6)} ·{" "}
            {Math.round(position.heading)}°
          </small>
        )}
      </section>
      <section aria-label="Street View beside annotated map">
        <h3>Street View</h3>
        <p className="muted">
          Move along the street or turn to update the blue arrow.
        </p>
        <StreetViewExplorer
          address={address}
          location={location}
          analysisPermitted={false}
          busy={false}
          onCapture={() => undefined}
          onPositionChange={setPosition}
        />
        <p className="muted">
          Position is session-only and is not saved in the engineering record.
        </p>
      </section>
    </div>
  );
}
