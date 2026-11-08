import type { SiteAnalysis, FeatureReference } from "../gis/analysis-types";
export type Provenance =
  | "Public GIS record"
  | "Calculated from GIS geometry"
  | "Customer document"
  | "User supplied"
  | "Engineer verified"
  | "Not available";
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type RequestStatus =
  "Missing" | "Requested" | "Received" | "Under review" | "Verified";
export interface EvidenceReference extends FeatureReference {
  provider: string;
  documentId?: string;
  fileName?: string;
  fileHash?: string;
  referenceOnly?: boolean;
  fiscalYear?: number | null;
  locId?: string | null;
  townId?: number | null;
  propertyId?: string | null;
  matchingMethod?: string;
}
export interface FieldObservation {
  id: string;
  value: JsonValue;
  unit: string | null;
  originalUnits: string | null;
  provenance: Provenance;
  provider: string;
  sourceKeys: string[];
  method: string;
  confidence: "Documented" | "Estimated" | "User supplied";
  observedAt: string;
  complete?: boolean;
  autoSelect?: boolean;
  warnings?: string[];
}
export interface IntakeField {
  evidenceKeys?: string[];
  priority?: import("./schema").Priority;
  reviewHistory?: {
    observationId: string | null;
    review: IntakeField["review"];
  }[];
  rejectedObservations?: Record<
    string,
    { reviewer: string; note: string; at: string }
  >;
  id: string;
  observations: FieldObservation[];
  selectedId: string | null;
  pinned: boolean;
  excludedReviews?: {
    observationId: string;
    review: IntakeField["review"];
    reason: string;
  }[];
  review: {
    status: "Unreviewed" | "Under review" | "Engineer verified";
    reviewer: string | null;
    at: string | null;
    note: string;
  };
  request: { status: RequestStatus; owner: string; notes: string };
}
export interface IntakeRecord {
  electricalDiscovery?: import("../electrical/types").ElectricalDiscovery;
  schemaVersion: "2.0";
  fieldSchemaVersion?: 3;
  stage?: "intake" | "design";
  legacyMigration?: {
    siteId?: string;
    extraRequests?: IntakeRecord["extraRequests"];
    requirements?: unknown[];
    dataFields?: unknown[];
  };
  siteKey: string;
  identity: {
    placeId: string;
    address: string;
    parcelFeatureId: string | null;
    linkedLegacySiteId: string | null;
  };
  createdAt: string;
  updatedAt: string;
  fields: IntakeField[];
  sources: Record<string, EvidenceReference>;
  analysis: SiteAnalysis | null;
  environment?: import("../environment/types").EnvironmentBundle;
  retiredFields?: IntakeField[];
  propertyIdentification?: import("../gis/property").PropertyData;
  extraRequests: Record<
    string,
    { status: RequestStatus; owner: string; notes: string }
  >;
}
