import type { Feature, Geometry } from "geojson";
import {
  GIS_SERVICES,
  STATE_SERVICE,
  CANDIDATE_RADIUS_METERS,
  MAX_FEATURES,
} from "./config";
import {
  buildingAssociation,
  chooseParcel,
  containsPoint,
  envelope,
  geometryMeasurement,
  measurement,
  normalizeFeatureSet,
  normalizedStreet,
  SQFT_PER_SQM,
  parcelSourceMeasurement,
} from "./geometry";
import type { GisFeature, GisLayerResult, GisSource, LayerKind } from "./types";
interface Metadata {
  name: string;
  geometryType: string;
  capabilities: string;
  supportedQueryFormats: string;
  objectIdField: string;
  fields: { name: string }[];
  extent?: { spatialReference?: { wkid?: number; latestWkid?: number } };
  editingInfo?: { dataLastEditDate?: number; lastEditDate?: number };
  advancedQueryCapabilities?: { supportsPagination?: boolean };
}
export class GisRequestError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
export async function requestJson(
  url: string,
  params: Record<string, string>,
  post = false,
): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const body = new URLSearchParams(params);
      const response = await fetch(post ? url : `${url}?${body}`, {
        method: post ? "POST" : "GET",
        ...(post
          ? {
              body,
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
            }
          : {}),
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      });
      if (!response.ok) {
        if (
          attempt === 0 &&
          (response.status === 429 || response.status >= 500)
        )
          continue;
        throw new GisRequestError(
          `Public GIS service returned HTTP ${response.status}. Retry this layer.`,
        );
      }
      const data = await response.json();
      if (data?.error)
        throw new GisRequestError(
          "The public GIS service rejected the query. Retry this layer or review service availability.",
        );
      return data;
    } catch (error) {
      if (error instanceof GisRequestError) throw error;
      if (attempt === 1)
        throw new GisRequestError(
          "Public GIS service timed out or could not be reached. Retry this layer.",
        );
    }
  }
  throw new GisRequestError("Public GIS service is unavailable.");
}
const metadataCache = new Map<
  LayerKind,
  { expires: number; promise: Promise<Metadata> }
>();
export async function layerMetadata(kind: LayerKind): Promise<Metadata> {
  const cached = metadataCache.get(kind);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = requestJson(GIS_SERVICES[kind].url, { f: "json" })
    .then((data) => {
      const meta = data as Metadata;
      if (
        !meta.capabilities?.includes("Query") ||
        meta.geometryType !== GIS_SERVICES[kind].geometryType ||
        !Array.isArray(meta.fields) ||
        meta.objectIdField !== "OBJECTID"
      )
        throw new GisRequestError(
          "The GIS layer schema has changed; source review is required.",
        );
      return meta;
    })
    .catch((error) => {
      metadataCache.delete(kind);
      throw error;
    });
  metadataCache.set(kind, { expires: Date.now() + 3600000, promise });
  return promise;
}
const stateCache = new Map<
  string,
  { expires: number; promise: Promise<void> }
>();
export async function confirmMassachusetts(
  lat: number,
  lng: number,
): Promise<void> {
  const key = `${lat},${lng}`;
  const cached = stateCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = requestJson(STATE_SERVICE + "/query", {
    f: "json",
    where: "STUSAB = 'MA'",
    geometry: JSON.stringify({
      x: lng,
      y: lat,
      spatialReference: { wkid: 4326 },
    }),
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    returnGeometry: "false",
    outFields: "STUSAB",
    resultRecordCount: "1",
  })
    .then((data) => {
      if (!(data as { features?: unknown[] }).features?.length)
        throw new GisRequestError(
          "The selected coordinates are outside Massachusetts.",
          400,
        );
    })
    .catch((error) => {
      stateCache.delete(key);
      throw error;
    });
  if (stateCache.size >= 256)
    stateCache.delete(stateCache.keys().next().value!);
  stateCache.set(key, { expires: Date.now() + 300000, promise });
  return promise;
}
function source(kind: LayerKind, meta: Metadata): GisSource {
  const updated =
    meta.editingInfo?.dataLastEditDate ?? meta.editingInfo?.lastEditDate;
  return {
    name: GIS_SERVICES[kind].label,
    url: GIS_SERVICES[kind].url,
    geometryType: meta.geometryType,
    nativeWkid:
      meta.extent?.spatialReference?.latestWkid ??
      meta.extent?.spatialReference?.wkid ??
      null,
    datasetUpdated: updated ? new Date(updated).toISOString() : null,
    retrievedAt: new Date().toISOString(),
    attribution:
      "MassGIS, Commonwealth of Massachusetts; municipal and dataset contributors",
  };
}
function recordDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const s = String(value);
  if (/^\d{8}$/.test(s))
    return s.slice(4) === "0000"
      ? s.slice(0, 4)
      : s.slice(0, 4) +
          "-" +
          s.slice(4, 6) +
          (s.slice(6) === "00" ? "" : "-" + s.slice(6));
  return s;
}
interface QueryResult {
  features: Feature[];
  warnings: string[];
}
export async function queryLayer(
  kind: LayerKind,
  meta: Metadata,
  spatial: Record<string, string>,
): Promise<QueryResult> {
  const outFields = GIS_SERVICES[kind].fields
    .filter((f) => meta.fields.some((field) => field.name === f))
    .join(",");
  const params = {
    where: "1=1",
    inSR: "4326",
    outSR: "4326",
    returnGeometry: "true",
    outFields,
    spatialRel: "esriSpatialRelIntersects",
    resultRecordCount: String(MAX_FEATURES),
    orderByFields: meta.objectIdField,
    ...spatial,
  };
  const format = meta.supportedQueryFormats?.toLowerCase().includes("geojson")
    ? "geojson"
    : "json";
  let data: unknown;
  try {
    data = await requestJson(
      GIS_SERVICES[kind].url + "/query",
      { ...params, f: format },
      true,
    );
  } catch (error) {
    if (format !== "geojson") throw error;
    data = await requestJson(
      GIS_SERVICES[kind].url + "/query",
      { ...params, f: "json" },
      true,
    );
  }
  const collection = normalizeFeatureSet(data);
  const unique = new Map<string, Feature>();
  for (const f of collection.features) {
    if (!f.geometry || !f.properties) continue;
    const id = f.properties[meta.objectIdField];
    if (id === undefined || id === null) continue;
    unique.set(String(id), f);
  }
  const limited =
    collection.features.length >= MAX_FEATURES ||
    (data as { exceededTransferLimit?: boolean }).exceededTransferLimit;
  return {
    features: [...unique.values()],
    warnings: limited
      ? [
          "Result limit reached. Coverage is incomplete; narrow the search and review omitted features.",
        ]
      : [],
  };
}
function normalize(
  kind: LayerKind,
  raw: Feature[],
  src: GisSource,
): GisFeature[] {
  return raw.map((f) => {
    const a = f.properties ?? {};
    const buildingArea = Number(a.AREA_SQ_FT);
    return {
      ...f,
      id: `${kind}:${a.OBJECTID}`,
      properties: {
        id: String(a.OBJECTID),
        kind,
        name: String(
          kind === "parcels"
            ? a.SITE_ADDR || a.MAP_PAR_ID || "Parcel"
            : kind === "buildings"
              ? a.STRUCT_ID || "Mapped roofprint"
              : a.ST_NAME_STD || "Unnamed mapped road",
        ),
        attributes: a,
        source: src,
        sourceDate: recordDate(
          kind === "parcels"
            ? a.LAST_EDIT
            : kind === "buildings"
              ? a.SOURCEDATE
              : a.DATE_UPD,
        ),
        verification: "Public GIS record — needs verification",
        measurement:
          kind === "roads"
            ? null
            : kind === "buildings" &&
                Number.isFinite(buildingArea) &&
                buildingArea > 0
              ? measurement(
                  buildingArea / SQFT_PER_SQM,
                  "Source AREA_SQ_FT from MassGIS mapped roofprint; units converted",
                  false,
                )
              : kind === "parcels"
                ? (parcelSourceMeasurement(a) ??
                  geometryMeasurement(f.geometry!))
                : geometryMeasurement(f.geometry!),
        geometryArea:
          kind === "parcels" ? geometryMeasurement(f.geometry!) : null,
        association:
          kind === "parcels"
            ? "Candidate parcel — not a legal survey"
            : kind === "roads"
              ? "Mapped proximity only — access not evaluated"
              : "Nearby — parcel association unconfirmed",
      },
    } as GisFeature;
  });
}
export interface SiteQuery {
  lat: number;
  lng: number;
  address: string;
  parcelId: string | null;
}
const point = (q: SiteQuery) => ({
  geometry: JSON.stringify({
    x: q.lng,
    y: q.lat,
    spatialReference: { wkid: 4326 },
  }),
  geometryType: "esriGeometryPoint",
});
export async function collectParcels(q: SiteQuery): Promise<GisLayerResult> {
  const meta = await layerMetadata("parcels");
  const src = source("parcels", meta);
  const exact = await queryLayer("parcels", meta, point(q));
  let raw = exact.features;
  const warnings = [...exact.warnings];
  let normalized = normalize("parcels", raw, src).map((f) => ({
    ...f,
    properties: {
      ...f.properties,
      containsPoint: containsPoint(f.geometry, q.lng, q.lat),
      addressMatch:
        !!q.address &&
        normalizedStreet(f.properties.name) === normalizedStreet(q.address),
    },
  }));
  if (!chooseParcel(normalized, q.address)) {
    const nearby = await queryLayer("parcels", meta, {
      ...point(q),
      distance: String(CANDIDATE_RADIUS_METERS),
      units: "esriSRUnit_Meter",
    });
    raw = [
      ...new Map(
        [...raw, ...nearby.features].map((f) => [
          String(f.properties?.OBJECTID),
          f,
        ]),
      ).values(),
    ];
    warnings.push(...nearby.warnings);
    normalized = normalize("parcels", raw, src).map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        containsPoint: containsPoint(f.geometry, q.lng, q.lat),
        addressMatch:
          !!q.address &&
          normalizedStreet(f.properties.name) === normalizedStreet(q.address),
      },
    }));
  }
  normalized.sort(
    (a, b) =>
      Number(b.properties.containsPoint) - Number(a.properties.containsPoint) ||
      Number(b.properties.addressMatch) - Number(a.properties.addressMatch) ||
      a.properties.name.localeCompare(b.properties.name),
  );
  const selectedParcelId = chooseParcel(normalized, q.address);
  return {
    kind: "parcels",
    source: src,
    features: normalized,
    warnings,
    selectedParcelId,
    matchMessage: selectedParcelId
      ? "Point and street address match one fee parcel. Association needs verification."
      : "Parcel could not be confidently matched. Manual selection required.",
  };
}
async function selectedParcel(q: SiteQuery): Promise<Geometry | null> {
  if (!q.parcelId) return null;
  const meta = await layerMetadata("parcels");
  const result = await queryLayer("parcels", meta, {
    ...point(q),
    distance: String(CANDIDATE_RADIUS_METERS),
    units: "esriSRUnit_Meter",
    where: `${meta.objectIdField} = ${q.parcelId}`,
  });
  const match = result.features.find(
    (f) => String(f.properties?.OBJECTID) === q.parcelId,
  );
  if (!match?.geometry)
    throw new GisRequestError(
      "Selected parcel is no longer available within the candidate search. Retry parcel lookup.",
      409,
    );
  return match.geometry;
}
export async function collectContext(
  kind: "buildings" | "roads",
  q: SiteQuery,
): Promise<GisLayerResult> {
  const [meta, parcel] = await Promise.all([
    layerMetadata(kind),
    selectedParcel(q),
  ]);
  const scope = envelope(
    parcel,
    q.lng,
    q.lat,
    kind === "roads" ? 250 : parcel ? 20 : 100,
  );
  const result = await queryLayer(kind, meta, {
    geometry: scope.geometry,
    geometryType: "esriGeometryEnvelope",
  });
  const src = source(kind, meta);
  const features = normalize(kind, result.features, src);
  if (kind === "buildings")
    for (const f of features) {
      try {
        f.properties.association = buildingAssociation(f.geometry, parcel);
      } catch {
        f.properties.association =
          "Geometry association could not be calculated — review required";
        result.warnings.push(
          "One or more building geometries require manual association review.",
        );
      }
    }
  return {
    kind,
    source: src,
    features,
    warnings: [
      ...result.warnings,
      ...(!parcel
        ? [
            "No selected parcel. Features are nearby context only; no site roofprint total is asserted.",
          ]
        : []),
      ...(scope.clipped
        ? [
            "Large parcel search capped to 2 km from the selected address; coverage may be incomplete.",
          ]
        : []),
    ],
  };
}
