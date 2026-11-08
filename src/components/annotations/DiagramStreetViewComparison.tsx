"use client";
import { useState, type ReactNode } from "react";
import {
  StreetViewExplorer,
  type StreetViewCapture,
  type StreetViewPosition,
} from "./StreetViewExplorer";

/** This workspace's operator confirmed permission for the combined display. */
export function DiagramStreetViewComparison({
  address,
  location,
  diagram,
  analysisPermitted = false,
  busy = false,
  onCapture = () => undefined,
  moveTarget,
}: {
  analysisPermitted?: boolean;
  busy?: boolean;
  onCapture?: (view: StreetViewCapture) => void;
  address: string;
  location: { lat: number; lng: number } | null;
  diagram: (position: StreetViewPosition | null) => ReactNode;
  moveTarget?: { lat: number; lng: number; id: number } | null;
}) {
  const [position, setPosition] = useState<StreetViewPosition | null>(null);
  return (
    <div className="street-comparison diagram-street-comparison">
      <section aria-label="Original annotated aerial diagram">
        <h3>Annotated diagram</h3>
        <p className="muted">
          Original image and annotations · blue arrow shows the Street View
          camera
        </p>
        {diagram(position)}
        {position && (
          <small className="street-camera-coordinates">
            Camera: {position.lat.toFixed(6)}, {position.lng.toFixed(6)} ·{" "}
            {Math.round(position.heading)}°
          </small>
        )}
      </section>
      <section aria-label="Street View beside annotated diagram">
        <h3>Street View</h3>
        <p className="muted">
          Move along the street or turn to update the blue arrow.
        </p>
        <StreetViewExplorer
          address={address}
          location={location}
          analysisPermitted={analysisPermitted}
          busy={busy}
          onCapture={onCapture}
          onPositionChange={setPosition}
          authorizedComparison
          moveTarget={moveTarget}
        />
      </section>
    </div>
  );
}
