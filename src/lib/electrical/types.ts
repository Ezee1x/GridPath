import type { EvidenceReference, FieldObservation } from "../intake/types";
export interface ElectricalSite {
  siteKey: string;
  address: string;
  parcelFeatureId: string | null;
  parcelId?: string | null;
  townId?: number | null;
}
export interface AdapterResult {
  adapter: string;
  status: "found" | "empty" | "unavailable" | "error";
  message: string;
  sourceUrl: string;
}
export interface ElectricalPermit {
  id: string;
  category: string;
  issuedDate: string | null;
  filingDate: null;
  status: string;
  address: string;
  parcelId: string;
  description: string;
  sourceUrl: string;
  documentUrls: string[];
  documentAvailability: "Not exposed by this dataset";
  condition: "Historical record; current installation unknown";
  matchingMethod: string;
}
export interface ElectricalDiscovery {
  siteKey: string;
  parcelFeatureId: string | null;
  retrievedAt: string;
  publicAddress: string | null;
  municipality: string | null;
  adapters: AdapterResult[];
  utilityCandidates: {
    name: string;
    townId: number;
    recordId: string;
    sourceKey: string;
  }[];
  permits: ElectricalPermit[];
  observations: { fieldId: string; observation: FieldObservation }[];
  sources: Record<string, EvidenceReference>;
  fieldResults: Record<
    string,
    { statuses: string[]; reason: string; sourceKeys: string[] }
  >;
  customerRequests: {
    fieldId: string;
    label: string;
    request: string;
    owner: string;
  }[];
  documentEvidence: {
    fieldId: string;
    sourceKeys: string[];
    availableFiles: number;
  }[];
}
