import type {
  Feature,
  FeatureCollection,
  LineString,
  MultiLineString,
} from "geojson";
import type { PolygonGeometry } from "../gis/types";
import type { EvidenceReference } from "../intake/types";
export type EnvironmentKind = "flood" | "wetlands" | "elevation";
export interface EnvironmentInput {
  parcelId: string;
  geometry: PolygonGeometry;
  radiusMeters: number;
  intervalFeet: 1 | 2 | 5 | 10;
  forceDem?: boolean;
}
export interface EnvironmentalFeatureProperties {
  [key: string]: unknown;
  id: string;
  name: string;
  provider: string;
  sourceUrl: string;
  sourceDate: string | null;
  attributes: Record<string, unknown>;
  overlapSquareFeet?: number;
  boundaryDistanceFeet?: number | null;
}
export type EnvironmentalFeature = Feature<
  PolygonGeometry,
  EnvironmentalFeatureProperties
>;
export interface SourceResult {
  parcelId: string;
  retrievedAt: string;
  status: "ready" | "error" | "no-data";
  error: string | null;
  warnings: string[];
  sources: Record<string, EvidenceReference>;
  method: string;
}
export interface FloodResult extends SourceResult {
  kind: "flood";
  coverage: "mapped" | "no-mapped-hazard" | "no-coverage" | "unknown";
  complete: boolean;
  features: EnvironmentalFeature[];
  zones: string[];
  specialFloodHazardIntersection: boolean | null;
  overlapSquareFeet: number | null;
  specialHazardOverlapSquareFeet: number | null;
  effectivePanels: Record<string, unknown>[];
}
export interface WetlandsResult extends SourceResult {
  kind: "wetlands";
  complete: boolean;
  radiusMeters: number;
  features: EnvironmentalFeature[];
  intersects: boolean | null;
  overlapSquareFeet: number | null;
  nearestBoundaryFeet: number | null;
}
export interface ContourProperties {
  [key: string]: unknown;
  id: string;
  elevationFeet: number;
  elevationMeters: number;
  sourceUrl: string;
  method: "official-vectors" | "dem-isolines";
}
export type ContourFeature = Feature<
  LineString | MultiLineString,
  ContourProperties
>;
export interface ElevationResult extends SourceResult {
  kind: "elevation";
  summary: {
    medianFeet: number;
    minimumFeet: number;
    maximumFeet: number;
    rangeFeet: number;
    validSamples: number;
    parcelSamples: number;
    validCoverageFraction: number;
    completeParcelExtent: boolean;
  } | null;
  raster: {
    width: number;
    height: number;
    extentMeters: [number, number, number, number];
    epsg: 26986;
    pixelSizeMeters: [number, number];
    noData: number | null;
    pixelType: string;
    verticalUnits: "meters";
    verticalDatum: string;
    exportUrl: string;
  } | null;
  tiles: {
    id: string;
    name: string;
    project: string;
    demUrl: string | null;
    contourUrl: string | null;
  }[];
  contours: {
    status: "ready" | "error" | "no-data";
    method: "official-vectors" | "dem-isolines" | null;
    intervalFeet: number;
    supportedIntervals: number[];
    complete: boolean;
    features: ContourFeature[];
    error: string | null;
  };
  bounds: [number, number, number, number] | null;
}
export interface EnvironmentBundle {
  parcelId: string | null;
  flood?: FloodResult;
  wetlands?: WetlandsResult;
  elevation?: ElevationResult;
}
export type EnvironmentResult = FloodResult | WetlandsResult | ElevationResult;
export interface EnvironmentState<T> {
  status: "idle" | "loading" | "ready" | "error";
  data: T | null;
  error: string | null;
}
export type ContourCollection = FeatureCollection<
  LineString | MultiLineString,
  ContourProperties
>;
