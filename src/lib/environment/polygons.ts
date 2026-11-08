import polygonClipping from "polygon-clipping";
import proj4 from "proj4";
import type { Feature, Geometry } from "geojson";
import type { PolygonGeometry } from "../gis/types";
import { isPolygon, SQFT_PER_SQM } from "../gis/geometry";
import {
  localProjection,
  projectedArea,
  clippedCoverage,
  polygonBoundary,
  polygonRoadDistance,
} from "../gis/projected";
import type { EvidenceReference } from "../intake/types";
import type {
  EnvironmentInput,
  EnvironmentalFeature,
  FloodResult,
  WetlandsResult,
} from "./types";
import {
  FLOOD_URL,
  FLOOD_COVERAGE_URL,
  FLOOD_PANELS_URL,
  WETLANDS_URL,
} from "./config";
import { queryPolygons } from "./query";
import { positions } from "./spatial";
function context(input: EnvironmentInput) {
  const ps = positions(input.geometry),
    xs = ps.map((p) => p[0]),
    ys = ps.map((p) => p[1]),
    projection = localProjection(
      (Math.min(...ys) + Math.max(...ys)) / 2,
      (Math.min(...xs) + Math.max(...xs)) / 2,
    ),
    parcel = projection.polygon(input.geometry);
  const projected = ps.map(projection.point),
    px = projected.map((p) => p[0]),
    py = projected.map((p) => p[1]);
  const x0 = Math.min(...px) - input.radiusMeters,
    y0 = Math.min(...py) - input.radiusMeters,
    x1 = Math.max(...px) + input.radiusMeters,
    y1 = Math.max(...py) + input.radiusMeters;
  const view: ReturnType<typeof projection.polygon> = [
    [
      [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0],
      ],
    ],
  ];
  return { projection, parcel, view };
}
export function measureEnvironmentalPolygons(
  input: EnvironmentInput,
  raw: Feature<Geometry, Record<string, unknown>>[],
  provider: string,
  url: string,
) {
  const { projection, parcel, view } = context(input);
  const features: EnvironmentalFeature[] = [];
  const shapes: ReturnType<typeof projection.polygon>[] = [];
  let geometryComplete = true;
  for (const f of raw) {
    if (!isPolygon(f.geometry)) {
      geometryComplete = false;
      continue;
    }
    try {
      const shape = projection.polygon(f.geometry),
        overlap = projectedArea(clippedCoverage(parcel, [shape])),
        distance = polygonRoadDistance(parcel, polygonBoundary(shape));
      shapes.push(shape);
      const clipped = polygonClipping.intersection(view, shape);
      if (!clipped.length) continue;
      const geometry: PolygonGeometry = {
        type: "MultiPolygon",
        coordinates: clipped.map((poly) =>
          poly.map((ring) =>
            ring.map((p) => proj4(projection.definition, "EPSG:4326", p)),
          ),
        ),
      };
      const a = f.properties,
        id = String(a.OBJECTID);
      features.push({
        type: "Feature",
        geometry,
        properties: {
          id,
          name:
            provider === "FEMA"
              ? `Zone ${String(a.FLD_ZONE ?? "not specified")}${a.ZONE_SUBTY ? ` · ${a.ZONE_SUBTY}` : ""}`
              : String(
                  a.IT_VALDESC ??
                    a.WETLAND_TYPE ??
                    a.POLY_CODE_DESC ??
                    `Mapped wetland · WETCODE ${a.WETCODE ?? "not specified"}`,
                ),
          provider,
          sourceUrl: `${url}/${id}`,
          sourceDate: null,
          attributes: a,
          overlapSquareFeet: overlap * SQFT_PER_SQM,
          boundaryDistanceFeet: distance === null ? null : distance / 0.3048,
        },
      });
    } catch {
      geometryComplete = false;
    }
  }
  const overlapSquareFeet =
    projectedArea(clippedCoverage(parcel, shapes)) * SQFT_PER_SQM;
  const distances = features
    .map((f) => f.properties.boundaryDistanceFeet)
    .filter((x): x is number => x !== null && x !== undefined);
  return {
    features,
    overlapSquareFeet,
    nearestBoundaryFeet: distances.length ? Math.min(...distances) : null,
    geometryComplete,
  };
}
export function datasetReference(
  key: string,
  provider: string,
  dataset: string,
  url: string,
  at: string,
  updated: string | null = null,
): EvidenceReference {
  return {
    key,
    provider,
    dataset,
    serviceUrl: url,
    featureId: null,
    featureName: null,
    recordDate: null,
    datasetUpdated: updated,
    retrievedAt: at,
  };
}
function featureReferences(
  features: EnvironmentalFeature[],
  prefix: string,
  at: string,
) {
  return Object.fromEntries(
    features.map((f) => {
      const p = f.properties,
        key = `${prefix}:${p.id}`;
      return [
        key,
        {
          ...datasetReference(
            key,
            p.provider,
            p.provider === "FEMA"
              ? "FEMA NFHL flood hazard zones"
              : "MassDEP Wetlands",
            p.sourceUrl,
            at,
          ),
          featureId: p.id,
          featureName: p.name,
          recordDate: p.sourceDate,
        },
      ];
    }),
  );
}
export async function collectFlood(
  input: EnvironmentInput,
): Promise<FloodResult> {
  const at = new Date().toISOString();
  const sources: Record<string, EvidenceReference> = {
    "flood:dataset": datasetReference(
      "flood:dataset",
      "FEMA",
      "National Flood Hazard Layer — Flood Hazard Zones",
      FLOOD_URL,
      at,
    ),
  };
  const base = {
    kind: "flood" as const,
    parcelId: input.parcelId,
    retrievedAt: at,
    sources,
    method:
      "Parcel/polygon intersection in a site-local azimuthal equidistant meter projection. Overlap areas are unioned before conversion to square feet. Display geometry is clipped to the bounded site view.",
  };
  try {
    const [zones, availability, panels] = await Promise.allSettled([
      queryPolygons(FLOOD_URL, input, [
        "OBJECTID",
        "FLD_ZONE",
        "ZONE_SUBTY",
        "SFHA_TF",
        "DFIRM_ID",
        "FLD_AR_ID",
        "SOURCE_CIT",
        "V_DATUM",
        "STATIC_BFE",
        "LEN_UNIT",
      ]),
      queryPolygons(FLOOD_COVERAGE_URL, input, ["OBJECTID", "STUDY_ID"]),
      queryPolygons(FLOOD_PANELS_URL, input, [
        "OBJECTID",
        "DFIRM_ID",
        "FIRM_PAN",
        "EFF_DATE",
        "PRE_DATE",
        "PANEL_TYP",
        "SOURCE_CIT",
      ]),
    ]);
    if (zones.status === "rejected") throw zones.reason;
    const measured = measureEnvironmentalPolygons(
      input,
      zones.value.features,
      "FEMA",
      FLOOD_URL,
    );
    const specialRaw = zones.value.features.filter(
      (f) => String(f.properties.SFHA_TF).toUpperCase() === "T",
    );
    const special = measureEnvironmentalPolygons(
      input,
      specialRaw,
      "FEMA",
      FLOOD_URL,
    );
    Object.assign(sources, featureReferences(measured.features, "flood", at));
    const warnings = [
      "Preliminary mapped screening, not a regulatory flood determination or proof of no flood risk.",
      "FEMA geometry is requested in native NAD83 (EPSG:4269), generalized by the service at 0.00001 degree (roughly 1 meter locally) to avoid its full-geometry query failure. NAD83/WGS84 display alignment is approximate; areas and distances are computed in projected meters, never degree units.",
    ];
    const complete = zones.value.complete && measured.geometryComplete;
    let coverage: FloodResult["coverage"] = "unknown";
    if (zones.value.features.length) coverage = "mapped";
    else if (
      availability.status === "fulfilled" &&
      availability.value.complete
    ) {
      const { projection, parcel } = context(input);
      const shapes = availability.value.features
        .filter((f) => isPolygon(f.geometry))
        .map((f) => projection.polygon(f.geometry as PolygonGeometry));
      const ratio =
        projectedArea(clippedCoverage(parcel, shapes)) / projectedArea(parcel);
      coverage = ratio >= 0.99999 ? "no-mapped-hazard" : "no-coverage";
    }
    if (availability.status === "fulfilled")
      for (const f of availability.value.features) {
        const key = `flood-coverage:${f.properties.OBJECTID}`;
        sources[key] = {
          ...datasetReference(
            key,
            "FEMA",
            "NFHL Availability",
            `${FLOOD_COVERAGE_URL}/${f.properties.OBJECTID}`,
            at,
          ),
          featureId: String(f.properties.OBJECTID),
        };
      }
    else
      warnings.push(
        "NFHL availability could not be checked; empty hazard results cannot establish coverage.",
      );
    const effectivePanels =
      panels.status === "fulfilled"
        ? panels.value.features.map((f) => f.properties)
        : [];
    if (panels.status === "rejected")
      warnings.push("Effective FIRM panel information could not be retrieved.");
    for (const p of effectivePanels) {
      const key = `flood-panel:${p.OBJECTID}`;
      sources[key] = {
        ...datasetReference(
          key,
          "FEMA",
          "NFHL FIRM Panels",
          `${FLOOD_PANELS_URL}/${p.OBJECTID}`,
          at,
        ),
        featureId: String(p.OBJECTID),
        featureName: String(p.FIRM_PAN ?? p.DFIRM_ID ?? ""),
        recordDate:
          typeof p.EFF_DATE === "number"
            ? new Date(p.EFF_DATE).toISOString().slice(0, 10)
            : null,
      };
    }
    if (!complete)
      warnings.push(
        "Flood source geometry/response is incomplete; intersection areas may be lower bounds.",
      );
    return {
      ...base,
      status:
        coverage === "no-coverage" || coverage === "unknown"
          ? "no-data"
          : "ready",
      error: null,
      warnings,
      coverage,
      complete,
      features: measured.features,
      zones: [
        ...new Set(
          zones.value.features.map((f) =>
            String(f.properties.FLD_ZONE ?? "Not specified"),
          ),
        ),
      ],
      specialFloodHazardIntersection: complete ? specialRaw.length > 0 : null,
      overlapSquareFeet: complete ? measured.overlapSquareFeet : null,
      specialHazardOverlapSquareFeet: complete
        ? special.overlapSquareFeet
        : null,
      effectivePanels,
    };
  } catch (e) {
    return {
      ...base,
      status: "error",
      error: e instanceof Error ? e.message : "FEMA request failed",
      warnings: ["FEMA retrieval failed; no flood determination is made."],
      coverage: "unknown",
      complete: false,
      features: [],
      zones: [],
      specialFloodHazardIntersection: null,
      overlapSquareFeet: null,
      specialHazardOverlapSquareFeet: null,
      effectivePanels: [],
    };
  }
}
export async function collectWetlands(
  input: EnvironmentInput,
): Promise<WetlandsResult> {
  const at = new Date().toISOString();
  const sources: Record<string, EvidenceReference> = {
    "wetlands:dataset": datasetReference(
      "wetlands:dataset",
      "MassDEP / MassGIS",
      "MADEP Wetlands — mapped resource polygons",
      WETLANDS_URL,
      at,
    ),
  };
  const base = {
    kind: "wetlands" as const,
    parcelId: input.parcelId,
    retrievedAt: at,
    sources,
    radiusMeters: input.radiusMeters,
    method:
      "Wetland polygons queried with a parcel-based meter buffer. Intersection union area and parcel-polygon-to-wetland-boundary minimum distance use a site-local meter projection; zero distance means the mapped wetland boundary intersects or lies within the parcel.",
  };
  try {
    const result = await queryPolygons(
      WETLANDS_URL,
      input,
      [
        "OBJECTID",
        "WETCODE",
        "IT_VALC",
        "IT_VALDESC",
        "POLY_CODE",
        "SOURCE",
        "SOURCE_SCA",
        "SOURCE_SCALE",
        "WETLAND_TYPE",
        "POLY_CODE_DESC",
      ],
      input.radiusMeters,
    );
    const measured = measureEnvironmentalPolygons(
      input,
      result.features,
      "MassDEP / MassGIS",
      WETLANDS_URL,
    );
    Object.assign(
      sources,
      featureReferences(measured.features, "wetlands", at),
    );
    const complete = result.complete && measured.geometryComplete;
    return {
      ...base,
      status: "ready",
      error: null,
      complete,
      features: measured.features,
      intersects: complete
        ? measured.overlapSquareFeet > 0 || measured.nearestBoundaryFeet === 0
        : null,
      overlapSquareFeet: complete ? measured.overlapSquareFeet : null,
      nearestBoundaryFeet: measured.nearestBoundaryFeet,
      warnings: [
        "Uses the official statewide MassGIS DEP Wetland Areas service. The initially supplied MADEP_Wetlands copy has a regional extent and is not used to infer statewide absence.",
        "Planning-scale mapped wetlands, primarily interpreted from 2005 imagery with earlier baselines and source-specific updates. Dataset edit dates are not imagery dates.",
        "Not a formal wetland delineation, regulatory buffer, protected-area finding or installation prohibition.",
        ...(!complete
          ? [
              "Response or geometry is incomplete; no absence conclusion can be made.",
            ]
          : []),
      ],
    };
  } catch (e) {
    return {
      ...base,
      status: "error",
      error: e instanceof Error ? e.message : "Wetlands request failed",
      complete: false,
      features: [],
      intersects: null,
      overlapSquareFeet: null,
      nearestBoundaryFeet: null,
      warnings: [
        "Wetlands retrieval failed; other site sources remain available.",
      ],
    };
  }
}
