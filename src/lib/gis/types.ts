import type { Feature, Geometry, Polygon, MultiPolygon } from "geojson";
export type LayerKind = "parcels" | "buildings" | "roads";
export type PolygonGeometry = Polygon | MultiPolygon;
export interface Measurement {
  squareFeet: number;
  squareMeters: number;
  acres: number;
  method: string;
  approximate: boolean;
}
export interface GisSource {
  activity?: import("../engineering/activity").CollectionActivity;
  name: string;
  url: string;
  geometryType: string;
  nativeWkid: number | null;
  datasetUpdated: string | null;
  retrievedAt: string;
  attribution: string;
}
export interface GisProperties {
  [key: string]: unknown;
  id: string;
  kind: LayerKind;
  name: string;
  attributes: Record<string, unknown>;
  source: GisSource;
  sourceDate: string | null;
  verification: "Public GIS record — needs verification";
  measurement: Measurement | null;
  geometryArea?: Measurement | null;
  association: string;
  containsPoint?: boolean;
  addressMatch?: boolean;
}
export type GisFeature = Feature<Geometry, GisProperties>;
export interface GisLayerResult {
  queryLocation?: import("./public-address").PublicQueryLocation;
  kind: LayerKind;
  features: GisFeature[];
  source: GisSource;
  warnings: string[];
  selectedParcelId?: string | null;
  matchMessage?: string;
}
export interface GisLayerState {
  activity?: import("../engineering/activity").CollectionActivity;
  status: "idle" | "loading" | "ready" | "error";
  result: GisLayerResult | null;
  error: string | null;
}
