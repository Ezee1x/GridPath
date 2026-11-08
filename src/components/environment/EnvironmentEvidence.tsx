"use client";
import { useEffect, useRef } from "react";
import type {
  EnvironmentalFeature,
  ContourFeature,
} from "@/lib/environment/types";
export function EnvironmentFeatureDialog({
  feature,
  onClose,
}: {
  feature: EnvironmentalFeature | ContourFeature;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  const contour =
      feature.geometry.type === "LineString" ||
      feature.geometry.type === "MultiLineString",
    c = (feature as ContourFeature).properties,
    e = (feature as EnvironmentalFeature).properties;
  return (
    <dialog
      ref={dialog}
      className="evidence-dialog"
      aria-label="Environmental source feature"
      onCancel={onClose}
    >
      <div className="intake-dialog-heading">
        <h2>{contour ? `${c.elevationFeet} ft contour` : e.name}</h2>
        <button className="button" onClick={onClose}>
          Close source feature
        </button>
      </div>
      <p>
        {contour
          ? c.method === "official-vectors"
            ? "MassGIS official vector contour"
            : "MassGIS LiDAR DEM — generated isoline"
          : e.provider}
      </p>
      <dl className="location-details">
        <div>
          <dt>Source feature / generated isoline ID</dt>
          <dd>{feature.properties.id}</dd>
        </div>
        {contour && (
          <>
            <div>
              <dt>Elevation</dt>
              <dd>
                {c.elevationFeet} ft / {c.elevationMeters.toFixed(3)} m
              </dd>
            </div>
            <div>
              <dt>Method</dt>
              <dd>{c.method}</dd>
            </div>
          </>
        )}
        {!contour &&
          Object.entries(e.attributes)
            .filter(([, v]) => v !== null)
            .map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{String(v)}</dd>
              </div>
            ))}
      </dl>
      <a href={feature.properties.sourceUrl} target="_blank" rel="noreferrer">
        Open actual source ↗
      </a>
      <p>
        Preliminary mapped context. Not an engineering, flood-regulatory or
        wetlands determination.
      </p>
    </dialog>
  );
}
