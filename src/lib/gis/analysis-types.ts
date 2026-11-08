export type DataQuality =
  "source-backed" | "estimated" | "missing" | "needs verification";
export interface FeatureReference {
  key: string;
  dataset: string;
  serviceUrl: string;
  featureId: string | null;
  featureName: string | null;
  recordDate: string | null;
  datasetUpdated: string | null;
  retrievedAt: string | null;
}
export interface AnalysisMetric {
  id: string;
  label: string;
  textValue?: string;
  values: { value: number; unit: string }[] | null;
  quality: DataQuality;
  sources: string[];
  method: string;
  notes: string[];
}
export interface AnalysisBuilding {
  id: string;
  name: string;
  association: string;
  area: AnalysisMetric;
  boundaryDistance: AnalysisMetric;
  roadDistance?: AnalysisMetric;
}
export interface ElectricalRequirement {
  id: string;
  label: string;
  status: "missing";
  reason: string;
  requiredEvidence: string;
}
export interface SiteAnalysis {
  schemaVersion: "1.0";
  recordType: "QoreSites preliminary geographic site record";
  generatedAt: string;
  query: {
    address: string;
    latitude: number;
    longitude: number;
    provider?: string;
  };
  parcel: {
    featureId: string | null;
    parcelId: string | null;
    parcelIdentifierField: "MAP_PAR_ID" | "LOC_ID" | null;
    recordAddress: string | null;
    selection: "automatic" | "manual" | "unselected";
    pointContained: boolean | null;
    addressMatches: boolean | null;
    requiresVerification: true;
    method: string;
    sources: string[];
  };
  metrics: {
    parcelArea: AnalysisMetric;
    mappedParcelArea: AnalysisMetric;
    totalRoofprintArea: AnalysisMetric;
    containedRoofprintUnion?: AnalysisMetric;
    mappedRoofprintCoverage: AnalysisMetric;
    remainingLandArea: AnalysisMetric;
    roadProximity: AnalysisMetric;
  };
  buildings: AnalysisBuilding[];
  nearestRoad: { featureId: string; name: string } | null;
  sources: Record<string, FeatureReference>;
  electricalReadiness: ElectricalRequirement[];
  coverage: Record<
    string,
    { retrieved: boolean; warnings: string[]; error: string | null }
  >;
  coordinateMethod: { definition: string; units: "meters"; method: string };
  warnings: string[];
}
export const ELECTRICAL_REQUIREMENTS: ElectricalRequirement[] = [
  {
    id: "utility-bills",
    label: "Utility bills",
    status: "missing",
    reason: "Not supplied with this geographic record.",
    requiredEvidence:
      "Customer utility bills with tariff, demand and usage history.",
  },
  {
    id: "interval-load",
    label: "15-minute load data",
    status: "missing",
    reason: "Not available from the geographic datasets.",
    requiredEvidence:
      "Customer or utility interval export with timestamps, units and coverage dates.",
  },
  {
    id: "service-voltage",
    label: "Service voltage",
    status: "missing",
    reason: "No electrical service evidence attached.",
    requiredEvidence:
      "Utility service documentation or an engineer-reviewed existing diagram.",
  },
  {
    id: "transformer-ratings",
    label: "Transformer ratings",
    status: "missing",
    reason: "GIS geometry does not establish electrical ratings.",
    requiredEvidence:
      "Existing transformer nameplate and utility/customer equipment records.",
  },
  {
    id: "panel-capacity",
    label: "Panel capacity",
    status: "missing",
    reason: "No existing panel schedule or ratings attached.",
    requiredEvidence:
      "Existing panel nameplate, schedule and engineer-reviewed capacity evidence.",
  },
  {
    id: "existing-sld",
    label: "Existing single-line diagram",
    status: "missing",
    reason:
      "No existing electrical single-line diagram attached to this geographic record.",
    requiredEvidence:
      "Current existing-condition single-line diagram; proposed designs do not substitute for it.",
  },
];
