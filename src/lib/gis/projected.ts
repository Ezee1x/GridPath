import proj4 from "proj4";
import polygonClipping from "polygon-clipping";
import type { Geometry, Position } from "geojson";
import type { PolygonGeometry } from "./types";
type Point = [number, number];
export type ProjectedPolygon = polygonClipping.MultiPolygon;
type Segment = [Point, Point];
export function localProjection(latitude: number, longitude: number) {
  const definition = `+proj=aeqd +lat_0=${latitude} +lon_0=${longitude} +datum=WGS84 +units=m +no_defs`;
  const conversion = proj4("EPSG:4326", definition);
  const point = (p: Position): Point => {
    const xy = conversion.forward([p[0], p[1]]);
    if (!xy.every(Number.isFinite))
      throw new Error("Invalid projected coordinate");
    return [xy[0], xy[1]];
  };
  const polygon = (g: PolygonGeometry): ProjectedPolygon =>
    (g.type === "Polygon" ? [g.coordinates] : g.coordinates).map((poly) =>
      poly.map((ring) => ring.map(point)),
    );
  const lines = (g: Geometry): Point[][] =>
    g.type === "LineString"
      ? [g.coordinates.map(point)]
      : g.type === "MultiLineString"
        ? g.coordinates.map((line) => line.map(point))
        : [];
  return { definition, point, polygon, lines };
}
function ringArea(ring: Point[]): number {
  let sum = 0;
  const origin = ring[0];
  for (let i = 0; i < ring.length - 1; i++)
    sum +=
      (ring[i][0] - origin[0]) * (ring[i + 1][1] - origin[1]) -
      (ring[i + 1][0] - origin[0]) * (ring[i][1] - origin[1]);
  return Math.abs(sum) / 2;
}
export function projectedArea(polygons: ProjectedPolygon): number {
  return polygons.reduce(
    (sum, p) =>
      sum +
      ringArea(p[0]) -
      p.slice(1).reduce((holes, r) => holes + ringArea(r), 0),
    0,
  );
}
export function clippedCoverage(
  parcel: ProjectedPolygon,
  roofs: ProjectedPolygon[],
): ProjectedPolygon {
  const clips = roofs
    .map((roof) => polygonClipping.intersection(parcel, roof))
    .filter((c) => c.length);
  return clips.length ? polygonClipping.union(clips[0], ...clips.slice(1)) : [];
}
export function remainingPolygon(
  parcel: ProjectedPolygon,
  coverage: ProjectedPolygon,
): ProjectedPolygon {
  return coverage.length
    ? polygonClipping.difference(parcel, coverage)
    : parcel;
}
function segments(lines: Point[][]): Segment[] {
  return lines.flatMap((line) =>
    line.slice(1).map((p, i) => [line[i], p] as Segment),
  );
}
function pointSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    norm = dx * dx + dy * dy;
  const t = norm
    ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / norm))
    : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function cross(a: Point, b: Point, c: Point) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
export function segmentDistance([a, b]: Segment, [c, d]: Segment): number {
  const abC = cross(a, b, c),
    abD = cross(a, b, d),
    cdA = cross(c, d, a),
    cdB = cross(c, d, b);
  if (
    ((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) &&
    ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))
  )
    return 0;
  return Math.min(
    pointSegment(a, c, d),
    pointSegment(b, c, d),
    pointSegment(c, a, b),
    pointSegment(d, a, b),
  );
}
export function minimumLineDistance(a: Point[][], b: Point[][]): number | null {
  const sa = segments(a),
    sb = segments(b);
  if (!sa.length || !sb.length) return null;
  let min = Infinity;
  for (const x of sa)
    for (const y of sb) {
      min = Math.min(min, segmentDistance(x, y));
      if (min < 1e-8) return 0;
    }
  return Number.isFinite(min) ? min : null;
}
export function polygonBoundary(p: ProjectedPolygon): Point[][] {
  return p.flatMap((poly) => poly);
}
function ringContains(p: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (pointSegment(p, a, b) < 1e-8) return true;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
export function polygonRoadDistance(
  parcel: ProjectedPolygon,
  road: Point[][],
): number | null {
  if (
    road.some((line) =>
      line.some((point) =>
        parcel.some(
          (poly) =>
            ringContains(point, poly[0]) &&
            !poly.slice(1).some((hole) => ringContains(point, hole)),
        ),
      ),
    )
  )
    return 0;
  return minimumLineDistance(polygonBoundary(parcel), road);
}
