"use client";
import { useRef, useState } from "react";
import { ExternalLink, Locate, Minus, Plus, ScanSearch } from "lucide-react";
import {
  MapFeature,
  MapFeatureKind,
  SiteContext,
} from "@/lib/annotations/types";
import {
  AERIAL_DEFAULT_ZOOM,
  AERIAL_MIN_ZOOM,
  AERIAL_SIZE,
  AerialView,
  aerialImageUrl,
  fromImagePixel,
  metersPerPixel,
  providerFor,
  toImagePixel,
} from "@/lib/annotations/aerial";

type Layer = "parcel" | "power" | "buildings";
const LAYER_LABELS: Record<Layer, string> = {
  parcel: "Parcel",
  power: "Power infrastructure",
  buildings: "Buildings",
};
const POWER: MapFeatureKind[] = [
  "transmission-line",
  "distribution-line",
  "substation",
  "transformer",
  "pole",
  "tower",
  "switch",
];
const { width: W, height: H } = AERIAL_SIZE;

/** A scale bar length that is a round number of meters. */
function scaleBar(lat: number, zoom: number) {
  const mpp = metersPerPixel(lat, zoom);
  const target = mpp * 120;
  const step =
    [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find(
      (s) => s >= target * 0.6,
    ) ?? 1000;
  return { meters: step, px: step / mpp };
}

export function AerialPlan({
  context,
  view,
  onViewChange,
  onAnalyze,
  busy,
}: {
  context: SiteContext;
  view: AerialView;
  onViewChange: (view: AerialView) => void;
  onAnalyze: () => void;
  busy: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [layers, setLayers] = useState<Record<Layer, boolean>>({
    parcel: true,
    power: true,
    buildings: false,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{
    x0: number;
    y0: number;
    k: number;
    dx: number;
    dy: number;
  } | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const src = aerialImageUrl(view);
  const provider = providerFor(view.lat, view.lng);
  const site = context.location!;
  const project = (p: [number, number]) => toImagePixel(view, p[1], p[0]);
  const path = (pts: [number, number][], close = false) =>
    pts
      .map((p, i) => {
        const q = project(p);
        return `${i ? "L" : "M"}${q.x.toFixed(1)},${q.y.toFixed(1)}`;
      })
      .join("") + (close ? "Z" : "");

  const zoomTo = (zoom: number) =>
    onViewChange({
      ...view,
      zoom: Math.min(provider.maxZoom, Math.max(AERIAL_MIN_ZOOM, zoom)),
    });

  const features = context.features.filter((f) =>
    f.kind === "building"
      ? layers.buildings
      : layers.power && POWER.includes(f.kind),
  );
  const visible = features.filter((f) => {
    const pts = f.path ?? (f.point ? [f.point] : []);
    return pts.some((p) => {
      const q = project(p);
      return q.x > -50 && q.x < W + 50 && q.y > -50 && q.y < H + 50;
    });
  });
  const picked = context.features.find((f) => f.id === selected) ?? null;
  const here = project([site.lng, site.lat]);
  const bar = scaleBar(view.lat, view.zoom);
  const listed = visible.filter((f) => f.kind !== "building");

  function marker(f: MapFeature) {
    if (!f.point) return null;
    const { x, y } = project(f.point);
    const r = 6;
    const shape =
      f.kind === "transformer" ? (
        <rect x={x - r} y={y - r} width={r * 2} height={r * 2} />
      ) : f.kind === "tower" ? (
        <path
          d={`M${x},${y - r * 1.2}L${x + r},${y + r * 0.8}L${x - r},${y + r * 0.8}Z`}
        />
      ) : f.kind === "substation" ? (
        <rect
          x={x - r * 1.3}
          y={y - r * 1.3}
          width={r * 2.6}
          height={r * 2.6}
          className="hatched"
        />
      ) : (
        <circle cx={x} cy={y} r={f.kind === "pole" ? r * 0.7 : r} />
      );
    return shape;
  }

  // The selected feature gets a white engineering callout with a leader line.
  function callout(f: MapFeature) {
    const pts = f.path ?? (f.point ? [f.point] : []);
    if (!pts.length) return null;
    const anchor = (() => {
      if (f.point) return project(f.point);
      const qs = pts
        .map(project)
        .filter((q) => q.x > 0 && q.x < W && q.y > 0 && q.y < H);
      return qs[Math.floor(qs.length / 2)] ?? project(pts[0]);
    })();
    const lines = [
      f.label,
      f.tags.operator
        ? `Operator: ${f.tags.operator}`
        : "Source: OpenStreetMap",
    ];
    const w = Math.max(...lines.map((l) => l.length)) * 7.4 + 20;
    const h = 44;
    const left = anchor.x > W - w - 60;
    const above = anchor.y > h + 50;
    const bx = Math.min(
      Math.max(left ? anchor.x - w - 36 : anchor.x + 36, 6),
      W - w - 6,
    );
    const by = Math.min(
      Math.max(above ? anchor.y - h - 36 : anchor.y + 36, 6),
      H - h - 6,
    );
    const lx = Math.min(Math.max(anchor.x, bx), bx + w);
    const ly = above ? by + h : by;
    return (
      <g className="plan-callout" aria-hidden="true">
        <line x1={lx} y1={ly} x2={anchor.x} y2={anchor.y} className="halo" />
        <line x1={lx} y1={ly} x2={anchor.x} y2={anchor.y} className="ink" />
        <circle cx={anchor.x} cy={anchor.y} r={3.5} className="terminator" />
        <rect x={bx} y={by} width={w} height={h} className="callout-box" />
        <text x={bx + 10} y={by + 18} className="callout-title">
          {lines[0]}
        </text>
        <text x={bx + 10} y={by + 35} className="callout-detail">
          {lines[1]}
        </text>
      </g>
    );
  }

  return (
    <div className="aerial-plan">
      <div className="plan-toolbar">
        <fieldset className="layer-toggles">
          <legend className="sr-only">Map layers</legend>
          {(Object.keys(LAYER_LABELS) as Layer[]).map((l) => (
            <label key={l} className={`layer-toggle layer-${l}`}>
              <input
                type="checkbox"
                checked={layers[l]}
                onChange={(e) =>
                  setLayers({ ...layers, [l]: e.target.checked })
                }
              />
              <span aria-hidden="true" />
              {LAYER_LABELS[l]}
            </label>
          ))}
        </fieldset>
        <div className="toolbar-actions">
          <div className="zoom-controls" role="group" aria-label="Zoom">
            <button
              className="icon-button"
              onClick={() => zoomTo(view.zoom - 1)}
              disabled={view.zoom <= AERIAL_MIN_ZOOM}
              aria-label="Zoom out"
            >
              <Minus size={16} />
            </button>
            <button
              className="icon-button"
              onClick={() => zoomTo(view.zoom + 1)}
              disabled={view.zoom >= provider.maxZoom}
              aria-label="Zoom in"
            >
              <Plus size={16} />
            </button>
            <button
              className="icon-button"
              onClick={() =>
                onViewChange({
                  lat: site.lat,
                  lng: site.lng,
                  zoom: AERIAL_DEFAULT_ZOOM,
                })
              }
              aria-label="Recenter on the property"
            >
              <Locate size={16} />
            </button>
          </div>
          <button
            className="button primary"
            onClick={onAnalyze}
            disabled={busy || loaded !== src}
          >
            <ScanSearch size={16} />
            {busy ? "Detecting…" : "Detect site features"}
          </button>
        </div>
      </div>
      <div
        className="plan-stage"
        style={{ ["--plan-aspect" as string]: W / H }}
      >
        <div
          className="plan-pan"
          style={
            drag
              ? {
                  transform: `translate(${(drag.dx / W) * 100}%, ${(drag.dy / H) * 100}%)`,
                }
              : undefined
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- same-origin imagery proxy */}
          <img
            key={src}
            src={src}
            alt={`Aerial image around ${site.matchedAddress}`}
            draggable={false}
            onLoad={() => {
              setLoaded(src);
              setFailed(null);
            }}
            onError={() => setFailed(src)}
          />
          <svg
            ref={svg}
            viewBox={`0 0 ${W} ${H}`}
            role="group"
            aria-label="Mapped site features. Drag to pan."
            onPointerDown={(e) => {
              if ((e.target as Element).closest(".plan-feature")) return;
              svg.current!.setPointerCapture(e.pointerId);
              // Image pixels per screen pixel; the SVG moves while dragging, so track screen deltas.
              const k = W / svg.current!.getBoundingClientRect().width;
              setDrag({ x0: e.clientX, y0: e.clientY, k, dx: 0, dy: 0 });
            }}
            onPointerMove={(e) => {
              if (!drag) return;
              setDrag({
                ...drag,
                dx: (e.clientX - drag.x0) * drag.k,
                dy: (e.clientY - drag.y0) * drag.k,
              });
            }}
            onPointerUp={() => {
              if (!drag) return;
              if (Math.hypot(drag.dx, drag.dy) > 4) {
                const c = fromImagePixel(
                  view,
                  W / 2 - drag.dx,
                  H / 2 - drag.dy,
                );
                onViewChange({ ...view, lat: c.lat, lng: c.lng });
              } else setSelected(null);
              setDrag(null);
            }}
            onPointerCancel={() => setDrag(null)}
          >
            {layers.parcel &&
              context.parcel?.rings.map((ring, i) => (
                <g key={i} className="plan-parcel">
                  <path d={path(ring, true)} className="halo" />
                  <path d={path(ring, true)} className="ink" />
                </g>
              ))}
            {visible.map((f) => (
              <g
                key={f.id}
                className={`plan-feature kind-${f.kind} ${selected === f.id ? "selected" : ""}`}
                onClick={() => setSelected(selected === f.id ? null : f.id)}
              >
                {f.path && (
                  <>
                    <path
                      d={path(
                        f.path,
                        f.kind === "building" || f.kind === "substation",
                      )}
                      className="halo"
                    />
                    <path
                      d={path(
                        f.path,
                        f.kind === "building" || f.kind === "substation",
                      )}
                      className="ink"
                    />
                  </>
                )}
                {marker(f)}
              </g>
            ))}
            <g className="plan-site" aria-hidden="true">
              <circle cx={here.x} cy={here.y} r={9} />
              <path
                d={`M${here.x - 16},${here.y}H${here.x - 5}M${here.x + 5},${here.y}H${here.x + 16}M${here.x},${here.y - 16}V${here.y - 5}M${here.x},${here.y + 5}V${here.y + 16}`}
              />
            </g>
            {picked && callout(picked)}
          </svg>
        </div>
        {loaded !== src && (
          <div className="plan-loading" role="status">
            {failed === src
              ? "Aerial imagery could not be loaded here. Try zooming out."
              : "Loading aerial imagery…"}
          </div>
        )}
        <div className="plan-scale" aria-hidden="true">
          <span style={{ width: bar.px * (100 / W) + "%" }} />
          {bar.meters} m
        </div>
      </div>
      <div className="plan-footer">
        <p>
          {provider.attribution}. Features from OpenStreetMap contributors. The
          crosshair is the geocoded point, which may sit at the street rather
          than the building. Drag to pan; select a feature to label it.
        </p>
        <a
          href={provider.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="text-link"
        >
          Imagery terms
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      </div>
      {listed.length > 0 && (
        <ul className="plan-legend" aria-label="Mapped features in view">
          {listed.slice(0, 12).map((f) => (
            <li key={f.id}>
              <button
                className={`plain-button ${selected === f.id ? "selected" : ""}`}
                aria-pressed={selected === f.id}
                onClick={() => setSelected(selected === f.id ? null : f.id)}
              >
                <span
                  className={`legend-swatch kind-${f.kind}`}
                  aria-hidden="true"
                />
                {f.label}
              </button>
              <a
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="text-link"
                aria-label={`${f.label} on OpenStreetMap`}
              >
                <ExternalLink size={12} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
