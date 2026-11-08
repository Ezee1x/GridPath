"use client";
import {
  ReactNode,
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { Download, Layers, RotateCw, X } from "lucide-react";
import type { SelectedAddress } from "@/lib/maps/address";
import type { GisFeature, LayerKind, Measurement } from "@/lib/gis/types";
import {
  GoogleSiteMap,
  GeoJsonMapLayer,
} from "@/components/maps/GoogleSiteMap";
import { useSiteGis } from "./useSiteGis";
import { useIntake } from "@/components/intake/useIntake";
import type { GisLayerResult } from "@/lib/gis/types";
import type { EnvironmentBundle } from "@/lib/environment/types";
import { SiteIntelligenceDashboard } from "@/components/intake/SiteIntelligenceDashboard";
import { useEnvironment } from "@/components/environment/useEnvironment";
import {
  EnvironmentSourceStatus,
  TerrainControls,
} from "@/components/environment/EnvironmentControls";
import { EnvironmentFeatureDialog } from "@/components/environment/EnvironmentEvidence";
import type {
  EnvironmentalFeature,
  ContourFeature,
} from "@/lib/environment/types";
import type { SiteAnalysis } from "@/lib/gis/analysis-types";
import Link from "next/link";
import { useWorkspace } from "@/lib/store";
import { savedMapSite } from "@/lib/saved-map-site";
const kinds: LayerKind[] = ["parcels", "buildings", "roads"];
const labels: Record<LayerKind, string> = {
  parcels: "Property boundaries",
  buildings: "Mapped roofprints",
  roads: "Road centerlines",
};
const progress: Record<LayerKind, string> = {
  parcels: "Finding parcel",
  buildings: "Loading buildings",
  roads: "Loading roads",
};
const number = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 1 });
function Area({ value }: { value: Measurement | null }) {
  return value ? (
    <>
      <strong>{number(value.squareFeet)} sq ft</strong>
      <small>
        {number(value.squareMeters)} m² · {number(value.acres)} acres
      </small>
      <small>
        {value.method}
        {value.approximate ? " (approximate)" : ""}
      </small>
    </>
  ) : (
    <>Not available</>
  );
}
function FeatureDetail({
  feature,
  onClose,
  onSelect,
}: {
  feature: GisFeature;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  const p = feature.properties;
  return (
    <dialog
      ref={dialog}
      className="evidence-dialog gis-feature-dialog"
      aria-label="GIS feature details"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="gis-feature-detail">
        <div className="gis-section-heading">
          <span className="eyebrow">Public record / {p.kind}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Close GIS feature details"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <h3>{p.name}</h3>
        <p className="gis-verification">{p.verification}</p>
        <p>{p.association}</p>
        {p.kind === "parcels" && (
          <button
            type="button"
            className="button"
            onClick={() => onSelect(p.id)}
          >
            Use this parcel
          </button>
        )}
        <dl className="location-details">
          <div>
            <dt>Original feature ID</dt>
            <dd>{p.id}</dd>
          </div>
          <div>
            <dt>Record source date</dt>
            <dd>{p.sourceDate ?? "Not available"}</dd>
          </div>
          {p.measurement && (
            <div>
              <dt>Reported / mapped area</dt>
              <dd>
                <Area value={p.measurement} />
              </dd>
            </div>
          )}
          <div>
            <dt>Dataset update (service metadata)</dt>
            <dd>{p.source.datasetUpdated?.slice(0, 10) ?? "Not available"}</dd>
          </div>
        </dl>
        <a
          className="text-link"
          href={`${p.source.url}/${encodeURIComponent(p.id)}`}
          target="_blank"
          rel="noreferrer"
        >
          {p.source.name} ↗
        </a>
        <details>
          <summary>Original GIS attributes</summary>
          <dl className="gis-attributes">
            {Object.entries(p.attributes).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>
                  {v === null || v === ""
                    ? "Not available"
                    : typeof v === "object"
                      ? JSON.stringify(v)
                      : String(v)}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      </section>
    </dialog>
  );
}
export function GisSiteContext({
  address,
  children,
  initialParcelId,
  initialFieldId,
  hideDashboard = false,
  dashboard,
  onContourAction,
}: {
  address: SelectedAddress | null;
  children: ReactNode;
  initialParcelId?: string | null;
  initialFieldId?: string | null;
  hideDashboard?: boolean;
  dashboard?: ReactNode;
  onContourAction?: (action: (() => void) | null) => void;
}) {
  const gis = useSiteGis(address, initialParcelId);
  const { sites, save, warning: saveWarning } = useWorkspace();
  const [saveMessage, setSaveMessage] = useState("");
  const saved = sites.find(
    (s) =>
      !!address &&
      s.mapPlaceId === address.placeId &&
      (s.parcelFeatureId ?? null) === gis.parcelId,
  );
  const publicPoint = gis.layers.parcels.result?.queryLocation;
  const [requested, setRequested] = useState(
    !!initialParcelId || !!initialFieldId,
  );
  const [run, setRun] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<{
    key: string;
    record: SiteAnalysis;
  } | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const collectionKey = `${gis.parcelId ?? "unselected"}:${gis.manual}:${[
    "parcels",
    "buildings",
    "roads",
  ]
    .map((k) => {
      const state = gis.layers[k as LayerKind];
      return state.result?.source.retrievedAt ?? state.status;
    })
    .join("|")}`;
  useEffect(() => {
    if (!requested || !address) return;
    let active = true;
    import("@/lib/gis/analysis")
      .then(({ analyzeSite }) => {
        if (!active) return;
        const parcel =
          gis.layers.parcels.result?.features.find(
            (f) => f.properties.id === gis.parcelId,
          ) ?? null;
        const location = kinds
          .map((kind) => gis.layers[kind].result?.queryLocation)
          .find(Boolean);
        if (address.source === "Google Places" && !location)
          throw new Error(
            "An independent public address location is required for GIS calculations.",
          );
        const record = analyzeSite({
          latitude: location?.latitude ?? address.latitude,
          longitude: location?.longitude ?? address.longitude,
          address: location?.address ?? address.formattedAddress,
          parcel,
          manual: gis.manual,
          layers: {
            parcels: gis.layers.parcels.result,
            buildings: gis.layers.buildings.result,
            roads: gis.layers.roads.result,
          },
          errors: {
            parcels: gis.layers.parcels.error,
            buildings: gis.layers.buildings.error,
            roads: gis.layers.roads.error,
          },
        });
        if (location) record.query.provider = location.provider;
        if (active) {
          setAnalysisResult({ key: collectionKey, record });
          setAnalysisError("");
        }
      })
      .catch(() => {
        if (active)
          setAnalysisError(
            "Geographic analysis could not be calculated. Review source geometry and retry.",
          );
      });
    return () => {
      active = false;
    };
  }, [
    requested,
    run,
    address,
    gis.layers,
    gis.parcelId,
    gis.manual,
    collectionKey,
  ]);
  const analysis =
    analysisResult?.key === collectionKey ? analysisResult.record : null;

  const [visible, setVisible] = useState<Record<LayerKind, boolean>>({
    parcels: true,
    buildings: true,
    roads: true,
  });
  const [inspected, setInspected] = useState<GisFeature | null>(null);
  const selectedParcel =
    gis.layers.parcels.result?.features.find(
      (f) => f.properties.id === gis.parcelId,
    ) ?? null;
  const [mapMode, setMapMode] = useState<"public" | "elevation">("public");
  const [intervalFeet, setIntervalFeet] = useState<1 | 2 | 5 | 10>(5);
  const [wetlandRadius, setWetlandRadius] = useState(250);
  const [terrainBuildings, setTerrainBuildings] = useState(true);
  const [forceDem, setForceDem] = useState(false);
  const [environmentVisible, setEnvironmentVisible] = useState({
    flood: true,
    wetlands: true,
  });
  const [environmentFeature, setEnvironmentFeature] = useState<
    EnvironmentalFeature | ContourFeature | null
  >(null);
  const mapSection = useRef<HTMLDivElement>(null);
  const environment = useEnvironment(
    selectedParcel,
    requested ||
      mapMode === "elevation" ||
      environmentVisible.flood ||
      environmentVisible.wetlands,
    intervalFeet,
    wetlandRadius,
    forceDem,
  );
  const openContours = useCallback(() => {
    setMapMode("elevation");
    setRequested(true);
    mapSection.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  useEffect(() => {
    onContourAction?.(openContours);
    return () => onContourAction?.(null);
  }, [onContourAction, openContours]);
  const mapLayers = useMemo<GeoJsonMapLayer[]>(
    () =>
      kinds
        .filter((k) => visible[k] && gis.layers[k].result)
        .map((kind) => ({
          id: kind,
          featureCollection: {
            type: "FeatureCollection",
            features: gis.layers[kind].result!.features.map((f) => ({
              ...f,
              properties: { gisId: f.properties.id },
            })),
          },
          style: (feature: google.maps.Data.Feature) => ({
            strokeColor:
              kind === "parcels"
                ? "#b87921"
                : kind === "buildings"
                  ? "#287bb5"
                  : "#39805e",
            strokeWeight:
              kind === "parcels" &&
              String(feature.getProperty("gisId")) === gis.parcelId
                ? 3
                : 2,
            fillColor: kind === "buildings" ? "#287bb5" : "#b87921",
            fillOpacity: kind === "buildings" ? 0.14 : 0,
            clickable: true,
            zIndex: kind === "buildings" ? 3 : kind === "parcels" ? 2 : 1,
          }),
          onFeatureClick: (id: string) => {
            const f = gis.layers[kind].result!.features.find(
              (f) => f.properties.id === id,
            );
            if (f) setInspected(f);
          },
        })),
    [visible, gis.layers, gis.parcelId],
  );
  const roofs = gis.layers.buildings.result?.features ?? [];
  const associated = selectedParcel
    ? roofs.filter(
        (f) =>
          f.properties.association ===
          "Within selected parcel — unverified association",
      )
    : [];
  const crossing = roofs.filter(
    (f) =>
      f.properties.association === "Crosses parcel boundary — review required",
  );
  const displayLayers = useMemo<GeoJsonMapLayer[]>(() => {
    if (mapMode === "public") {
      const result = [...mapLayers];
      for (const kind of ["flood", "wetlands"] as const) {
        const data = environment.bundle[kind];
        if (!environmentVisible[kind] || !data) continue;
        result.push({
          id: `environment-${kind}`,
          featureCollection: {
            type: "FeatureCollection",
            features: data.features.map((f) => ({
              ...f,
              properties: { gisId: f.properties.id },
            })),
          },
          style: {
            strokeColor: kind === "flood" ? "#666e9a" : "#3d7d76",
            strokeWeight: 1.5,
            fillColor: kind === "flood" ? "#767fae" : "#4a9388",
            fillOpacity: 0.17,
          },
          onFeatureClick: (id) => {
            const f = data.features.find((f) => f.properties.id === id);
            if (f) setEnvironmentFeature(f);
          },
        });
      }
      return result;
    }
    const result: GeoJsonMapLayer[] = [];
    if (selectedParcel)
      result.push({
        id: "terrain-parcel",
        featureCollection: {
          type: "FeatureCollection",
          features: [
            {
              ...selectedParcel,
              properties: { gisId: selectedParcel.properties.id },
            },
          ],
        },
        style: { strokeColor: "#ae7120", strokeWeight: 3, fillOpacity: 0 },
        onFeatureClick: () => setInspected(selectedParcel),
      });
    if (terrainBuildings) {
      const buildings = gis.layers.buildings.result?.features ?? [];
      result.push({
        id: "terrain-buildings",
        featureCollection: {
          type: "FeatureCollection",
          features: buildings.map((f) => ({
            ...f,
            properties: { gisId: f.properties.id },
          })),
        },
        style: { strokeColor: "#287bb5", strokeWeight: 2, fillOpacity: 0 },
        onFeatureClick: (id: string) => {
          const feature = buildings.find((f) => f.properties.id === id);
          if (feature) setInspected(feature);
        },
      });
    }
    const terrain = environment.elevation.data;
    if (terrain?.contours.status === "ready") {
      const lines = terrain.contours.features;
      const byLevel = new Map<number, ContourFeature>();
      for (const f of lines) {
        const old = byLevel.get(f.properties.elevationFeet);
        const length = (c: ContourFeature) =>
          c.geometry.type === "LineString"
            ? c.geometry.coordinates.length
            : c.geometry.coordinates.reduce((n, l) => n + l.length, 0);
        if (!old || length(f) > length(old))
          byLevel.set(f.properties.elevationFeet, f);
      }
      const labelLines = [...byLevel.values()].filter(
        (_, i, array) => i % Math.max(1, Math.ceil(array.length / 24)) === 0,
      );
      result.push({
        id: "lidar-contours",
        featureCollection: {
          type: "FeatureCollection",
          features: lines.map((f) => ({
            ...f,
            properties: {
              gisId: f.properties.id,
              elevationFeet: f.properties.elevationFeet,
            },
          })),
        },
        style: (feature) => ({
          strokeColor: "#735a37",
          strokeOpacity: 0.9,
          strokeWeight:
            Number(feature.getProperty("elevationFeet")) %
              (intervalFeet * 5) ===
            0
              ? 2
              : 1,
        }),
        labels: labelLines.map((f) => {
          const parts =
            f.geometry.type === "LineString"
              ? [f.geometry.coordinates]
              : f.geometry.coordinates;
          const line = [...parts].sort((a, b) => b.length - a.length)[0],
            p = line[Math.floor(line.length / 2)];
          return {
            position: { lng: p[0], lat: p[1] },
            text: `${f.properties.elevationFeet} ft`,
          };
        }),
        onFeatureClick: (id) => {
          const f = lines.find((f) => f.properties.id === id);
          if (f) setEnvironmentFeature(f);
        },
      });
    }
    return result;
  }, [
    mapMode,
    mapLayers,
    environment.bundle,
    environmentVisible,
    selectedParcel,
    terrainBuildings,
    gis.layers.buildings.result?.features,
    environment.elevation.data,
    intervalFeet,
  ]);
  const terrainBounds =
    mapMode === "elevation" ? environment.elevation.data?.bounds : null;
  const streets = [
    ...new Set(
      gis.layers.roads.result?.features.map((f) => f.properties.name) ?? [],
    ),
  ];
  const available = kinds.filter((k) => gis.layers[k].status === "ready");
  function selectParcel(id: string) {
    setInspected(null);
    gis.selectParcel(id);
  }
  function exportGis() {
    const record = {
      type: "QORE ProjectSync public GIS context",
      generatedAt: new Date().toISOString(),
      verification:
        "Public records and unverified associations; not engineer verified",
      selectedParcelId: gis.parcelId,
      parcelSelection: gis.manual
        ? "User selected — unverified"
        : "Point/address match — unverified",
      layers: Object.fromEntries(kinds.map((k) => [k, gis.layers[k].result])),
      errors: Object.fromEntries(kinds.map((k) => [k, gis.layers[k].error])),
      notice:
        "Assessment parcel boundaries are not legal survey boundaries. Roofprints are not usable floor area. Roads do not establish site access.",
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(record, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "qore-public-gis-context.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="site-intelligence-experience">
      <div className="satellite-workspace-grid">
        <div className="gis-map-column" ref={mapSection}>
          <div
            className="map-view-tabs"
            role="tablist"
            aria-label="Site map views"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mapMode === "public"}
              aria-controls="site-map-panel"
              onClick={() => setMapMode("public")}
            >
              Public GIS Layers
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mapMode === "elevation"}
              aria-controls="site-map-panel"
              onClick={openContours}
            >
              Elevation & Contours
            </button>
          </div>
          {mapMode === "public" ? (
            <div className="gis-map-toolbar">
              <span>
                <Layers size={15} /> Public GIS layers
              </span>
              <div>
                {kinds.map((k) => (
                  <label key={k}>
                    <input
                      type="checkbox"
                      checked={visible[k]}
                      onChange={(e) =>
                        setVisible((old) => ({ ...old, [k]: e.target.checked }))
                      }
                    />
                    <i className={`gis-swatch ${k}`} />
                    {labels[k]}
                  </label>
                ))}
                {(["flood", "wetlands"] as const).map((kind) => (
                  <label key={kind}>
                    <input
                      type="checkbox"
                      checked={environmentVisible[kind]}
                      onChange={(e) =>
                        setEnvironmentVisible((old) => ({
                          ...old,
                          [kind]: e.target.checked,
                        }))
                      }
                    />
                    {kind === "flood"
                      ? "FEMA Flood Hazards"
                      : "MassDEP Wetlands"}
                  </label>
                ))}
                <label>
                  Wetlands search
                  <select
                    aria-label="Wetlands surrounding distance"
                    value={wetlandRadius}
                    onChange={(e) => setWetlandRadius(Number(e.target.value))}
                  >
                    {[100, 250, 500].map((v) => (
                      <option key={v} value={v}>
                        {v} m
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ) : (
            <TerrainControls
              state={environment.elevation}
              interval={intervalFeet}
              setInterval={setIntervalFeet}
              buildings={terrainBuildings}
              setBuildings={setTerrainBuildings}
              forceDem={forceDem}
              setForceDem={setForceDem}
            />
          )}
          <div
            id="site-map-panel"
            role="tabpanel"
            aria-label={
              mapMode === "public"
                ? "Public GIS Layers map"
                : "Elevation & Contours map"
            }
          >
            <GoogleSiteMap
              address={address}
              layers={displayLayers}
              mode={mapMode === "elevation" ? "roadmap" : "satellite"}
              viewBounds={
                terrainBounds
                  ? {
                      west: terrainBounds[0],
                      south: terrainBounds[1],
                      east: terrainBounds[2],
                      north: terrainBounds[3],
                    }
                  : undefined
              }
            />
          </div>
          {mapMode === "elevation" && (
            <button className="text-link" onClick={() => setMapMode("public")}>
              Return to Public GIS Layers
            </button>
          )}
          <EnvironmentSourceStatus
            flood={environment.flood}
            wetlands={environment.wetlands}
            elevation={environment.elevation}
            hasParcel={!!selectedParcel}
          />

          <p className="gis-map-note">
            MassGIS assessment boundaries are not legal survey boundaries. Click
            a feature or use the lists to inspect its public record.
          </p>
          {address && (
            <div className="gis-operation-grid" aria-live="polite">
              {kinds.map((k) => (
                <div key={k}>
                  <strong>{labels[k]}</strong>
                  <span>
                    {gis.layers[k].status === "loading"
                      ? progress[k]
                      : gis.layers[k].status === "ready"
                        ? `${gis.layers[k].result!.features.length} public features retrieved`
                        : gis.layers[k].status === "error"
                          ? "Retrieval failed"
                          : "Waiting for parcel lookup"}
                  </span>
                  {gis.layers[k].error && (
                    <p role="alert">{gis.layers[k].error}</p>
                  )}
                  {gis.layers[k].status !== "loading" && (
                    <button
                      className="text-link"
                      type="button"
                      onClick={() => gis.retry(k)}
                    >
                      <RotateCw size={12} />
                      Retry {k}
                    </button>
                  )}
                </div>
              ))}
              <div>
                <strong>Geographic measurements</strong>
                <span>
                  {[
                    gis.layers.parcels.status,
                    gis.layers.buildings.status,
                  ].includes("loading")
                    ? "Calculating geographic measurements"
                    : available.includes("parcels") ||
                        available.includes("buildings")
                      ? "Available source areas and approximate geometry areas normalized"
                      : "Waiting for geometry"}
                </span>
              </div>
            </div>
          )}
          {environmentFeature && (
            <EnvironmentFeatureDialog
              feature={environmentFeature}
              onClose={() => setEnvironmentFeature(null)}
            />
          )}
          {inspected && (
            <FeatureDetail
              feature={inspected}
              onClose={() => setInspected(null)}
              onSelect={selectParcel}
            />
          )}
        </div>
        <aside className="site-location-panel">
          <section className="map-context-controls">
            <h2>Selected property</h2>
            <p>
              {address?.formattedAddress ??
                "Select a Massachusetts street address."}
            </p>
            <label className="input-label" htmlFor="map-parcel-choice">
              Parcel selection
            </label>
            <select
              id="map-parcel-choice"
              value={gis.parcelId ?? ""}
              onChange={(e) => {
                if (e.target.value) selectParcel(e.target.value);
              }}
            >
              <option value="">Choose the intended parcel</option>
              {gis.parcelId && !selectedParcel && (
                <option value={gis.parcelId}>
                  Selected parcel {gis.parcelId} ·{" "}
                  {gis.layers.parcels.status === "ready"
                    ? "not returned"
                    : "loading"}
                </option>
              )}
              {gis.layers.parcels.result?.features.map((f) => (
                <option key={f.properties.id} value={f.properties.id}>
                  {String(
                    f.properties.attributes.MAP_PAR_ID ??
                      f.properties.attributes.LOC_ID ??
                      f.properties.id,
                  )}{" "}
                  · {f.properties.name} · feature {f.properties.id}
                </option>
              ))}
            </select>
            <p>
              {gis.parcelId &&
              !selectedParcel &&
              gis.layers.parcels.status === "ready"
                ? "Your parcel selection is retained, but this lookup did not return it. Retry parcels or select another candidate."
                : gis.manual
                  ? "Manually selected candidate — needs verification"
                  : (gis.layers.parcels.result?.matchMessage ??
                    "Waiting for parcel records.")}
            </p>
            {selectedParcel && (
              <button
                className="text-link"
                type="button"
                onClick={() => setInspected(selectedParcel)}
              >
                Inspect selected parcel & source
              </button>
            )}
            <button
              className="button primary"
              type="button"
              disabled={
                !address ||
                gis.layers.parcels.status === "loading" ||
                gis.layers.parcels.status === "idle"
              }
              onClick={() => {
                setRequested(true);
                setRun((n) => n + 1);
              }}
            >
              Analyze Site
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={
                !address ||
                !publicPoint ||
                gis.layers.parcels.status !== "ready"
              }
              onClick={() => {
                if (!address || !publicPoint) return;
                save(
                  savedMapSite(
                    address.placeId,
                    publicPoint,
                    gis.parcelId,
                    saved,
                  ),
                );
                setRequested(true);
                setSaveMessage("Site record saved in this browser.");
              }}
            >
              {saved ? "Update saved record" : "Save site record"}
            </button>
            {saved && (
              <Link className="text-link" href={`/sites/${saved.id}`}>
                Open saved record
              </Link>
            )}
            {saveMessage && saved && (
              <p role="status">{saveWarning || saveMessage}</p>
            )}
            <p className="muted">
              Uses the public GIS records already loaded on this map. GIS
              matching uses an independent U.S. Census address point; the Google
              map marker is unchanged.
            </p>
          </section>
          <details className="gis-records-details">
            <summary>Address & original GIS records</summary>
            {children}
            <section className="gis-panel-section">
              <h3>Property</h3>
              <p>
                {gis.layers.parcels.result?.matchMessage ??
                  (address
                    ? gis.layers.parcels.status === "error"
                      ? "Parcel lookup unavailable. Retry parcels; the Google address remains selected."
                      : "Finding parcel…"
                    : "Select a Massachusetts address to collect public records.")}
              </p>
              {gis.layers.parcels.result && (
                <>
                  <label className="input-label" htmlFor="gis-parcel-choice">
                    Candidate parcel / manual selection
                  </label>
                  <select
                    id="gis-parcel-choice"
                    value={gis.parcelId ?? ""}
                    onChange={(e) => {
                      if (e.target.value) selectParcel(e.target.value);
                    }}
                  >
                    <option value="">Select the correct parcel</option>
                    {gis.parcelId && !selectedParcel && (
                      <option value={gis.parcelId}>
                        Selected parcel {gis.parcelId} · not returned
                      </option>
                    )}
                    {gis.layers.parcels.result.features.map((f) => (
                      <option key={f.properties.id} value={f.properties.id}>
                        {String(
                          f.properties.attributes.MAP_PAR_ID ?? f.properties.id,
                        )}{" "}
                        · {f.properties.name}
                        {f.properties.containsPoint ? " · contains point" : ""}
                      </option>
                    ))}
                  </select>
                  <p>
                    {gis.manual
                      ? "User-selected parcel — needs verification"
                      : selectedParcel
                        ? "Point/address match — needs verification"
                        : "No parcel selected. Nearby roofprints will not be counted as site buildings."}
                  </p>
                </>
              )}
              {selectedParcel && (
                <>
                  <button
                    type="button"
                    className="gis-record-link"
                    onClick={() => setInspected(selectedParcel)}
                  >
                    Inspect parcel{" "}
                    {String(
                      selectedParcel.properties.attributes.MAP_PAR_ID ??
                        selectedParcel.properties.id,
                    )}{" "}
                    ↗
                  </button>
                  <div className="gis-area">
                    <Area value={selectedParcel.properties.measurement} />
                  </div>
                  {selectedParcel.properties.measurement?.method.startsWith(
                    "Assessor",
                  ) &&
                    selectedParcel.properties.geometryArea && (
                      <details className="gis-area">
                        <summary>Compare approximate polygon area</summary>
                        <Area value={selectedParcel.properties.geometryArea} />
                        <small>
                          Reported assessment lot area and mapped geometry may
                          differ. Review discrepancies before engineering use.
                        </small>
                      </details>
                    )}
                  <small>
                    {selectedParcel.properties.source.name} · record date{" "}
                    {selectedParcel.properties.sourceDate ?? "Not available"}
                  </small>
                </>
              )}
            </section>
            <section className="gis-panel-section">
              <h3>Buildings / mapped roofprints</h3>
              <p>
                {gis.layers.buildings.status === "loading"
                  ? "Loading mapped roofprints…"
                  : gis.layers.buildings.status === "error"
                    ? "Mapped roofprints unavailable. Retry buildings."
                    : selectedParcel
                      ? `${associated.length} contained mapped roofprints · ${crossing.length} crossing boundaries (review required)`
                      : "Association needs verification — select a parcel."}
              </p>
              <div className="gis-feature-list">
                {roofs.map((f) => (
                  <button
                    type="button"
                    key={f.properties.id}
                    onClick={() => setInspected(f)}
                  >
                    <strong>{f.properties.name}</strong>
                    <span>
                      {f.properties.measurement
                        ? `${number(f.properties.measurement.squareFeet)} sq ft`
                        : "Area not available"}
                    </span>
                    <small>{f.properties.association}</small>
                  </button>
                ))}
              </div>
              {selectedParcel && gis.layers.buildings.status === "ready" && (
                <div className="gis-area">
                  <strong>Total contained retrieved roofprint area</strong>
                  <span>
                    {associated.every((f) => f.properties.measurement)
                      ? `${number(associated.reduce((sum, f) => sum + f.properties.measurement!.squareFeet, 0))} sq ft`
                      : "Not available — incomplete measurements"}
                  </span>
                  <small>
                    Sum of contained structures only. Boundary-crossing
                    structures excluded. No usable interior area, height or
                    structural capacity established.
                  </small>
                </div>
              )}
            </section>
            <section className="gis-panel-section">
              <h3>Roads</h3>
              <p>
                {gis.layers.roads.status === "ready"
                  ? `${streets.length} nearby mapped street names`
                  : "Road data not available yet"}
              </p>
              <div className="gis-feature-list">
                {gis.layers.roads.result?.features.map((f) => (
                  <button
                    key={f.properties.id}
                    type="button"
                    onClick={() => setInspected(f)}
                  >
                    {f.properties.name}
                    <small>Public centerline · access not evaluated</small>
                  </button>
                ))}
              </div>
            </section>
            <section className="gis-panel-section">
              <h3>Data quality</h3>
              <p>
                {available.length} of 3 public datasets retrieved. Parcel and
                structure associations remain unverified. Missing values remain
                unknown.
              </p>
              <button
                type="button"
                className="button"
                disabled={!available.length}
                onClick={exportGis}
              >
                <Download size={14} />
                Export GIS context
              </button>
            </section>
            <section className="engineering-location-status">
              <h3>Battery Installation — Preliminary Site Context</h3>
              <dl>
                {[
                  [
                    "Mapped parcel geometry available",
                    selectedParcel
                      ? "Yes — needs verification"
                      : "Not confirmed",
                  ],
                  [
                    "Building roofprints available",
                    gis.layers.buildings.status === "ready"
                      ? associated.length
                        ? "Yes — mapped association only"
                        : "No associated roofprints confirmed"
                      : "Not retrieved",
                  ],
                  [
                    "Nearby roads mapped",
                    gis.layers.roads.status === "ready"
                      ? streets.length
                        ? "Yes — access not evaluated"
                        : "No features returned"
                      : "Not retrieved",
                  ],
                  ["Potential installation space", "Not yet assessed"],
                  ["Existing service voltage", "Unknown"],
                  ["Transformer capacity", "Unknown"],
                  ["Point of interconnection", "Not verified"],
                  ["Electrical single-line diagram", "Required"],
                  ["Utility load data", "Required"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <p>
                GIS and satellite context do not verify electrical equipment,
                clearances, construction access or installation feasibility.
              </p>
            </section>
          </details>
        </aside>
      </div>
      {requested && !analysis && !analysisError && (
        <p className="notice" role="status">
          Preparing site intelligence from current source results…
        </p>
      )}
      {analysisError && (
        <p className="notice" role="alert">
          {analysisError}
        </p>
      )}
      {analysis &&
        address &&
        (hideDashboard ? (
          <GisRecordCollector
            analysis={analysis}
            address={address}
            environment={environment.bundle}
            layers={{
              parcels: gis.layers.parcels.result,
              roads: gis.layers.roads.result,
            }}
          />
        ) : (
          <SiteIntelligenceDashboard
            initialFieldId={initialFieldId}
            key={JSON.stringify([
              address.placeId,
              analysis.parcel.featureId,
              initialFieldId,
            ])}
            analysis={analysis}
            address={address}
            environment={environment.bundle}
            onViewContours={openContours}
            layers={{
              parcels: gis.layers.parcels.result,
              roads: gis.layers.roads.result,
            }}
          />
        ))}
      {dashboard}
      <section className="gis-sources">
        <h3>Public sources & dataset dates</h3>
        {available.length ? (
          available.map((k) => {
            const s = gis.layers[k].result!.source;
            return (
              <div key={k}>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.name} ↗
                </a>
                <span>
                  Service data update:{" "}
                  {s.datasetUpdated?.slice(0, 10) ?? "Not available"} · native
                  EPSG:{s.nativeWkid ?? "unknown"} → WGS84
                </span>
                <small>
                  Retrieved {s.retrievedAt.replace("T", " ").slice(0, 19)} UTC.
                  Record dates may be older; service updates are not imagery
                  capture dates.
                </small>
                {gis.layers[k].result!.warnings.map((w) => (
                  <p className="notice" key={w}>
                    {w}
                  </p>
                ))}
              </div>
            );
          })
        ) : (
          <p>
            Sources appear after retrieval. No GIS evidence has been retrieved
            yet.
          </p>
        )}
        <small>
          MassGIS, Commonwealth of Massachusetts and dataset contributors.
          Jurisdiction check: U.S. Census Bureau TIGERweb state boundary.
        </small>
      </section>
    </div>
  );
}

function GisRecordCollector({
  analysis,
  address,
  layers,
  environment,
}: {
  analysis: SiteAnalysis;
  address: SelectedAddress;
  layers: { parcels: GisLayerResult | null; roads: GisLayerResult | null };
  environment: EnvironmentBundle;
}) {
  useIntake(analysis, address, layers, environment);
  return null;
}
