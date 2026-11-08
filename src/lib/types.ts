export type FieldStatus =
  | "Missing"
  | "Needs review"
  | "Source-backed"
  | "Conflicting evidence"
  | "Engineer verified";
export interface SiteField {
  id: string;
  category: string;
  label: string;
  value: string | number | null;
  unit: string | null;
  required: boolean;
  conditionType: "existing" | "proposed" | "unknown";
  status: FieldStatus;
  confidence: "Documented" | "Estimated" | "Unknown";
  sourceIds: string[];
  reviewedBy: string | null;
  reviewedAt: string | null;
  notes: string;
}
export interface SourceDocument {
  id: string;
  title: string;
  type: string;
  fileName: string;
  url: string | null;
  uploadedAt: string;
  retrievedAt: string | null;
  referencePage: string | null;
  sourceAuthority: string;
  size: number | null;
  localFile?: boolean;
}
export interface MissingRequirement {
  id: string;
  fieldId: string;
  title: string;
  priority: "Critical" | "High" | "Standard";
  explanation: string;
  suggestedAction: string;
  assignedTo: string;
  status: "Missing" | "Requested" | "Received" | "Verified";
  sourceType: string;
  notes: string;
  documentIds: string[];
}
export interface SiteRecord {
  mapPlaceId?: string;
  parcelFeatureId?: string | null;
  id: string;
  facilityName: string;
  address: string;
  location: {
    municipality: string | null;
    coordinates: [number, number] | null;
    parcelGeometry: GeoJSONGeometry | null;
  };
  lifecycleStatus: "Preliminary" | "Needs review" | "Ready for review";
  dataFields: SiteField[];
  sourceDocuments: SourceDocument[];
  missingRequirements: MissingRequirement[];
  createdAt: string;
  updatedAt: string;
  sample: boolean;
}
export interface GeoJSONGeometry {
  type: "Polygon";
  coordinates: number[][][];
}
