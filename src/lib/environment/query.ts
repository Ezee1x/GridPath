import proj4 from "proj4";
import type { PolygonGeometry } from "../gis/types";
import { geojsonToArcGIS, arcgisToGeoJSON } from "@terraformer/arcgis";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { normalizeFeatureSet, isPolygon } from "../gis/geometry";
import type { EnvironmentInput } from "./types";
import { MAX_SOURCE_FEATURES, WFS_URL } from "./config";
interface Meta {
  name?: string;
  geometryType?: string;
  capabilities?: string;
  fields?: { name: string }[];
  editingInfo?: { dataLastEditDate?: number };
  extent?: { spatialReference?: { wkid?: number; latestWkid?: number } };
}
const metadata = new Map<string, Promise<Meta>>();
export async function jsonRequest(
  url: string,
  params: Record<string, string>,
  post = false,
): Promise<Record<string, unknown>> {
  const query = new URLSearchParams(params);
  const r = await fetch(post ? url : `${url}?${query}`, {
    method: post ? "POST" : "GET",
    ...(post
      ? {
          body: query,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      : {}),
    signal: AbortSignal.timeout(18000),
    cache: "no-store",
  });
  if (!r.ok) throw Error(`Public source returned HTTP ${r.status}.`);
  const text = await r.text();
  if (text.length > 24000000)
    throw Error("Source geometry exceeds this bounded analysis limit.");
  const d = JSON.parse(text);
  if (d.error) throw Error("Public source rejected the bounded query.");
  return d;
}
export async function sourceMetadata(url: string) {
  let p = metadata.get(url);
  if (!p) {
    p = jsonRequest(url, { f: "json" })
      .then((d) => {
        const m = d as Meta;
        if (!m.capabilities?.includes("Query") || !m.fields?.length)
          throw Error("Public source schema or Query capability changed.");
        return m;
      })
      .catch((e) => {
        metadata.delete(url);
        throw e;
      });
    metadata.set(url, p);
  }
  return p;
}
function datumGeometry(g: PolygonGeometry, toNative: boolean): PolygonGeometry {
  const source = toNative ? "EPSG:4326" : "+proj=longlat +datum=NAD83 +no_defs",
    target = toNative ? "+proj=longlat +datum=NAD83 +no_defs" : "EPSG:4326";
  const transform = (ring: number[][]) =>
    ring.map((p) => proj4(source, target, [p[0], p[1]]));
  return g.type === "Polygon"
    ? { ...g, coordinates: g.coordinates.map(transform) }
    : { ...g, coordinates: g.coordinates.map((poly) => poly.map(transform)) };
}
export async function queryPolygons(
  url: string,
  input: EnvironmentInput,
  fields: string[],
  distance = 0,
) {
  const meta = await sourceMetadata(url);
  if (meta.geometryType !== "esriGeometryPolygon")
    throw Error("Expected a polygon source.");
  const fema = url.includes("hazards.fema.gov");
  const geometry = geojsonToArcGIS(
    fema ? datumGeometry(input.geometry, true) : input.geometry,
  );
  const params = {
    f: "json",
    where: "1=1",
    geometry: JSON.stringify({
      ...geometry,
      spatialReference: { wkid: fema ? 4269 : 4326 },
    }),
    geometryType: "esriGeometryPolygon",
    inSR: "4326",
    outSR: "4326",
    returnGeometry: "true",
    spatialRel: "esriSpatialRelIntersects",
    outFields: fields
      .filter((f) => meta.fields!.some((x) => x.name === f))
      .join(","),
    resultRecordCount: String(MAX_SOURCE_FEATURES),
    ...(url.includes("hazards.fema.gov")
      ? {
          inSR: "4269",
          outSR: "4269",
          maxAllowableOffset: "0.00001",
          geometryPrecision: "7",
        }
      : {}),
    ...(distance
      ? { distance: String(distance), units: "esriSRUnit_Meter" }
      : {}),
  };
  const data = await jsonRequest(url + "/query", params, true);
  const nativeReference = (
    data.spatialReference as { wkid?: number } | undefined
  )?.wkid;
  if (fema && nativeReference !== 4269)
    throw Error("FEMA returned an unexpected native reference system.");
  const normalized = fema
    ? {
        features: (data.features as unknown[]).map(
          (f) =>
            arcgisToGeoJSON(
              f as Parameters<typeof arcgisToGeoJSON>[0],
            ) as unknown as Feature,
        ),
      }
    : normalizeFeatureSet(data);
  if (fema)
    for (const feature of normalized.features)
      if (feature.geometry && isPolygon(feature.geometry))
        feature.geometry = datumGeometry(feature.geometry, false);
  const unique = [
    ...new Map(
      normalized.features.map((f) => [String(f.properties?.OBJECTID), f]),
    ).values(),
  ];
  return {
    features: unique as Feature<Geometry, Record<string, unknown>>[],
    complete:
      data.exceededTransferLimit !== true &&
      unique.length < MAX_SOURCE_FEATURES,
    meta,
  };
}
export async function queryWfs(
  typeName: string,
  bounds: number[],
  maxFeatures: number,
  elevations?: number[],
) {
  const data = await jsonRequest(WFS_URL, {
    service: "WFS",
    version: "1.0.0",
    request: "GetFeature",
    typeName,
    srsName: "EPSG:4326",
    ...(elevations
      ? {
          cql_filter: `BBOX(shape,${bounds.join(",")},'EPSG:4326') AND elev_ft IN (${elevations.join(",")})`,
          propertyName: "shape,elev_ft,elev_m,index_",
          format_options: "precision:7",
        }
      : { bbox: bounds.join(",") + ",EPSG:4326" }),
    outputFormat: "application/json",
    maxFeatures: String(maxFeatures),
  });
  const d = data as unknown as FeatureCollection;
  if (d.type !== "FeatureCollection" || !Array.isArray(d.features))
    throw Error("WFS did not return source geometry.");
  return {
    features: d.features,
    complete:
      d.features.length < maxFeatures &&
      (typeof data.totalFeatures !== "number" ||
        data.totalFeatures <= maxFeatures),
  };
}
