import { propertyFields } from "./property";
import type { PropertyData } from "../gis/property";
import type { SelectedAddress } from "../maps/address";
import type { SiteAnalysis, AnalysisMetric } from "../gis/analysis-types";
import type { GisLayerResult } from "../gis/types";
import type {
  EvidenceReference,
  FieldObservation,
  IntakeRecord,
  JsonValue,
} from "./types";
import { observationId, mergeCollectedFields } from "./model";
import type { SiteRecord } from "../types";
export interface NormalizedCollection {
  fields: { fieldId: string; observation: FieldObservation }[];
  sources: Record<string, EvidenceReference>;
}
export interface IntakeAdapter {
  name: string;
  state: "connected" | "not integrated";
  normalize?: (...args: never[]) => NormalizedCollection;
}
export const FUTURE_ADAPTERS = [
  { name: "MunicipalZoningAdapter", state: "not integrated" },
  { name: "UtilityTariffAdapter", state: "not integrated" },
  { name: "DocumentExtractionAdapter", state: "not integrated" },
] as const;
export function MassGISAdapter(
  analysis: SiteAnalysis,
  address: Omit<SelectedAddress, "source"> & { source: string },
  layers: { parcels: GisLayerResult | null; roads: GisLayerResult | null },
  property?: PropertyData,
): NormalizedCollection {
  const sources: Record<string, EvidenceReference> = Object.fromEntries(
    Object.entries(analysis.sources).map(([k, s]) => [
      k,
      { ...s, provider: "MassGIS" },
    ]),
  );
  const fields: NormalizedCollection["fields"] = [];
  function add(
    id: string,
    value: JsonValue,
    unit: string | null,
    keys: string[],
    method: string,
    calculated = false,
    originalUnits: string | null = unit,
    complete = true,
  ) {
    if (value === null || value === "") return;
    const provider = keys.includes("address:point")
      ? address.source
      : "MassGIS";
    fields.push({
      fieldId: id,
      observation: {
        id: observationId(id, value, provider, keys, method, unit),
        value,
        unit,
        originalUnits,
        provenance: calculated
          ? "Calculated from GIS geometry"
          : "Public GIS record",
        provider,
        sourceKeys: keys,
        method,
        confidence: calculated ? "Estimated" : "Documented",
        observedAt: new Date().toISOString(),
        complete,
      },
    });
  }
  function metric(id: string, m: AnalysisMetric, originalUnits?: string) {
    if (m.values)
      add(
        id,
        m.values as unknown as JsonValue,
        m.values[0]?.unit ?? null,
        m.sources,
        m.method,
        m.quality !== "source-backed",
        originalUnits ??
          (m.quality === "source-backed"
            ? "sq ft"
            : "WGS84 geometry; projected meters"),
      );
  }
  const identity = propertyFields(analysis, address, layers.parcels, property);
  Object.assign(sources, identity.sources);
  fields.push(...identity.fields);
  const associated = analysis.buildings.filter((b) =>
    b.association.startsWith("Within"),
  );
  if (analysis.parcel.featureId && analysis.coverage.buildings.retrieved)
    add(
      "buildingCount",
      associated.length,
      "roofprints",
      ["buildings:dataset", ...associated.flatMap((b) => b.area.sources)],
      "Count of retrieved mapped roofprints contained in the selected parcel; associations remain unverified.",
      true,
    );
  if (
    analysis.parcel.featureId &&
    analysis.buildings.some((b) => b.area.values)
  )
    add(
      "individualRoofAreas",
      analysis.buildings.map((b) => ({
        featureId: b.id,
        name: b.name,
        association: b.association,
        area: b.area.values,
      })) as unknown as JsonValue,
      "sq ft",
      analysis.buildings.flatMap((b) => b.area.sources),
      "Individual MassGIS roofprint areas (or documented projected fallback); contained and crossing associations labelled.",
    );
  metric(
    "totalRoofArea",
    analysis.metrics.containedRoofprintUnion ??
      analysis.metrics.totalRoofprintArea,
  );
  metric("unbuiltArea", analysis.metrics.remainingLandArea);
  if (analysis.buildings.some((b) => b.boundaryDistance.values))
    add(
      "boundaryDistances",
      analysis.buildings.map((b) => ({
        featureId: b.id,
        name: b.name,
        association: b.association,
        distances: b.boundaryDistance.values,
      })) as unknown as JsonValue,
      "ft",
      analysis.buildings.flatMap((b) => b.boundaryDistance.sources),
      "Per-roofprint minimum projected ring-to-ring distance to selected parcel boundaries; crossing geometry returns zero and needs verification.",
      true,
      "projected meters",
    );
  if (layers.roads) {
    const refs = layers.roads.features.map((f) => `roads:${f.properties.id}`);
    if (refs.length) {
      add(
        "roadNames",
        [...new Set(layers.roads.features.map((f) => f.properties.name))],
        null,
        refs,
        "Names from returned MassGIS road centerlines; no access confirmation.",
      );
      const classified = layers.roads.features.filter(
        (f) =>
          f.properties.attributes.ROAD_CLASS !== null &&
          f.properties.attributes.ROAD_CLASS !== undefined,
      );
      if (classified.length)
        add(
          "roadClass",
          classified.map((f) => ({
            featureId: f.properties.id,
            road: f.properties.name,
            sourceClassificationCode: String(
              f.properties.attributes.ROAD_CLASS,
            ),
          })),
          null,
          classified.map((f) => `roads:${f.properties.id}`),
          "Original ROAD_CLASS codes from MassGIS; codes are not interpreted as truck-access suitability.",
        );
    }
  }
  if (
    analysis.parcel.featureId &&
    analysis.buildings.some((b) => b.roadDistance?.values)
  )
    add(
      "roadBuildingDistance",
      analysis.buildings.map((b) => ({
        buildingFeatureId: b.id,
        distances: b.roadDistance?.values ?? null,
      })) as unknown as JsonValue,
      "ft",
      analysis.buildings.flatMap((b) => b.roadDistance?.sources ?? []),
      "Minimum projected distance from each roofprint polygon to returned road centerlines; no access claim.",
      true,
      "projected meters",
    );
  return { fields, sources };
}
export function mergeLegacyRecord(
  record: IntakeRecord,
  legacy: SiteRecord,
): IntakeRecord {
  const map: Record<string, string> = {
    address: "address",
    parcel: "parcelId",
    zoning: "zoning",
    utility: "utility",
    voltage: "voltage",
    phase: "phase",
    breaker: "breaker",
    meter: "meterModel",
    singleLine: "singleLine",
    room: "room",
    poi: "poi",
    load: "interval",
    peak: "demand",
    tariff: "tariff",
    power: "power",
    energy: "capacity",
    battery: "battery",
    inverters: "inverter",
  };
  const sources: Record<string, EvidenceReference> = {};
  for (const s of legacy.sourceDocuments) {
    const key = `legacy:${legacy.id}:${s.id}`;
    sources[key] = {
      key,
      provider: s.sourceAuthority,
      dataset: s.title,
      serviceUrl: s.url ?? "",
      featureId: null,
      featureName: s.referencePage,
      recordDate: null,
      datasetUpdated: null,
      retrievedAt: s.retrievedAt,
      documentId: s.id,
      fileName: s.fileName,
      referenceOnly: !s.url && !s.localFile,
    };
  }
  const incoming: NormalizedCollection["fields"] = legacy.dataFields
    .filter((f) => map[f.id] && f.value !== null)
    .map((f) => {
      const id = map[f.id],
        keys = f.sourceIds.map((k) => `legacy:${legacy.id}:${k}`);
      return {
        fieldId: id,
        observation: {
          id: observationId(
            id,
            f.value!,
            `Saved record ${legacy.id}`,
            keys,
            f.notes,
            f.unit,
          ),
          value: f.value!,
          unit: f.unit,
          originalUnits: f.unit,
          provider: `Saved record ${legacy.id}`,
          provenance: "User supplied",
          sourceKeys: keys,
          method: `Explicitly linked saved record. ${f.notes}`,
          confidence: f.confidence === "Estimated" ? "Estimated" : "Documented",
          observedAt: legacy.updatedAt,
        },
      };
    });
  let merged = mergeCollectedFields(record, incoming, sources);
  merged = {
    ...merged,
    identity: { ...merged.identity, linkedLegacySiteId: legacy.id },
  };
  merged.fields = merged.fields.map((f) => {
    const old = legacy.dataFields.find(
      (o) =>
        map[o.id] === f.id &&
        o.status === "Engineer verified" &&
        o.value !== null,
    );
    if (!old) return f;
    if (f.review.status === "Engineer verified") return f;
    const imported = incoming.find((i) => i.fieldId === f.id);
    return imported
      ? {
          ...f,
          selectedId: imported.observation.id,
          pinned: true,
          review: {
            status: "Engineer verified",
            reviewer: old.reviewedBy,
            at: old.reviewedAt,
            note: old.notes,
          },
        }
      : f;
  });
  return merged;
}
