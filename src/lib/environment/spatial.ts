import proj4 from "proj4";
import type { Geometry, Position } from "geojson";
import type { PolygonGeometry } from "../gis/types";
import type { EnvironmentInput } from "./types";
export const MA_CRS =
  "+proj=lcc +lat_1=42.68333333333333 +lat_2=41.71666666666667 +lat_0=41 +lon_0=-71.5 +x_0=200000 +y_0=750000 +datum=NAD83 +units=m +no_defs";
export const toMeters = (p: Position): [number, number] =>
  proj4("EPSG:4326", MA_CRS, [p[0], p[1]]) as [number, number];
export const toWgs84 = (p: Position): [number, number] =>
  proj4(MA_CRS, "EPSG:4326", [p[0], p[1]]) as [number, number];
export function positions(geometry: Geometry): Position[] {
  const out: Position[] = [];
  function walk(v: unknown) {
    if (!Array.isArray(v)) return;
    if (typeof v[0] === "number") out.push(v as Position);
    else v.forEach(walk);
  }
  if ("coordinates" in geometry) walk(geometry.coordinates);
  return out;
}
export function validateEnvironmentInput(value: unknown): EnvironmentInput {
  if (!value || typeof value !== "object")
    throw Error("Provide the selected parcel geometry.");
  const v = value as EnvironmentInput;
  if (
    !/^\d{1,12}$/.test(String(v.parcelId)) ||
    !v.geometry ||
    !["Polygon", "MultiPolygon"].includes(v.geometry.type)
  )
    throw Error("A selected public parcel polygon and OBJECTID are required.");
  const points = positions(v.geometry);
  if (
    points.length < 4 ||
    points.length > 12000 ||
    points.some(
      (p) =>
        p.length < 2 ||
        !Number.isFinite(p[0]) ||
        !Number.isFinite(p[1]) ||
        p[0] < -73.51 ||
        p[0] > -69.85 ||
        p[1] < 41.18 ||
        p[1] > 42.9,
    )
  )
    throw Error("Provide a bounded Massachusetts parcel in WGS84 coordinates.");
  const rings =
    v.geometry.type === "Polygon"
      ? v.geometry.coordinates
      : v.geometry.coordinates.flat();
  if (
    rings.some(
      (r) =>
        r.length < 4 || r[0][0] !== r.at(-1)![0] || r[0][1] !== r.at(-1)![1],
    )
  )
    throw Error("Parcel rings must be closed.");
  const meters = points.map(toMeters);
  const x = meters.map((p) => p[0]),
    y = meters.map((p) => p[1]);
  if (
    Math.max(...x) - Math.min(...x) > 6000 ||
    Math.max(...y) - Math.min(...y) > 6000
  )
    throw Error("This parcel exceeds the preliminary analysis size limit.");
  if (
    ![1, 2, 5, 10].includes(v.intervalFeet ?? 5) ||
    ![100, 250, 500].includes(v.radiusMeters ?? 250)
  )
    throw Error(
      "Choose an available contour interval and a 100, 250 or 500 meter wetlands search.",
    );
  return {
    ...v,
    parcelId: String(v.parcelId),
    intervalFeet: v.intervalFeet ?? 5,
    radiusMeters: v.radiusMeters ?? 250,
    forceDem: v.forceDem === true,
  };
}
export function terrainExtent(g: PolygonGeometry) {
  const p = positions(g).map(toMeters),
    xs = p.map((p) => p[0]),
    ys = p.map((p) => p[1]);
  const x0 = Math.min(...xs),
    y0 = Math.min(...ys),
    x1 = Math.max(...xs),
    y1 = Math.max(...ys);
  const w = Math.min(1200, Math.max(160, x1 - x0 + 120)),
    h = Math.min(1200, Math.max(160, y1 - y0 + 120)),
    cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2;
  const extent: [number, number, number, number] = [
    cx - w / 2,
    cy - h / 2,
    cx + w / 2,
    cy + h / 2,
  ];
  const corners = [
    [extent[0], extent[1]],
    [extent[2], extent[1]],
    [extent[2], extent[3]],
    [extent[0], extent[3]],
  ].map(toWgs84);
  return {
    extent,
    bounds: [
      Math.min(...corners.map((p) => p[0])),
      Math.min(...corners.map((p) => p[1])),
      Math.max(...corners.map((p) => p[0])),
      Math.max(...corners.map((p) => p[1])),
    ] as [number, number, number, number],
    complete:
      x0 >= extent[0] && y0 >= extent[1] && x1 <= extent[2] && y1 <= extent[3],
  };
}
/** Liang–Barsky clip of genuine source segments, preserving separate line fragments. */
export function clipLine(
  line: Position[],
  b: [number, number, number, number],
): Position[][] {
  const out: Position[][] = [];
  let part: Position[] = [];
  for (let i = 1; i < line.length; i++) {
    const a = toMeters(line[i - 1]),
      z = toMeters(line[i]),
      dx = z[0] - a[0],
      dy = z[1] - a[1];
    let lo = 0,
      hi = 1,
      valid = true;
    const p = [-dx, dx, -dy, dy],
      q = [a[0] - b[0], b[2] - a[0], a[1] - b[1], b[3] - a[1]];
    for (let k = 0; k < 4; k++) {
      if (p[k] === 0) {
        if (q[k] < 0) valid = false;
      } else {
        const t = q[k] / p[k];
        if (p[k] < 0) lo = Math.max(lo, t);
        else hi = Math.min(hi, t);
      }
    }
    if (!valid || lo > hi) {
      if (part.length > 1) out.push(part);
      part = [];
      continue;
    }
    const s = toWgs84([a[0] + lo * dx, a[1] + lo * dy]),
      e = toWgs84([a[0] + hi * dx, a[1] + hi * dy]);
    if (
      part.length &&
      Math.hypot(part.at(-1)![0] - s[0], part.at(-1)![1] - s[1]) > 1e-9
    ) {
      if (part.length > 1) out.push(part);
      part = [];
    }
    if (!part.length) part.push(s);
    part.push(e);
  }
  if (part.length > 1) out.push(part);
  return out;
}
