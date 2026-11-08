import type { NormalizedCollection } from "../intake/adapters";
import type { FieldObservation, JsonValue } from "../intake/types";
import type {
  FloodResult,
  WetlandsResult,
  ElevationResult,
  EnvironmentBundle,
} from "./types";
import type { PropertyData } from "../gis/property";
import { observationId } from "../intake/model";
import { MUNICIPALITY_URL } from "../intake/property";
import { MassachusettsCodeReferenceAdapter } from "../intake/ma-code-references";
function normalized(
  fieldId: string,
  value: JsonValue,
  provider: string,
  sources: NormalizedCollection["sources"],
  method: string,
  at: string,
  complete = true,
  warnings: string[] = [],
  calculated = false,
  unit: string | null = null,
  originalUnits: string | null = unit,
): NormalizedCollection {
  const keys = Object.keys(sources);
  const observation: FieldObservation = {
    id: observationId(fieldId, value, provider, keys, method, unit),
    value,
    provider,
    unit,
    originalUnits,
    sourceKeys: keys,
    provenance: calculated
      ? "Calculated from GIS geometry"
      : "Public GIS record",
    confidence: calculated ? "Estimated" : "Documented",
    method,
    observedAt: at,
    complete,
    warnings,
  };
  return { fields: [{ fieldId, observation }], sources };
}
const empty = (): NormalizedCollection => ({ fields: [], sources: {} });
const rounded = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 1 });
export function FEMAFloodAdapter(data: FloodResult): NormalizedCollection {
  if (data.status !== "ready") return { fields: [], sources: data.sources };
  const value =
    data.coverage === "no-mapped-hazard"
      ? "No mapped flood hazard polygons intersect the parcel in the queried NFHL coverage; this does not establish no flood risk."
      : `Mapped FEMA zone${data.zones.length === 1 ? "" : "s"} ${data.zones.join(", ")}; ${data.specialFloodHazardIntersection === true ? "mapped special flood hazard intersects" : data.specialFloodHazardIntersection === false ? "no mapped special flood hazard intersection in this response" : "special flood hazard intersection needs verification"}${data.specialHazardOverlapSquareFeet !== null ? `; ${rounded(data.specialHazardOverlapSquareFeet)} sq ft special-hazard overlap` : ""}. Preliminary screening.`;
  return normalized(
    "flood",
    value,
    "FEMA",
    data.sources,
    data.method,
    data.retrievedAt,
    data.complete,
    [
      "Preliminary mapped screening; verify the current FEMA map and site conditions.",
    ],
    true,
    null,
    "Source polygon WGS84; projected meters / square meters",
  );
}
export function MassDEPWetlandsAdapter(
  data: WetlandsResult,
): NormalizedCollection {
  if (data.status !== "ready") return { fields: [], sources: data.sources };
  const value = data.features.length
    ? `${data.intersects === true ? "Mapped wetlands intersect the parcel" : data.intersects === false ? "No mapped parcel overlap" : "Parcel overlap needs verification"}${data.overlapSquareFeet !== null ? `; ${rounded(data.overlapSquareFeet)} sq ft mapped overlap` : ""}${data.nearestBoundaryFeet !== null ? `; nearest mapped wetland boundary ${rounded(data.nearestBoundaryFeet)} ft from parcel polygon` : ""}. Not a regulatory delineation.`
    : `No wetland polygons mapped in the ${data.radiusMeters} m parcel-buffer query. Wetland absence is not established.`;
  return normalized(
    "wetlands",
    value,
    "MassDEP / MassGIS",
    data.sources,
    data.method,
    data.retrievedAt,
    data.complete,
    [
      "Planning-scale wetland mapping; field delineation and municipal confirmation may be required.",
    ],
    true,
    null,
    "Source polygon WGS84; projected meters / square meters",
  );
}
export function MassGISElevationAdapter(
  data: ElevationResult,
): NormalizedCollection {
  if (!data.summary) return { fields: [], sources: data.sources };
  const s = data.summary;
  return normalized(
    "elevation",
    {
      kind: "terrain-elevation",
      medianFeet: s.medianFeet,
      minimumFeet: s.minimumFeet,
      maximumFeet: s.maximumFeet,
      rangeFeet: s.rangeFeet,
    },
    "MassGIS LiDAR",
    data.sources,
    data.method,
    data.retrievedAt,
    s.validCoverageFraction >= 0.999 && s.completeParcelExtent,
    [
      "Historical bare-earth LiDAR; current grading and survey accuracy require verification.",
      ...(!s.completeParcelExtent || s.validCoverageFraction < 0.999
        ? [
            "Partial terrain coverage; statistics describe valid sampled cells only.",
          ]
        : []),
    ],
    true,
    "ft",
    "Bare-earth Float32 DEM meters",
  );
}
export function MunicipalityJurisdictionAdapter(
  data: PropertyData | undefined,
): NormalizedCollection {
  if (!data?.municipality) return empty();
  const key = `permitting-municipality:${data.townId}`,
    name = data.municipality.name;
  return normalized(
    "permitting",
    {
      kind: "candidate-jurisdiction",
      municipality: name,
      candidateBuildingJurisdiction: name,
      verifiedBuildingDepartment: null,
      verifiedFireJurisdiction: null,
    },
    "MassGIS",
    {
      [key]: {
        key,
        provider: "MassGIS",
        dataset: "Official municipality — candidate permitting geography",
        serviceUrl: `${MUNICIPALITY_URL}/${data.municipality.recordId}`,
        featureId: data.municipality.recordId,
        featureName: name,
        recordDate: null,
        datasetUpdated: null,
        retrievedAt: data.retrievedAt,
        townId: data.townId,
        matchingMethod:
          "Selected parcel TOWN_ID equals official municipal TOWN_ID. No department assignment inferred.",
      },
    },
    "Municipality identifies initial candidate building-permit geography only. Building/electrical AHJ and any state or special jurisdiction must be confirmed. Fire jurisdiction is not assigned without evidence.",
    data.retrievedAt,
    false,
    [
      "Candidate permitting jurisdiction — authority verification required. No department contacts or fire jurisdiction have been inferred.",
    ],
  );
}
export function environmentalCollection(
  bundle: EnvironmentBundle | undefined,
  parcelId: string | null,
  property?: PropertyData,
  expectedTownId?: number,
): NormalizedCollection {
  const collections = [
    ...(expectedTownId &&
    Number.isInteger(expectedTownId) &&
    expectedTownId >= 1 &&
    expectedTownId <= 351
      ? [MassachusettsCodeReferenceAdapter()]
      : []),
    MunicipalityJurisdictionAdapter(
      property?.townId === expectedTownId ? property : undefined,
    ),
  ];
  if (bundle?.parcelId === parcelId) {
    if (bundle.flood) collections.push(FEMAFloodAdapter(bundle.flood));
    if (bundle.wetlands)
      collections.push(MassDEPWetlandsAdapter(bundle.wetlands));
    if (bundle.elevation)
      collections.push(MassGISElevationAdapter(bundle.elevation));
  }
  return {
    fields: collections.flatMap((c) => c.fields),
    sources: Object.assign({}, ...collections.map((c) => c.sources)),
  };
}
