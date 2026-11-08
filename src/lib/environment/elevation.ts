import { fromArrayBuffer } from "geotiff";
import type { Feature, LineString, MultiLineString, Position } from "geojson";
import type {
  EnvironmentInput,
  ElevationResult,
  ContourFeature,
} from "./types";
import type { EvidenceReference } from "../intake/types";
import {
  DEM_URL,
  WFS_URL,
  INDEX_TYPE,
  CONTOUR_TYPE,
  LIDAR_DOCUMENTATION,
  CONTOUR_DOCUMENTATION,
} from "./config";
import { jsonRequest, queryWfs } from "./query";
import { terrainExtent, toMeters, toWgs84, clipLine } from "./spatial";
import { datasetReference } from "./polygons";
import { marchingIsolines } from "./isolines";
export interface DemGrid {
  values: Float32Array;
  mask: Float32Array | null;
  width: number;
  height: number;
  origin: [number, number];
  resolution: [number, number];
  offset: number;
  noData: number | null;
  extent: [number, number, number, number];
  exportUrl: string;
}
export function publicTileUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
const rasterCache = new Map<
  string,
  { expires: number; promise: Promise<DemGrid> }
>();
export function validPixel(g: DemGrid, i: number) {
  const v = g.values[i];
  return (
    Number.isFinite(v) &&
    v > -1000 &&
    v < 9000 &&
    (g.noData === null || v !== g.noData) &&
    (!g.mask || g.mask[i] > 0)
  );
}
export async function decodeDem(
  bytes: ArrayBuffer,
  exportUrl: string,
): Promise<DemGrid> {
  const tiff = await fromArrayBuffer(bytes),
    image = await tiff.getImage(),
    keys = image.getGeoKeys() ?? {};
  if (keys.ProjectedCSTypeGeoKey !== 26986)
    throw Error("DEM returned an unexpected projection; sampling is withheld.");
  if (image.getSampleFormat(0) !== 3 || image.getBitsPerSample(0) !== 32)
    throw Error("DEM is not a 32-bit floating-point elevation raster.");
  if (
    image.getWidth() > 650 ||
    image.getHeight() > 650 ||
    image.getSamplesPerPixel() < 1
  )
    throw Error("DEM response exceeds bounded raster dimensions.");
  const rasters = await image.readRasters(),
    origin = image.getOrigin(),
    r = image.getResolution();
  if (!(r[0] > 0 && r[1] < 0))
    throw Error("Unsupported DEM raster orientation.");
  return {
    values: Float32Array.from(rasters[0] as ArrayLike<number>),
    mask:
      rasters.length > 1
        ? Float32Array.from(rasters[1] as ArrayLike<number>)
        : null,
    width: image.getWidth(),
    height: image.getHeight(),
    origin: [origin[0], origin[1]],
    resolution: [r[0], r[1]],
    offset: keys.GTRasterTypeGeoKey === 2 ? 0 : 0.5,
    noData: image.getGDALNoData(),
    extent: image.getBoundingBox() as [number, number, number, number],
    exportUrl,
  };
}
async function loadDem(input: EnvironmentInput): Promise<DemGrid> {
  const bounds = terrainExtent(input.geometry).extent,
    key = bounds.join(",");
  const old = rasterCache.get(key);
  if (old && old.expires > Date.now()) return old.promise;
  const promise = (async () => {
    const meta = await jsonRequest(DEM_URL, { f: "json" });
    if (
      meta.pixelType !== "F32" ||
      !String(meta.capabilities).includes("Image")
    )
      throw Error("The float DEM service schema changed.");
    const width = bounds[2] - bounds[0],
      height = bounds[3] - bounds[1],
      resolution = Math.max(1, width / 600, height / 600);
    const params = {
      f: "json",
      bbox: bounds.join(","),
      bboxSR: "26986",
      imageSR: "26986",
      size: `${Math.ceil(width / resolution)},${Math.ceil(height / resolution)}`,
      format: "tiff",
      pixelType: "F32",
      noData: "-9999",
      interpolation: "RSP_NearestNeighbor",
      adjustAspectRatio: "false",
      renderingRule: JSON.stringify({ rasterFunction: "None" }),
    };
    const result = await jsonRequest(DEM_URL + "/exportImage", params);
    const href = new URL(String(result.href));
    if (
      href.protocol !== "https:" ||
      href.hostname !== "arcgisserver.digital.mass.gov" ||
      !href.pathname.startsWith(
        "/arcgisserver/rest/directories/arcgisoutput/LiDAR/",
      )
    )
      throw Error("Unexpected DEM download location.");
    const response = await fetch(href, {
      signal: AbortSignal.timeout(25000),
      cache: "no-store",
    });
    if (!response.ok) throw Error("DEM raster download failed.");
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 20000000)
      throw Error("DEM exceeds the bounded download limit.");
    return decodeDem(
      bytes,
      `${DEM_URL}/exportImage?${new URLSearchParams(params)}`,
    );
  })().catch((e) => {
    rasterCache.delete(key);
    throw e;
  });
  if (rasterCache.size >= 8)
    rasterCache.delete(rasterCache.keys().next().value!);
  rasterCache.set(key, { expires: Date.now() + 600000, promise });
  return promise;
}
function contains(p: Position, r: Position[]) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i],
      b = r[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
export function sampleParcel(
  g: DemGrid,
  input: EnvironmentInput,
): ElevationResult["summary"] {
  const polys = (
    input.geometry.type === "Polygon"
      ? [input.geometry.coordinates]
      : input.geometry.coordinates
  ).map((poly) => poly.map((r) => r.map(toMeters)));
  let total = 0;
  const values: number[] = [];
  for (let y = 0; y < g.height; y++)
    for (let x = 0; x < g.width; x++) {
      const p = [
        g.origin[0] + (x + g.offset) * g.resolution[0],
        g.origin[1] + (y + g.offset) * g.resolution[1],
      ];
      if (
        !polys.some(
          (poly) =>
            contains(p, poly[0]) && !poly.slice(1).some((h) => contains(p, h)),
        )
      )
        continue;
      total++;
      const i = y * g.width + x;
      if (validPixel(g, i)) values.push(g.values[i]);
    }
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2),
    median =
      values.length % 2
        ? values[middle]
        : (values[middle - 1] + values[middle]) / 2,
    min = values[0],
    max = values.at(-1)!;
  return {
    medianFeet: median / 0.3048,
    minimumFeet: min / 0.3048,
    maximumFeet: max / 0.3048,
    rangeFeet: (max - min) / 0.3048,
    validSamples: values.length,
    parcelSamples: total,
    validCoverageFraction: values.length / total,
    completeParcelExtent:
      terrainExtent(input.geometry).complete &&
      polys
        .flat(2)
        .every(
          (p) =>
            p[0] >= g.extent[0] - 0.001 &&
            p[0] <= g.extent[2] + 0.001 &&
            p[1] >= g.extent[1] - 0.001 &&
            p[1] <= g.extent[3] + 0.001,
        ),
  };
}
export function demContours(
  g: DemGrid,
  intervalFeet: number,
): ContourFeature[] {
  let min = Infinity,
    max = -Infinity;
  for (let i = 0; i < g.values.length; i++)
    if (validPixel(g, i)) {
      min = Math.min(min, g.values[i]);
      max = Math.max(max, g.values[i]);
    }
  if (!Number.isFinite(min)) return [];
  const step = intervalFeet * 0.3048,
    levels: number[] = [];
  for (let z = Math.ceil(min / step) * step; z <= max; z += step) {
    if (levels.length >= 500)
      throw Error("Contour density exceeds the bounded processing limit.");
    levels.push(z);
  }
  const lines = marchingIsolines(g.values, g.width, g.height, levels, (i) =>
    validPixel(g, i),
  );
  return lines.flatMap(({ level, lines }) =>
    lines.map((line, index) => ({
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: line.map((p) =>
          toWgs84([
            g.origin[0] + (p[0] + g.offset) * g.resolution[0],
            g.origin[1] + (p[1] + g.offset) * g.resolution[1],
          ]),
        ),
      },
      properties: {
        id: `dem:${Math.round(level / 0.3048)}:${index}`,
        elevationFeet: Math.round(level / 0.3048),
        elevationMeters: level,
        sourceUrl: g.exportUrl,
        method: "dem-isolines" as const,
      },
    })),
  );
}
function officialContours(
  raw: Feature[],
  extent: [number, number, number, number],
  interval: number,
): ContourFeature[] {
  const result: ContourFeature[] = [];
  for (const f of raw) {
    const ft = Number(f.properties?.elev_ft),
      m = Number(f.properties?.elev_m);
    if (
      !Number.isFinite(ft) ||
      !Number.isFinite(m) ||
      Math.abs(ft / interval - Math.round(ft / interval)) > 1e-6 ||
      !f.geometry ||
      !["LineString", "MultiLineString"].includes(f.geometry.type)
    )
      continue;
    const g = f.geometry as LineString | MultiLineString,
      lines = (
        g.type === "LineString" ? [g.coordinates] : g.coordinates
      ).flatMap((line) => clipLine(line, extent));
    if (!lines.length) continue;
    result.push({
      type: "Feature",
      geometry: { type: "MultiLineString", coordinates: lines },
      properties: {
        id: String(f.id),
        elevationFeet: ft,
        elevationMeters: m,
        sourceUrl: `${WFS_URL}?${new URLSearchParams({ service: "WFS", version: "1.0.0", request: "GetFeature", typeName: CONTOUR_TYPE, featureID: String(f.id), outputFormat: "application/json", srsName: "EPSG:4326" })}`,
        method: "official-vectors",
      },
    });
  }
  return result;
}
export async function collectElevation(
  input: EnvironmentInput,
): Promise<ElevationResult> {
  const at = new Date().toISOString(),
    area = terrainExtent(input.geometry),
    sources: Record<string, EvidenceReference> = {
      "elevation:dem": datasetReference(
        "elevation:dem",
        "MassGIS",
        "LiDAR 2013–2021 32-bit float bare-earth DEM",
        DEM_URL,
        at,
      ),
      "elevation:index": datasetReference(
        "elevation:index",
        "MassGIS",
        "Latest and Best LiDAR Terrain Data Index",
        `${WFS_URL}?${new URLSearchParams({ service: "WFS", version: "1.0.0", request: "GetFeature", typeName: INDEX_TYPE, bbox: area.bounds.join(",") + ",EPSG:4326", outputFormat: "application/json", srsName: "EPSG:4326" })}`,
        at,
      ),
    };
  const warnings = [
    "Bare-earth terrain, not roof height, building height or current grading. Source acquisition dates range from 2013 to 2021; consult the returned tile projects.",
    "Preliminary terrain screening; contour interval does not establish survey accuracy. Horizontal transformation uses NAD83 Massachusetts Mainland / meters (EPSG:26986) and WGS84 display coordinates.",
  ];
  const [dem, index] = await Promise.allSettled([
    loadDem(input),
    queryWfs(INDEX_TYPE, area.bounds, 100),
  ]);
  const tiles =
    index.status === "fulfilled"
      ? index.value.features.map((f) => ({
          id: String(f.id),
          name: String(f.properties?.tilename ?? ""),
          project: String(f.properties?.area_name ?? "Unknown project"),
          demUrl: publicTileUrl(f.properties?.dem_url),
          contourUrl: publicTileUrl(f.properties?.cont_url),
        }))
      : [];
  for (const tile of tiles) {
    const key = `lidar-tile:${tile.id}`;
    sources[key] = {
      ...datasetReference(
        key,
        "MassGIS",
        `LiDAR tile ${tile.name} · ${tile.project}`,
        tile.demUrl ?? LIDAR_DOCUMENTATION,
        at,
      ),
      featureId: tile.id,
      featureName: tile.name,
      recordDate:
        [...new Set(tile.project.match(/20\d{2}/g) ?? [])].join("–") || null,
    };
  }
  if (index.status === "rejected")
    warnings.push(
      "LiDAR index unavailable: acquisition project/tile coverage could not be confirmed.",
    );
  if (index.status === "fulfilled" && !index.value.complete)
    warnings.push("LiDAR tile index response is incomplete.");
  let summary: ElevationResult["summary"] = null,
    raster: ElevationResult["raster"] = null;
  let demError: string | null = null;
  if (dem.status === "fulfilled") {
    const g = dem.value;
    summary = sampleParcel(g, input);
    raster = {
      width: g.width,
      height: g.height,
      extentMeters: g.extent,
      epsg: 26986,
      pixelSizeMeters: [g.resolution[0], Math.abs(g.resolution[1])],
      noData: g.noData,
      pixelType: "Float32",
      verticalUnits: "meters",
      verticalDatum:
        tiles.length && tiles.every((t) => t.project.includes("2021"))
          ? "NAVD88 — Geoid18 (meters), 2021 project documentation"
          : "NAVD88; geoid realization is project-specific — confirm tile metadata",
      exportUrl: g.exportUrl,
    };
    sources["elevation:dem"].serviceUrl = g.exportUrl;
    sources["elevation:dem"].featureId =
      `EPSG26986:${g.extent.map((v) => v.toFixed(2)).join(",")}:${g.width}x${g.height}`;
    if (!summary)
      warnings.push(
        "No valid bare-earth pixels fall within the sampled parcel.",
      );
    else if (
      summary.validCoverageFraction < 0.999 ||
      !summary.completeParcelExtent
    )
      warnings.push(
        "Parcel elevation sampling has partial raster or bounded-extent coverage. Reported extrema apply only to valid sampled cells.",
      );
  } else {
    demError =
      dem.reason instanceof Error ? dem.reason.message : "DEM request failed";
    warnings.push(`Elevation sampling unavailable: ${demError}`);
  }
  let contours: ElevationResult["contours"] = {
    status: "no-data",
    method: null,
    intervalFeet: input.intervalFeet,
    supportedIntervals: [5, 10],
    complete: false,
    features: [],
    error: null,
  };
  const officialAvailable =
    index.status === "fulfilled" &&
    index.value.complete &&
    tiles.length > 0 &&
    tiles.every((t) => !!t.contourUrl);
  if (!input.forceDem && officialAvailable) {
    try {
      let rawFeatures: Feature[] = [];
      if (dem.status === "fulfilled") {
        let min = Infinity,
          max = -Infinity;
        const grid = dem.value;
        for (let i = 0; i < grid.values.length; i++)
          if (validPixel(grid, i)) {
            min = Math.min(min, grid.values[i] / 0.3048);
            max = Math.max(max, grid.values[i] / 0.3048);
          }
        if (!Number.isFinite(min) || !Number.isFinite(max))
          throw Error(
            "No valid DEM pixels constrain this vector query; terrain coverage needs verification.",
          );
        const levels: number[] = [];
        for (
          let z =
            Math.floor(min / input.intervalFeet) * input.intervalFeet -
            2 * input.intervalFeet;
          z <= max + 2 * input.intervalFeet;
          z += input.intervalFeet
        ) {
          if (levels.length >= 120)
            throw Error(
              "Official contour density exceeds this bounded query limit; select a wider interval.",
            );
          levels.push(z);
        }
        for (let i = 0; i < levels.length; i += 12) {
          const part = await queryWfs(
            CONTOUR_TYPE,
            area.bounds,
            1500,
            levels.slice(i, i + 12),
          );
          if (!part.complete)
            throw Error("Official contour query was truncated.");
          rawFeatures.push(...part.features);
        }
      } else {
        const part = await queryWfs(CONTOUR_TYPE, area.bounds, 1500);
        if (!part.complete)
          throw Error("Official contour query was truncated.");
        rawFeatures = part.features;
      }
      const q = { features: rawFeatures };
      contours = {
        status: "ready",
        method: "official-vectors",
        intervalFeet: input.intervalFeet,
        supportedIntervals: [1, 2, 5, 10],
        complete: true,
        features: officialContours(q.features, area.extent, input.intervalFeet),
        error: null,
      };
      sources["elevation:contours"] = {
        ...datasetReference(
          "elevation:contours",
          "MassGIS",
          "Official 1-foot contour vectors — filtered interval",
          CONTOUR_DOCUMENTATION,
          at,
        ),
        recordDate: "2023-05",
        featureId: CONTOUR_TYPE,
      };
    } catch (e) {
      warnings.push(
        `Official vectors unavailable; checking the DEM fallback: ${e instanceof Error ? e.message : "vector request failed"}`,
      );
    }
  }
  if (contours.status !== "ready") {
    if (dem.status === "fulfilled" && summary) {
      if (![5, 10].includes(input.intervalFeet)) {
        contours = {
          ...contours,
          status: "error",
          error:
            "1- and 2-foot intervals require the official 1-foot vector product. Choose 5 or 10 feet for DEM-generated contours.",
        };
      } else
        try {
          contours = {
            status: "ready",
            method: "dem-isolines",
            intervalFeet: input.intervalFeet,
            supportedIntervals: [5, 10],
            complete:
              summary.validCoverageFraction >= 0.999 &&
              summary.completeParcelExtent,
            features: demContours(dem.value, input.intervalFeet),
            error: null,
          };
          warnings.push(
            "Contours generated server-side from bounded float DEM pixels using marching squares with linear interpolation and NoData exclusions; not official vector contours.",
          );
        } catch (e) {
          contours = {
            ...contours,
            status: "error",
            error: e instanceof Error ? e.message : "DEM isolines failed",
          };
        }
    } else
      contours = {
        ...contours,
        status: demError ? "error" : "no-data",
        error:
          demError ??
          "No valid parcel DEM samples or accessible official contours.",
      };
  }
  return {
    kind: "elevation",
    parcelId: input.parcelId,
    retrievedAt: at,
    status:
      summary || contours.status === "ready"
        ? "ready"
        : demError
          ? "error"
          : "no-data",
    error: demError,
    warnings,
    sources,
    method:
      "Bounded ImageServer exportImage as unrendered Float32 GeoTIFF, EPSG:26986 meters; georeferencing read from TIFF. Parcel statistics use valid pixel centers inside polygon rings, excluding holes, NoData and mask-zero cells. Median, sampled extrema and range converted from meters to feet.",
    summary,
    raster,
    tiles,
    contours,
    bounds: area.bounds,
  };
}
