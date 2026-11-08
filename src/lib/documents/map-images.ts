"use client";
import type { Geometry } from "geojson";
import type { SiteRecord } from "../types";
import type { SiteAnalysis as AnnotationAnalysis } from "../annotations/types";
import {
  AERIAL_SIZE,
  aerialImageUrl,
  providerFor,
  toImagePixel,
  type AerialView,
} from "../annotations/aerial";
import { loadAnalysisImage } from "../annotations/images";
import { engineeringStore } from "../intake/record-store";
import {
  engineeringKeyForSite,
  initialEngineeringRecord,
} from "../intake/site-identity";
import { prepareFieldFiles } from "../intake/file-evidence";
import type { EvidenceReference } from "../intake/types";

export type MapImageKind = NonNullable<EvidenceReference["mapImageKind"]>;
export interface ImageOverlay {
  geometry: Geometry;
  stroke: string;
  fill?: string;
  label?: string;
}
function entry(site: SiteRecord) {
  return engineeringStore().open(engineeringKeyForSite(site), () =>
    initialEngineeringRecord(site),
  );
}
export async function storeMapImage(
  site: SiteRecord,
  kind: MapImageKind,
  blob: Blob,
  method: string,
) {
  const state = entry(site);
  const file = new File(
    [blob],
    `QoreSites_${kind === "gis" ? "GIS_Layer" : kind === "contour" ? "Contour" : "Annotated_Layer"}.png`,
    { type: "image/png" },
  );
  const prepared = await prepareFieldFiles(
    state.getSnapshot().record,
    "parcelArea",
    [file],
    method,
    "reference-only",
  );
  for (const [key, bytes] of prepared.bytes) state.files.set(key, bytes);
  state.update((record) => ({
    ...record,
    updatedAt: new Date().toISOString(),
    sources: {
      ...record.sources,
      ...Object.fromEntries(
        Object.entries(prepared.sources).map(([key, source]) => [
          key,
          {
            ...source,
            provider: "Saved site map",
            documentFolder: "map-images" as const,
            mapImageKind: kind,
            matchingMethod: method,
          },
        ]),
      ),
    },
  }));
}
async function image(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function png(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(Error("Map image could not be saved.")),
      "image/png",
    ),
  );
}
function canvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height + 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Image rendering is unavailable.");
  return { canvas, ctx };
}
function footer(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  title: string,
  attribution: string,
) {
  ctx.fillStyle = "white";
  ctx.fillRect(0, height, width, 64);
  ctx.fillStyle = "#28594f";
  ctx.font = "bold 17px Arial";
  ctx.fillText(title, 16, height + 25, width - 32);
  ctx.font = "13px Arial";
  ctx.fillStyle = "#4d5853";
  ctx.fillText(attribution, 16, height + 47, width - 32);
}
function paths(geometry: Geometry): number[][][] {
  switch (geometry.type) {
    case "LineString":
      return [geometry.coordinates];
    case "MultiLineString":
    case "Polygon":
      return geometry.coordinates;
    case "MultiPolygon":
      return geometry.coordinates.flat();
    case "GeometryCollection":
      return geometry.geometries.flatMap(paths);
    default:
      return [];
  }
}
export async function renderMapImage(
  view: AerialView,
  base: Blob,
  overlays: ImageOverlay[],
  title: string,
) {
  const { canvas: out, ctx } = canvas(AERIAL_SIZE.width, AERIAL_SIZE.height);
  ctx.drawImage(await image(base), 0, 0, AERIAL_SIZE.width, AERIAL_SIZE.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, AERIAL_SIZE.width, AERIAL_SIZE.height);
  ctx.clip();
  for (const overlay of overlays) {
    ctx.strokeStyle = overlay.stroke;
    ctx.fillStyle = overlay.fill ?? "transparent";
    ctx.lineWidth = 2;
    for (const ring of paths(overlay.geometry)) {
      ctx.beginPath();
      ring.forEach((p, i) => {
        const pixel = toImagePixel(view, p[1], p[0], AERIAL_SIZE);
        if (i === 0) ctx.moveTo(pixel.x, pixel.y);
        else ctx.lineTo(pixel.x, pixel.y);
      });
      if (/Polygon/.test(overlay.geometry.type)) {
        ctx.closePath();
        if (overlay.fill) ctx.fill();
      }
      ctx.stroke();
      if (overlay.label && ring.length) {
        const p = ring[Math.floor(ring.length / 2)],
          pixel = toImagePixel(view, p[1], p[0], AERIAL_SIZE);
        ctx.font = "14px Arial";
        ctx.fillStyle = overlay.stroke;
        ctx.fillText(overlay.label, pixel.x, pixel.y);
      }
    }
  }
  ctx.restore();
  footer(
    ctx,
    AERIAL_SIZE.width,
    AERIAL_SIZE.height,
    title,
    providerFor(view.lat, view.lng).attribution +
      " · Public GIS context; not a survey",
  );
  return png(out);
}
export async function publicMapBase(view: AerialView) {
  const response = await fetch(aerialImageUrl(view));
  if (!response.ok)
    throw Error(
      "Public aerial imagery could not be retrieved. Save the site again to retry map images.",
    );
  return response.blob();
}
export async function renderAnnotatedImage(
  analysis: AnnotationAnalysis,
  blob: Blob,
) {
  const { width, height } = analysis.image;
  const { canvas: out, ctx } = canvas(width, height);
  ctx.drawImage(await image(blob), 0, 0, width, height);
  ctx.font = "bold 16px Arial";
  ctx.lineWidth = 2;
  analysis.annotations
    .filter((a) => !a.hidden)
    .forEach((a) => {
      const x = a.box[0] * width,
        y = a.box[1] * height,
        w = (a.box[2] - a.box[0]) * width,
        h = (a.box[3] - a.box[1]) * height;
      ctx.strokeStyle = "#28594f";
      ctx.strokeRect(x, y, w, h);
      const label = `E${analysis.annotations.indexOf(a) + 1} ${a.label}`;
      const labelWidth = Math.min(
        width - 20,
        ctx.measureText(label).width + 16,
      );
      const lx = Math.max(0, Math.min(width - labelWidth, a.callout.x * width)),
        ly = Math.max(0, Math.min(height - 28, a.callout.y * height));
      ctx.beginPath();
      ctx.moveTo(lx + labelWidth / 2, ly + 28);
      ctx.lineTo(x + w / 2, y + h / 2);
      ctx.stroke();
      ctx.fillStyle = "white";
      ctx.fillRect(lx, ly, labelWidth, 28);
      ctx.strokeRect(lx, ly, labelWidth, 28);
      ctx.fillStyle = "#202522";
      ctx.fillText(label, lx + 8, ly + 19, labelWidth - 16);
    });
  footer(
    ctx,
    width,
    height,
    "QoreSites · Annotated layer",
    analysis.image.aerial?.attribution ??
      "User-provided imagery · Annotations require review",
  );
  return png(out);
}
const pending = new Map<string, Promise<void>>();
export async function saveAnnotatedImage(
  site: SiteRecord,
  analysis: AnnotationAnalysis,
) {
  const key = `${site.id}:${analysis.id}:${analysis.updatedAt}`;
  if (pending.has(key)) return pending.get(key);
  const promise = (async () => {
    const blob = await loadAnalysisImage(analysis.id);
    if (!blob)
      throw Error(
        "Original annotation image is not available in this browser.",
      );
    await storeMapImage(
      site,
      "annotated",
      await renderAnnotatedImage(analysis, blob),
      `Rendered from saved analysis ${analysis.id}, updated ${analysis.updatedAt}; original image, visible annotation labels and boxes. ${analysis.image.aerial?.sourceUrl ?? "Customer-provided image"}.`,
    );
  })().finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}
