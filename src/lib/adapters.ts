import { SiteRecord, SiteField, SourceDocument } from "./types";
/** Future FastAPI contract. Implementations must preserve provenance and never silently infer unknowns. */
export interface SiteRepository {
  list(): Promise<SiteRecord[]>;
  get(id: string): Promise<SiteRecord | null>;
  save(site: SiteRecord): Promise<SiteRecord>;
}
export interface GeographicSourceAdapter {
  provider:
    "MassGIS" | "Municipal GIS" | "FEMA" | "OpenStreetMap" | "Google Places";
  lookup(
    address: string,
    signal?: AbortSignal,
  ): Promise<{
    fields: SiteField[];
    sources: SourceDocument[];
    location: SiteRecord["location"];
  }>;
}
export interface ExtractionAdapter {
  extract(
    document: SourceDocument,
    signal?: AbortSignal,
  ): Promise<{ fields: SiteField[]; sources: SourceDocument[] }>;
}
export const integrationTargets = [
  {
    name: "MassGIS",
    detail: "Live assessment parcels, mapped roofprints & road centerlines",
  },
  { name: "Municipal GIS", detail: "Zoning, jurisdiction & permits" },
  { name: "FEMA", detail: "Flood hazard information" },
  { name: "OpenStreetMap", detail: "Geographic context & road access" },
  {
    name: "Document extraction / FastAPI",
    detail: "Structured fields with source references",
  },
];
