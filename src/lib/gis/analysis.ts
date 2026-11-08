import { GIS_SERVICES } from "./config";
import { isPolygon, SQFT_PER_SQM } from "./geometry";
import {
  clippedCoverage,
  localProjection,
  minimumLineDistance,
  polygonBoundary,
  polygonRoadDistance,
  projectedArea,
  remainingPolygon,
} from "./projected";
import type { ProjectedPolygon } from "./projected";
import { ELECTRICAL_REQUIREMENTS } from "./analysis-types";
import type {
  AnalysisMetric,
  DataQuality,
  SiteAnalysis,
  AnalysisBuilding,
} from "./analysis-types";
import type { GisFeature, GisLayerResult, LayerKind } from "./types";
export interface AnalysisInput {
  latitude: number;
  longitude: number;
  address: string;
  parcel: GisFeature | null;
  manual: boolean;
  layers: Record<LayerKind, GisLayerResult | null>;
  errors: Partial<Record<LayerKind, string | null>>;
}
export function analyzeSite(input: AnalysisInput): SiteAnalysis {
  const { parcel, layers } = input,
    projection = localProjection(input.latitude, input.longitude);
  const sources: SiteAnalysis["sources"] = {};
  for (const kind of ["parcels", "buildings", "roads"] as LayerKind[]) {
    const layer = layers[kind],
      config = GIS_SERVICES[kind];
    sources[`${kind}:dataset`] = {
      key: `${kind}:dataset`,
      dataset: config.label,
      serviceUrl: config.url,
      featureId: null,
      featureName: null,
      recordDate: null,
      datasetUpdated: layer?.source.datasetUpdated ?? null,
      retrievedAt: layer?.source.retrievedAt ?? null,
    };
    for (const feature of layer?.features ?? []) {
      const p = feature.properties,
        key = `${kind}:${p.id}`;
      sources[key] = {
        key,
        dataset: p.source.name,
        serviceUrl: p.source.url,
        featureId: p.id,
        featureName: p.name,
        recordDate: p.sourceDate,
        datasetUpdated: p.source.datasetUpdated,
        retrievedAt: p.source.retrievedAt,
      };
    }
  }
  const ref = (f: GisFeature) => `${f.properties.kind}:${f.properties.id}`;
  if (parcel && !sources[ref(parcel)]) {
    const p = parcel.properties,
      key = ref(parcel);
    sources[key] = {
      key,
      dataset: p.source.name,
      serviceUrl: p.source.url,
      featureId: p.id,
      featureName: p.name,
      recordDate: p.sourceDate,
      datasetUpdated: p.source.datasetUpdated,
      retrievedAt: p.source.retrievedAt,
    };
  }
  const parcelRefs = parcel ? [ref(parcel)] : ["parcels:dataset"];
  const warnings: string[] = [
    "Preliminary mapped context only. Remaining land is not assessed installation space. Distances are not legal setbacks, surveyed clearances or proof of road access.",
    "Electrical requirements refer to evidence attached to this geographic record; existing saved engineering reviews are not overwritten.",
  ];
  const metric = (
    id: string,
    label: string,
    value: number | null,
    unit: "area" | "distance",
    quality: DataQuality,
    method: string,
    refs: string[],
    notes: string[] = [],
  ): AnalysisMetric => ({
    id,
    label,
    values:
      value === null
        ? null
        : unit === "area"
          ? [
              { value: value * SQFT_PER_SQM, unit: "sq ft" },
              { value, unit: "m²" },
              { value: value / 4046.8564224, unit: "acres" },
            ]
          : [
              { value: value / 0.3048, unit: "ft" },
              { value, unit: "m" },
            ],
    quality:
      value === null
        ? quality === "needs verification"
          ? "needs verification"
          : "missing"
        : quality,
    method,
    sources: [...new Set(refs)],
    notes,
  });
  const projectedMethod =
    "WGS84 geometry projected with Proj4 to site-local azimuthal equidistant coordinates in meters. Planar polygon area subtracts holes. Approximate public mapping; no survey precision implied.";
  let parcelShape: ProjectedPolygon | null = null;
  try {
    if (parcel && isPolygon(parcel.geometry))
      parcelShape = projection.polygon(parcel.geometry);
  } catch {
    warnings.push(
      "Parcel geometry could not be projected; derived parcel measurements are missing.",
    );
  }
  const mappedArea = parcelShape ? projectedArea(parcelShape) : null;
  const sourceArea = parcel?.properties.measurement;
  const reportedArea =
    sourceArea && !sourceArea.approximate ? sourceArea : null;
  const parcelArea = metric(
    "parcel-area",
    "Parcel area",
    reportedArea?.squareMeters ?? mappedArea,
    "area",
    reportedArea ? "source-backed" : "estimated",
    reportedArea?.method ?? projectedMethod,
    parcelRefs,
    ["Assessor reported lot area can differ from mapped polygon area."],
  );
  const mappedParcelArea = metric(
    "mapped-parcel-area",
    "Mapped parcel polygon area",
    mappedArea,
    "area",
    "estimated",
    projectedMethod,
    parcelRefs,
  );
  const buildingLayer = layers.buildings,
    roofRefs: string[] = [];
  const projectedRoofs: ProjectedPolygon[] = [];
  const containedRoofs: ProjectedPolygon[] = [];
  const buildings: AnalysisBuilding[] = [];
  let sum = 0,
    sumComplete = true,
    geometryComplete = true,
    containedCount = 0;
  for (const feature of buildingLayer?.features ?? []) {
    const p = feature.properties,
      within = p.association.startsWith("Within selected parcel"),
      crossing = p.association.startsWith("Crosses parcel boundary");
    if (parcel && !within && !crossing) continue;
    let shape: ProjectedPolygon | null = null;
    try {
      if (isPolygon(feature.geometry))
        shape = projection.polygon(feature.geometry);
    } catch {
      geometryComplete = false;
    }
    const fieldValue = Number(p.attributes.AREA_SQ_FT),
      fromField = Number.isFinite(fieldValue) && fieldValue > 0;
    const areaValue = fromField
      ? fieldValue / SQFT_PER_SQM
      : shape
        ? projectedArea(shape)
        : null;
    const area = metric(
      `roof-area:${p.id}`,
      `Roofprint ${p.name}`,
      areaValue,
      "area",
      fromField ? "source-backed" : "estimated",
      fromField
        ? "MassGIS AREA_SQ_FT; square-foot source field converted to m² and acres."
        : projectedMethod,
      [ref(feature)],
      [p.association, "Mapped roofprint is not usable floor area."],
    );
    if (within) {
      if (shape) containedRoofs.push(shape);
      containedCount++;
      if (areaValue !== null) sum += areaValue;
      else sumComplete = false;
    }
    if (parcel && (within || crossing)) {
      roofRefs.push(ref(feature));
      if (shape) projectedRoofs.push(shape);
      else geometryComplete = false;
    }
    const distance =
      shape && parcelShape
        ? minimumLineDistance(
            polygonBoundary(shape),
            polygonBoundary(parcelShape),
          )
        : null;
    const boundaryDistance = metric(
      `boundary-distance:${p.id}`,
      `Roofprint ${p.name} to parcel boundary`,
      distance,
      "distance",
      crossing ? "needs verification" : "estimated",
      "Minimum 2D segment-to-segment distance between projected roofprint rings and all selected parcel boundary rings, including holes. Intersections return zero.",
      [...parcelRefs, ref(feature)],
      crossing
        ? [
            "Roofprint crosses the selected parcel boundary. Zero is an intersection, not an acceptable setback.",
          ]
        : [
            "Approximate mapped separation only; not a regulatory setback or engineering clearance.",
          ],
    );
    let roadDistance: number | null = null;
    let nearestRoadId: string | null = null;
    let invalidRoadGeometry = false;
    if (shape)
      for (const road of layers.roads?.features ?? []) {
        try {
          const d = polygonRoadDistance(shape, projection.lines(road.geometry));
          if (d !== null && (roadDistance === null || d < roadDistance)) {
            roadDistance = d;
            nearestRoadId = road.properties.id;
          }
        } catch {
          invalidRoadGeometry = true;
        }
      }
    const roadMetric = metric(
      `roof-road:${p.id}`,
      `Roofprint ${p.name} to returned road centerline`,
      roadDistance,
      "distance",
      layers.roads?.warnings.length || invalidRoadGeometry
        ? "needs verification"
        : "estimated",
      "Minimum projected polygon-to-centerline distance for this roofprint and returned road features; zero indicates intersection. No vehicle access is established.",
      [
        ref(feature),
        ...(nearestRoadId ? [`roads:${nearestRoadId}`] : ["roads:dataset"]),
      ],
      invalidRoadGeometry
        ? [
            "Some road geometry could not be measured; this nearest result may be incomplete.",
          ]
        : [],
    );
    buildings.push({
      id: p.id,
      name: p.name,
      association: p.association,
      area,
      boundaryDistance,
      roadDistance: roadMetric,
    });
  }
  const buildingsComplete =
    !!buildingLayer && !buildingLayer.warnings.length && geometryComplete;
  let containedUnionArea: number | null = null;
  if (parcelShape && buildingsComplete) {
    try {
      containedUnionArea = projectedArea(
        clippedCoverage(parcelShape, containedRoofs),
      );
    } catch {
      warnings.push("Contained roofprint union could not be calculated.");
    }
  }
  const containedRoofprintUnion = metric(
    "contained-roofprint-union",
    "Contained mapped roofprint area (union)",
    containedUnionArea,
    "area",
    "estimated",
    `${projectedMethod} Union of contained roofprint geometries; overlaps counted once. Crossing roofprints are excluded.`,
    [
      ...parcelRefs,
      "buildings:dataset",
      ...buildings
        .filter((b) => b.association.startsWith("Within"))
        .flatMap((b) => b.area.sources),
    ],
    [
      "Distinct from the sum of source-reported individual areas and parcel-clipped coverage of crossing structures.",
    ],
  );
  const totalRoofprintArea = metric(
    "total-roofprint-area",
    "Total contained roofprint area",
    parcel && buildingLayer && sumComplete ? sum : null,
    "area",
    buildingLayer?.warnings.length
      ? "needs verification"
      : buildings.some((b) => b.area.quality === "estimated")
        ? "estimated"
        : "source-backed",
    "Sum of source AREA_SQ_FT (or documented projected fallback) for retrieved contained roofprints only. Boundary-crossing and outside features excluded.",
    [
      ...parcelRefs,
      ...buildings
        .filter((b) => b.association.startsWith("Within"))
        .flatMap((b) => b.area.sources),
      "buildings:dataset",
    ],
    [
      `${containedCount} contained returned features. Source areas may overlap; this is a sum, not roofprint union coverage.`,
      ...(buildingLayer?.warnings ?? []),
    ],
  );
  let coverage: number | null = null,
    remaining: number | null = null;
  if (parcelShape && buildingsComplete) {
    try {
      const union = clippedCoverage(parcelShape, projectedRoofs);
      coverage = projectedArea(union);
      remaining = projectedArea(remainingPolygon(parcelShape, union));
    } catch {
      warnings.push(
        "Polygon union/difference could not be calculated; land coverage values are missing.",
      );
    }
  }
  const coverageSources = [...parcelRefs, "buildings:dataset", ...roofRefs];
  const remainingNotes = [
    "Parcel geometry minus union of all intersecting mapped roofprints clipped to the parcel, including crossing portions. Overlapping roofprints are counted once.",
    "Includes unassessed roads, paving, landscaping and other constraints. Does not establish available BESS installation space.",
    ...(!buildingsComplete
      ? [
          "Incomplete or unavailable roofprint coverage prevents a remaining-land estimate.",
        ]
      : []),
  ];
  const mappedRoofprintCoverage = metric(
    "roofprint-coverage",
    "Mapped roofprint coverage inside parcel",
    coverage,
    "area",
    !buildingsComplete ? "needs verification" : "estimated",
    `${projectedMethod} Projected polygon intersection and union; boundary-crossing portions clipped to parcel.`,
    coverageSources,
    remainingNotes,
  );
  const remainingLandArea = metric(
    "remaining-land",
    "Approximate land not covered by mapped roofprints",
    remaining,
    "area",
    !buildingsComplete ? "needs verification" : "estimated",
    `${projectedMethod} Area of parcel polygon minus union of parcel-clipped roofprints. Uses mapped geometry area, not assessor lot size.`,
    coverageSources,
    remainingNotes,
  );
  let nearestRoad: SiteAnalysis["nearestRoad"] = null,
    roadDistance: number | null = null;
  let roadCalculationError = false;
  for (const road of layers.roads?.features ?? []) {
    if (!parcelShape) break;
    try {
      const value = polygonRoadDistance(
        parcelShape,
        projection.lines(road.geometry),
      );
      if (value !== null && (roadDistance === null || value < roadDistance)) {
        roadDistance = value;
        nearestRoad = {
          featureId: road.properties.id,
          name: road.properties.name,
        };
      }
    } catch {
      roadCalculationError = true;
    }
  }
  const roadProximity = metric(
    "road-proximity",
    "Parcel to nearest returned mapped road centerline",
    roadDistance,
    "distance",
    layers.roads?.warnings.length || roadCalculationError
      ? "needs verification"
      : "estimated",
    "Minimum projected 2D distance from the selected parcel polygon to each returned road centerline. Returns zero if a road intersects or lies inside the parcel. Search is bounded; this is not a route distance.",
    [
      ...parcelRefs,
      ...(nearestRoad ? [`roads:${nearestRoad.featureId}`] : ["roads:dataset"]),
    ],
    [
      "Proximity does not establish legal, truck, construction or emergency access.",
      ...(layers.roads?.warnings ?? []),
      ...(roadCalculationError
        ? [
            "Some road geometry could not be measured; the nearest result may be incomplete.",
          ]
        : []),
    ],
  );
  if (!parcel)
    warnings.push(
      "Parcel is unselected. Choose a candidate before interpreting site totals, land estimates or distances.",
    );
  if (
    parcel &&
    (!parcel.properties.containsPoint || !parcel.properties.addressMatch)
  )
    warnings.push(
      "Selected parcel does not satisfy both point containment and normalized street-address agreement. Manual association needs verification.",
    );
  if (roadCalculationError)
    warnings.push("Some road geometry could not be measured.");
  const mapParcelId = String(
    parcel?.properties.attributes.MAP_PAR_ID ?? "",
  ).trim();
  const locId = String(parcel?.properties.attributes.LOC_ID ?? "").trim();
  return {
    schemaVersion: "1.0",
    recordType: "QoreSites preliminary geographic site record",
    generatedAt: new Date().toISOString(),
    query: {
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
    },
    parcel: {
      featureId: parcel?.properties.id ?? null,
      parcelId: mapParcelId || locId || null,
      parcelIdentifierField: mapParcelId
        ? "MAP_PAR_ID"
        : locId
          ? "LOC_ID"
          : null,
      recordAddress: parcel?.properties.name ?? null,
      selection: !parcel ? "unselected" : input.manual ? "manual" : "automatic",
      pointContained: parcel?.properties.containsPoint ?? null,
      addressMatches: parcel?.properties.addressMatch ?? null,
      requiresVerification: true,
      method:
        "A unique fee parcel containing the selected point and matching its normalized street address can be suggested automatically. Other candidates require manual selection. No parcel association is engineer verified.",
      sources: parcelRefs,
    },
    metrics: {
      parcelArea,
      mappedParcelArea,
      totalRoofprintArea,
      containedRoofprintUnion,
      mappedRoofprintCoverage,
      remainingLandArea,
      roadProximity,
    },
    buildings,
    nearestRoad,
    sources,
    electricalReadiness: ELECTRICAL_REQUIREMENTS.map((r) => ({ ...r })),
    coverage: Object.fromEntries(
      (["parcels", "buildings", "roads"] as LayerKind[]).map((k) => [
        k,
        {
          retrieved: !!layers[k],
          warnings: layers[k]?.warnings ?? [],
          error: input.errors[k] ?? null,
        },
      ]),
    ),
    coordinateMethod: {
      definition: projection.definition,
      units: "meters",
      method:
        "Site-local WGS84 azimuthal equidistant projection. Meter-based polygon and segment calculations are approximate at this bounded site scale; inputs retain public dataset accuracy limits.",
    },
    warnings,
  };
}
