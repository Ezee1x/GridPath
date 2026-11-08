import area from "@turf/area";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import intersect from "@turf/intersect";
import { arcgisToGeoJSON } from "@terraformer/arcgis";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { GisFeature, Measurement, PolygonGeometry } from "./types";
export const SQFT_PER_SQM = 10.76391041671;
export function measurement(
  squareMeters: number,
  method: string,
  approximate = true,
): Measurement | null {
  if (!Number.isFinite(squareMeters) || squareMeters <= 0) return null;
  return {
    squareMeters,
    squareFeet: squareMeters * SQFT_PER_SQM,
    acres: squareMeters / 4046.8564224,
    method,
    approximate,
  };
}
export function parcelSourceMeasurement(
  attributes: Record<string, unknown>,
): Measurement | null {
  const value = Number(attributes.LOT_SIZE);
  const unit = String(attributes.LOT_UNITS ?? "")
    .trim()
    .toLowerCase();
  const factors: Record<string, number> = {
    acres: 4046.8564224,
    a: 4046.8564224,
    s: 1 / SQFT_PER_SQM,
    acre: 4046.8564224,
    "sq ft": 1 / SQFT_PER_SQM,
    "sq. ft.": 1 / SQFT_PER_SQM,
    "square feet": 1 / SQFT_PER_SQM,
    "square meters": 1,
    "sq m": 1,
  };
  return factors[unit] && value > 0
    ? measurement(
        value * factors[unit],
        `Assessor LOT_SIZE (${String(attributes.LOT_UNITS)}); reported lot area, units converted`,
        false,
      )
    : null;
}
export function isPolygon(g: Geometry): g is PolygonGeometry {
  return g.type === "Polygon" || g.type === "MultiPolygon";
}
export function geometryMeasurement(geometry: Geometry): Measurement | null {
  return isPolygon(geometry)
    ? measurement(
        area(geometry),
        "Approximate geodesic area of returned WGS84 polygon, Turf spherical method; holes excluded",
      )
    : null;
}
export function containsPoint(
  geometry: Geometry,
  lng: number,
  lat: number,
): boolean {
  return isPolygon(geometry) && booleanPointInPolygon([lng, lat], geometry);
}
export function normalizedStreet(address: string): string {
  const replacements: Record<string, string> = {
    STREET: "ST",
    AVENUE: "AVE",
    ROAD: "RD",
    DRIVE: "DR",
    SQUARE: "SQ",
    BOULEVARD: "BLVD",
    LANE: "LN",
    COURT: "CT",
    HIGHWAY: "HWY",
    PLACE: "PL",
    TERRACE: "TER",
    PARKWAY: "PKWY",
    NORTH: "N",
    SOUTH: "S",
    EAST: "E",
    WEST: "W",
  };
  return address
    .split(",")[0]
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => replacements[s] ?? s)
    .join(" ");
}
export function chooseParcel(
  features: GisFeature[],
  address: string,
): string | null {
  const matches = features.filter(
    (f) =>
      f.properties.containsPoint &&
      f.properties.attributes.POLY_TYPE === "FEE" &&
      normalizedStreet(String(f.properties.attributes.SITE_ADDR ?? "")) ===
        normalizedStreet(address) &&
      address.trim(),
  );
  return matches.length === 1 ? matches[0].properties.id : null;
}
export function buildingAssociation(
  building: Geometry,
  parcel: Geometry | null,
): string {
  if (!parcel || !isPolygon(building) || !isPolygon(parcel))
    return "Nearby — parcel association unconfirmed";
  const overlap = intersect({
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: {}, geometry: building },
      { type: "Feature", properties: {}, geometry: parcel },
    ],
  });
  if (!overlap || area(overlap) <= 0.01)
    return "Nearby — outside selected parcel";
  const ratio = area(overlap) / area(building);
  return ratio >= 0.999999
    ? "Within selected parcel — unverified association"
    : "Crosses parcel boundary — review required";
}
export function envelope(
  geometry: Geometry | null,
  lng: number,
  lat: number,
  paddingMeters: number,
): { geometry: string; clipped: boolean } {
  const positions: number[][] = [];
  function walk(value: unknown): void {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number")
      positions.push(value as number[]);
    else value.forEach(walk);
  }
  if (geometry && "coordinates" in geometry) walk(geometry.coordinates);
  const dx = paddingMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  const dy = paddingMeters / 111320;
  const limitX = 2000 / (111320 * Math.cos((lat * Math.PI) / 180)),
    limitY = 2000 / 111320;
  const xs = positions.map((p) => p[0]),
    ys = positions.map((p) => p[1]);
  const raw = {
    xmin: (xs.length ? Math.min(...xs) : lng) - dx,
    ymin: (ys.length ? Math.min(...ys) : lat) - dy,
    xmax: (xs.length ? Math.max(...xs) : lng) + dx,
    ymax: (ys.length ? Math.max(...ys) : lat) + dy,
  };
  const bounded = {
    xmin: Math.max(raw.xmin, lng - limitX),
    ymin: Math.max(raw.ymin, lat - limitY),
    xmax: Math.min(raw.xmax, lng + limitX),
    ymax: Math.min(raw.ymax, lat + limitY),
  };
  return {
    geometry: JSON.stringify({ ...bounded, spatialReference: { wkid: 4326 } }),
    clipped: Object.keys(raw).some(
      (k) => raw[k as keyof typeof raw] !== bounded[k as keyof typeof bounded],
    ),
  };
}
/** ArcGIS JSON rings/paths are converted using Terraformer's hole/multipart-aware converter. outSR is always 4326. */
export function normalizeFeatureSet(data: unknown): FeatureCollection {
  if (!data || typeof data !== "object")
    throw new Error("Invalid GIS response");
  const d = data as {
    type?: string;
    features?: unknown[];
    spatialReference?: { wkid?: number };
  };
  if (!Array.isArray(d.features))
    throw new Error("GIS response contains no feature array");
  if (d.type === "FeatureCollection") return d as FeatureCollection;
  if (d.spatialReference?.wkid && d.spatialReference.wkid !== 4326)
    throw new Error("GIS service did not return WGS84 geometry");
  return {
    type: "FeatureCollection",
    features: d.features.map(
      (f) =>
        arcgisToGeoJSON(
          f as Parameters<typeof arcgisToGeoJSON>[0],
        ) as unknown as Feature,
    ),
  };
}
