"use client";
import {
  PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { NormalizedBox, SiteAnnotation } from "@/lib/annotations/types";
import {
  ZONE_COLUMNS,
  calloutLines,
  calloutMetrics,
  calloutSize,
  displayScale,
  leaderLine,
  zoneRows,
} from "@/lib/annotations/vision";

const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));

export function tagFor(index: number) {
  return `E${index + 1}`;
}

function MapLabelEditor({
  annotation,
  tag,
  onSave,
  onClose,
}: {
  annotation: SiteAnnotation;
  tag: string;
  onSave: (label: string) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(annotation.label);
  const [error, setError] = useState("");
  return (
    <form
      className="map-label-editor"
      aria-label={`Edit ${tag} label on map`}
      onSubmit={(e) => {
        e.preventDefault();
        const name = label.trim();
        if (!name) {
          setError("Enter a label name.");
          return;
        }
        if (name !== annotation.label) onSave(name);
        onClose();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <label htmlFor={`map-label-${annotation.id}`}>Edit {tag} label</label>
      <input
        id={`map-label-${annotation.id}`}
        aria-label="Annotation label on map"
        value={label}
        maxLength={120}
        autoFocus
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          setLabel(e.target.value);
          setError("");
        }}
      />
      {error && <small role="alert">{error}</small>}
      <div className="button-row">
        <button className="button small" type="submit">
          Save label
        </button>
        <button
          className="button secondary small"
          type="button"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * Renders the original image untouched, with an SVG annotation layer on top.
 * The frame carries drawing-sheet zone references so the equipment schedule
 * can say where each item is.
 */
export function AnnotatedViewer({
  src,
  width,
  height,
  annotations,
  showAnnotations,
  selectedId,
  drawMode,
  scanning,
  onSelect,
  onMoveCallout,
  onDraw,
  onResize,
  onError,
  alt = "Site image being analyzed",
  camera,
  onRename,
}: {
  src: string;
  width: number;
  height: number;
  annotations: SiteAnnotation[];
  showAnnotations: boolean;
  selectedId: string | null;
  drawMode: boolean;
  scanning: boolean;
  onSelect: (id: string | null) => void;
  onMoveCallout: (id: string, callout: { x: number; y: number }) => void;
  onDraw: (box: NormalizedBox) => void;
  /** Reports the photo's on-screen width in CSS pixels. */
  onResize?: (viewerWidth: number) => void;
  onError?: () => void;
  alt?: string;
  camera?: { x: number; y: number; heading: number } | null;
  onRename?: (id: string, label: string) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(width / 900);
  useEffect(() => {
    const el = stage.current!;
    const observer = new ResizeObserver(() => {
      // Inactive map tabs stay mounted. Preserve readable callout layout while hidden.
      if (!el.clientWidth) return;
      setScale(displayScale(width, el.clientWidth));
      onResize?.(el.clientWidth);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [width, onResize]);
  const [drag, setDrag] = useState<{
    id: string;
    dx: number;
    dy: number;
    x: number;
    y: number;
  } | null>(null);
  const [draft, setDraft] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const aspect = width / height;
  const rows = zoneRows(aspect);
  const m = calloutMetrics(scale);
  const selected = annotations.find((a) => a.id === selectedId && !a.hidden);

  function point(e: ReactPointerEvent) {
    const ctm = svg.current!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm);
    return { x: p.x / width, y: p.y / height };
  }

  return (
    <div className="sheet" style={{ ["--sheet-aspect" as string]: aspect }}>
      <ol className="sheet-cols" aria-hidden="true">
        {Array.from({ length: ZONE_COLUMNS }, (_, i) => (
          <li key={i}>{i + 1}</li>
        ))}
      </ol>
      <ol className="sheet-rows" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i}>{String.fromCharCode(65 + i)}</li>
        ))}
      </ol>
      <div ref={stage} className={`sheet-stage ${drawMode ? "drawing" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL of the original file */}
        <img src={src} alt={alt} draggable={false} onError={onError} />
        {scanning && <div className="scan-line" aria-hidden="true" />}
        <svg
          ref={svg}
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          aria-label="Equipment annotations"
          onPointerDown={(e) => {
            if (!drawMode) {
              if (e.target === svg.current) onSelect(null);
              return;
            }
            const p = point(e);
            svg.current!.setPointerCapture(e.pointerId);
            setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
          }}
          onPointerMove={(e) => {
            if (draft) {
              const p = point(e);
              setDraft({ ...draft, x1: clamp(p.x), y1: clamp(p.y) });
            } else if (drag) {
              const p = point(e);
              setDrag({ ...drag, x: p.x - drag.dx, y: p.y - drag.dy });
            }
          }}
          onPointerCancel={() => {
            setDraft(null);
            setDrag(null);
          }}
          onPointerUp={() => {
            if (draft) {
              const box: NormalizedBox = [
                Math.min(draft.x0, draft.x1),
                Math.min(draft.y0, draft.y1),
                Math.max(draft.x0, draft.x1),
                Math.max(draft.y0, draft.y1),
              ];
              setDraft(null);
              if (box[2] - box[0] > 0.01 && box[3] - box[1] > 0.01) onDraw(box);
            } else if (drag) {
              onMoveCallout(drag.id, { x: clamp(drag.x), y: clamp(drag.y) });
              setDrag(null);
            }
          }}
        >
          {showAnnotations &&
            annotations.map((a, index) => {
              if (a.hidden) return null;
              const lines = calloutLines(a);
              const size = calloutSize(lines, scale);
              const tagW = m.font * 2.2;
              const w = size.w;
              const pos =
                drag?.id === a.id ? { x: drag.x, y: drag.y } : a.callout;
              const c = {
                x: clamp(pos.x * width, 0, width - w),
                y: clamp(pos.y * height, 0, height - size.h),
                w,
                h: size.h,
              };
              const leader = leaderLine(c, a.box, width, height);
              const [bx0, by0, bx1, by1] = [
                a.box[0] * width,
                a.box[1] * height,
                a.box[2] * width,
                a.box[3] * height,
              ];
              const k = Math.min(bx1 - bx0, by1 - by0) * 0.22;
              const brackets = `M${bx0},${by0 + k}V${by0}H${bx0 + k}M${bx1 - k},${by0}H${bx1}V${by0 + k}M${bx1},${by1 - k}V${by1}H${bx1 - k}M${bx0 + k},${by1}H${bx0}V${by1 - k}`;
              const selected = selectedId === a.id;
              const low = a.score !== null && a.score < 0.4;
              const sw = m.stroke * (selected ? 1.8 : 1);
              return (
                <g
                  key={a.id}
                  className={`annotation ${selected ? "selected" : ""}`}
                >
                  <path d={brackets} className="halo" strokeWidth={sw * 3.5} />
                  <path d={brackets} className="ink" strokeWidth={sw * 1.4} />
                  <line {...leader} className="halo" strokeWidth={sw * 3.2} />
                  <line {...leader} className="ink" strokeWidth={sw} />
                  <circle
                    cx={leader.x2}
                    cy={leader.y2}
                    r={sw * 3.2}
                    className="terminator"
                    strokeWidth={sw}
                  />
                  <g
                    className="callout"
                    tabIndex={0}
                    role="button"
                    aria-pressed={selected}
                    aria-label={`${tagFor(index)} ${a.label}. Select to edit the label. Drag or use arrow keys to move the callout.`}
                    onPointerDown={(e) => {
                      if (drawMode) return;
                      e.stopPropagation();
                      const p = point(e);
                      svg.current!.setPointerCapture(e.pointerId);
                      onSelect(a.id);
                      setDrag({
                        id: a.id,
                        dx: p.x - c.x / width,
                        dy: p.y - c.y / height,
                        x: c.x / width,
                        y: c.y / height,
                      });
                    }}
                    onKeyDown={(e) => {
                      const step = e.shiftKey ? 0.05 : 0.01;
                      const moves: Record<string, [number, number]> = {
                        ArrowLeft: [-step, 0],
                        ArrowRight: [step, 0],
                        ArrowUp: [0, -step],
                        ArrowDown: [0, step],
                      };
                      if (moves[e.key]) {
                        e.preventDefault();
                        onMoveCallout(a.id, {
                          x: clamp(c.x / width + moves[e.key][0]),
                          y: clamp(c.y / height + moves[e.key][1]),
                        });
                      } else if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(selected ? null : a.id);
                      }
                    }}
                  >
                    <rect
                      x={c.x}
                      y={c.y}
                      width={c.w}
                      height={c.h}
                      className="callout-box"
                      strokeWidth={sw}
                      strokeDasharray={
                        low ? `${sw * 4} ${sw * 2.5}` : undefined
                      }
                    />
                    <line
                      x1={c.x + tagW}
                      y1={c.y}
                      x2={c.x + tagW}
                      y2={c.y + c.h}
                      className="ink"
                      strokeWidth={sw * 0.8}
                    />
                    <text
                      x={c.x + tagW / 2}
                      y={c.y + c.h / 2}
                      fontSize={m.font * 0.92}
                      className="callout-tag"
                      dominantBaseline="central"
                      textAnchor="middle"
                    >
                      {tagFor(index)}
                    </text>
                    {lines.map((line, i) => (
                      <text
                        key={i}
                        x={c.x + tagW + m.pad}
                        y={c.y + m.pad * 0.7 + m.line * (i + 0.78)}
                        fontSize={i === 0 ? m.font : m.font * 0.86}
                        className={i === 0 ? "callout-title" : "callout-detail"}
                      >
                        {line}
                      </text>
                    ))}
                  </g>
                </g>
              );
            })}
          {camera && (
            <g
              className="diagram-camera"
              transform={`translate(${camera.x} ${camera.y}) scale(${scale})`}
              pointerEvents="none"
              aria-label="Street View camera position"
            >
              <g transform={`rotate(${camera.heading})`}>
                <path
                  d="M 0 -22 L -9 -3 L 9 -3 Z"
                  fill="#196bc4"
                  stroke="white"
                  strokeWidth="2"
                />
              </g>
              <circle r="7" fill="#196bc4" stroke="white" strokeWidth="2.5" />
            </g>
          )}
          {draft && (
            <rect
              x={Math.min(draft.x0, draft.x1) * width}
              y={Math.min(draft.y0, draft.y1) * height}
              width={Math.abs(draft.x1 - draft.x0) * width}
              height={Math.abs(draft.y1 - draft.y0) * height}
              className="draft-box"
              strokeWidth={m.stroke * 1.5}
            />
          )}
        </svg>
        {selected &&
          onRename &&
          showAnnotations &&
          !scanning &&
          !drawMode &&
          !drag && (
            <MapLabelEditor
              key={selected.id}
              annotation={selected}
              tag={tagFor(annotations.indexOf(selected))}
              onSave={(label) => onRename(selected.id, label)}
              onClose={() => onSelect(null)}
            />
          )}
      </div>
      <ol className="sheet-rows end" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i}>{String.fromCharCode(65 + i)}</li>
        ))}
      </ol>
      <ol className="sheet-cols end" aria-hidden="true">
        {Array.from({ length: ZONE_COLUMNS }, (_, i) => (
          <li key={i}>{i + 1}</li>
        ))}
      </ol>
    </div>
  );
}
