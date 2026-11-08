/* Site annotations: machine-detected features on site imagery. Never engineer verified. */
export type EquipmentCategory =
  | "bess"
  | "bess-location"
  | "transformer"
  | "switchgear"
  | "disconnect"
  | "panel"
  | "electrical-room"
  | "utility"
  | "bollard"
  | "building"
  | "road"
  | "obstacle"
  | "other";
/** Normalized [xMin, yMin, xMax, yMax], 0–1 relative to the analyzed image. */
export type NormalizedBox = [number, number, number, number];
export interface SiteAnnotation {
  id: string;
  category: EquipmentCategory;
  label: string;
  /** Detector confidence; null for annotations a person added. */
  score: number | null;
  box: NormalizedBox;
  /** Top-left corner of the callout box, normalized to the image. */
  callout: { x: number; y: number };
  /** Text machine-read from the equipment. Transcribed only; meaning is not inferred. */
  markings: string[];
  notes: string;
  origin: "model" | "edited" | "manual";
  hidden: boolean;
  /** Engineering record fields this annotation is linked to as reference-only context. */
  linkedFieldIds?: string[];
}
export interface SiteAnalysis {
  id: string;
  createdAt: string;
  updatedAt: string;
  image: {
    source: "upload" | "street-view" | "aerial";
    fileName: string;
    width: number;
    height: number;
    size: number;
    mimeType: string;
    sourceDocumentId: string | null;
    streetView: {
      panoId: string;
      heading: number;
      pitch: number;
      fov: number;
      attribution: string;
    } | null;
    aerial?: {
      lat: number;
      lng: number;
      zoom: number;
      provider: string;
      attribution: string;
      sourceUrl: string;
    } | null;
  };
  model: {
    detector: string;
    ocr: string | null;
    threshold: number;
    durationMs: number;
  };
  annotations: SiteAnnotation[];
}

export interface ResearchSource {
  name: string;
  url: string;
}
export type MapFeatureKind =
  | "transmission-line"
  | "distribution-line"
  | "substation"
  | "transformer"
  | "pole"
  | "tower"
  | "switch"
  | "building";
export interface MapFeature {
  id: string;
  kind: MapFeatureKind;
  label: string;
  /** Point [lng, lat], or a list of [lng, lat] vertices for lines and outlines. */
  point: [number, number] | null;
  path: [number, number][] | null;
  tags: Record<string, string>;
  url: string;
}
/** Location, parcel outline and mapped power features used by the aerial plan. */
export interface SiteContext {
  address: string;
  retrievedAt: string;
  location: {
    lat: number;
    lng: number;
    matchedAddress: string;
    state: string | null;
    county: string | null;
    municipality: string | null;
    source: ResearchSource;
  } | null;
  /** Assessor parcel outline as [lng, lat] rings. */
  parcel: { id: string; rings: [number, number][][] } | null;
  features: MapFeature[];
  sourcesQueried: { name: string; url: string; ok: boolean; note: string }[];
}
