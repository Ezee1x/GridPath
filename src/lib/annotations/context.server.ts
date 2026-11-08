import type { MapFeature, MapFeatureKind, SiteContext } from "./types";
import { voltageLabel } from "./geo";

/**
 * Location, assessor parcel outline and mapped power infrastructure for the
 * aerial plan. Values come only from what each source returned; zoning,
 * utility and permit findings live in the engineering record instead.
 */
const USER_AGENT = "QORE-ProjectSync/0.1 (site annotations prototype)";
const CENSUS =
  "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";
const MASSGIS_PARCELS =
  "https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer/0";
const OVERPASS = "https://overpass-api.de/api/interpreter";

type Queried = SiteContext["sourcesQueried"][number];
async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      ...init?.headers,
    },
    signal: init?.signal ?? AbortSignal.timeout(30000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`returned ${res.status}`);
  const data = (await res.json()) as T & { error?: { message?: string } };
  if (data && typeof data === "object" && "error" in data && data.error)
    throw new Error(data.error.message ?? "returned an error");
  return data;
}

/* US Census geocoder */

interface CensusMatch {
  matchedAddress: string;
  coordinates: { x: number; y: number };
  addressComponents: {
    streetName: string;
    suffixType: string;
    preDirection: string;
    city: string;
    state: string;
  };
  geographies: Record<string, { NAME: string; BASENAME?: string }[]>;
}
async function geocode(address: string) {
  const q = new URLSearchParams({
    address,
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
    layers: "Counties,County Subdivisions,Incorporated Places",
    format: "json",
  });
  const url = `${CENSUS}?${q}`;
  const data = await getJson<{ result: { addressMatches: CensusMatch[] } }>(
    url,
  );
  return { url, match: data.result.addressMatches[0] ?? null };
}

/* MassGIS assessor parcels */

interface ParcelAttributes {
  SITE_ADDR: string | null;
  CITY: string | null;
  USE_CODE: string | null;
  USE_DESC: string | null;
  ZONING: string | null;
  LOT_SIZE: number | null;
  LOT_UNITS: string | null;
  BLD_AREA: number | null;
  YEAR_BUILT: number | null;
  STORIES: string | null;
  MAP_PAR_ID: string | null;
  LOC_ID: string | null;
  FY: number | null;
}
const safe = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .trim();
async function parcelFor(match: CensusMatch) {
  const number = match.matchedAddress.match(/^\s*(\d+)/)?.[1];
  const street = safe(match.addressComponents.streetName);
  if (!number || !street)
    return { url: `${MASSGIS_PARCELS}/query`, parcel: null, count: 0 };
  const q = new URLSearchParams({
    where: `ADDR_NUM='${number}' AND FULL_STR LIKE '${street}%'`,
    geometry: `${match.coordinates.x},${match.coordinates.y}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    distance: "2500",
    units: "esriSRUnit_Meter",
    outFields:
      "SITE_ADDR,CITY,USE_CODE,USE_DESC,ZONING,LOT_SIZE,LOT_UNITS,BLD_AREA,YEAR_BUILT,STORIES,MAP_PAR_ID,LOC_ID,FY",
    returnGeometry: "true",
    outSR: "4326",
    geometryPrecision: "6",
    f: "json",
  });
  const url = `${MASSGIS_PARCELS}/query?${q}`;
  const data = await getJson<{
    features: {
      attributes: ParcelAttributes;
      geometry?: { rings: [number, number][][] };
    }[];
  }>(url);
  return { url, parcel: data.features[0] ?? null, count: data.features.length };
}

/* OpenStreetMap via Overpass */

interface OsmElement {
  type: "node" | "way" | "relation" | "area";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}
async function overpassQuery(query: string) {
  const data = await getJson<{ elements: OsmElement[] }>(OVERPASS, {
    method: "POST",
    body: new URLSearchParams({ data: query }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(50000),
  });
  return data.elements;
}
/**
 * Two small queries run in parallel so one slow part (the public Overpass
 * server is often busy) doesn't lose the other.
 */
async function overpass(lat: number, lng: number) {
  const at = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  const near = `[out:json][timeout:45];
(
  node(around:600,${at})["power"~"^(transformer|pole|tower|switch|substation|cable_distribution_cabinet)$"];
  way(around:600,${at})["power"~"^(line|minor_line|cable)$"];
  way(around:200,${at})["building"];
  way(around:120,${at})["landuse"];
);
out tags geom 300;`;
  const wider = `[out:json][timeout:45];
nwr(around:5000,${at})["power"="substation"];
out tags center 20;
is_in(${at})->.a;
area.a["boundary"="administrative"]["admin_level"~"^(6|7|8)$"];
out tags;`;
  const results = await Promise.allSettled([
    overpassQuery(near),
    overpassQuery(wider),
  ]);
  const ok = results.filter(
    (r): r is PromiseFulfilledResult<OsmElement[]> => r.status === "fulfilled",
  );
  if (!ok.length) throw new Error("Overpass did not respond");
  return {
    elements: ok.flatMap((r) => r.value),
    partial: ok.length < results.length,
    nearOk: results[0].status === "fulfilled",
    widerOk: results[1].status === "fulfilled",
  };
}

function osmUrl(e: OsmElement) {
  // Overpass areas derived from relations carry the relation id plus 3.6 billion.
  if (e.type === "area")
    return e.id > 3600000000
      ? `https://www.openstreetmap.org/relation/${e.id - 3600000000}`
      : `https://www.openstreetmap.org/way/${e.id - 2400000000}`;
  return `https://www.openstreetmap.org/${e.type}/${e.id}`;
}
function kindOf(tags: Record<string, string>): MapFeatureKind | null {
  switch (tags.power) {
    case "line":
      return "transmission-line";
    case "minor_line":
    case "cable":
      return "distribution-line";
    case "substation":
      return "substation";
    case "transformer":
      return "transformer";
    case "pole":
      return "pole";
    case "tower":
      return "tower";
    case "switch":
    case "cable_distribution_cabinet":
      return "switch";
  }
  return tags.building ? "building" : null;
}
const KIND_LABEL: Record<MapFeatureKind, string> = {
  "transmission-line": "Power line",
  "distribution-line": "Distribution line",
  substation: "Substation",
  transformer: "Transformer",
  pole: "Utility pole",
  tower: "Transmission tower",
  switch: "Switch or cabinet",
  building: "Building",
};
function toFeature(e: OsmElement): MapFeature | null {
  const tags = e.tags ?? {};
  const kind = kindOf(tags);
  if (!kind) return null;
  const path =
    e.geometry?.map(
      (g) => [+g.lon.toFixed(6), +g.lat.toFixed(6)] as [number, number],
    ) ?? null;
  const pt =
    e.lat !== undefined
      ? e
      : e.center
        ? { lat: e.center.lat, lon: e.center.lon }
        : null;
  const volts = voltageLabel(tags.voltage);
  return {
    id: `${e.type}/${e.id}`,
    kind,
    label:
      tags.name ??
      (volts ? `${KIND_LABEL[kind]}, tagged ${volts}` : KIND_LABEL[kind]),
    point:
      pt && pt.lat !== undefined && pt.lon !== undefined
        ? [+pt.lon.toFixed(6), +pt.lat.toFixed(6)]
        : null,
    path: path && path.length > 1 ? path : null,
    tags,
    url: osmUrl(e),
  };
}

/** Locates an address and gathers its parcel outline and nearby mapped power features. */
export async function getSiteContext(address: string): Promise<SiteContext> {
  const retrievedAt = new Date().toISOString();
  const sourcesQueried: Queried[] = [];
  const note = (name: string, url: string, ok: boolean, text: string) =>
    sourcesQueried.push({ name, url, ok, note: text });

  let geo: Awaited<ReturnType<typeof geocode>> | null = null;
  try {
    geo = await geocode(address);
    note(
      "US Census Geocoder",
      geo.url,
      Boolean(geo.match),
      geo.match ? "Address matched" : "No address match",
    );
  } catch (e) {
    note(
      "US Census Geocoder",
      CENSUS,
      false,
      e instanceof Error ? `Request failed: ${e.message}` : "Request failed",
    );
  }
  const match = geo?.match ?? null;
  if (!match)
    return {
      address,
      retrievedAt,
      location: null,
      parcel: null,
      features: [],
      sourcesQueried,
    };

  const lat = match.coordinates.y;
  const lng = match.coordinates.x;
  const state = match.addressComponents.state || null;
  const [parcelResult, osmResult] = await Promise.allSettled([
    state === "MA" ? parcelFor(match) : Promise.resolve(null),
    overpass(lat, lng),
  ]);

  let parcel: SiteContext["parcel"] = null;
  if (parcelResult.status === "fulfilled" && parcelResult.value) {
    const r = parcelResult.value;
    note(
      "MassGIS property tax parcels",
      r.url,
      Boolean(r.parcel),
      r.parcel
        ? "Parcel matched by street address"
        : "No parcel matched this street address",
    );
    const attrs = r.parcel?.attributes;
    if (r.parcel?.geometry?.rings?.length)
      parcel = {
        id: attrs?.MAP_PAR_ID ?? attrs?.LOC_ID ?? "Unnumbered parcel",
        rings: r.parcel.geometry.rings,
      };
  } else if (state === "MA")
    note(
      "MassGIS property tax parcels",
      MASSGIS_PARCELS,
      false,
      "Request failed",
    );

  let elements: OsmElement[] = [];
  if (osmResult.status === "fulfilled") {
    elements = osmResult.value.elements;
    note(
      "OpenStreetMap (Overpass API)",
      "https://www.openstreetmap.org/copyright",
      true,
      osmResult.value.partial
        ? `${elements.length} features; part of the search timed out`
        : `${elements.length} features near the address`,
    );
  } else
    note(
      "OpenStreetMap (Overpass API)",
      OVERPASS,
      false,
      "Request failed or timed out",
    );
  const seen = new Set<string>();
  const features = elements
    .filter((e) => e.type !== "area")
    .map(toFeature)
    .filter(
      (f): f is MapFeature =>
        f !== null && !seen.has(f.id) && Boolean(seen.add(f.id)),
    );

  return {
    address,
    retrievedAt,
    location: {
      lat,
      lng,
      matchedAddress: match.matchedAddress,
      state,
      county: match.geographies["Counties"]?.[0]?.NAME ?? null,
      municipality:
        match.geographies["County Subdivisions"]?.[0]?.BASENAME ??
        match.geographies["Incorporated Places"]?.[0]?.BASENAME ??
        null,
      source: { name: "US Census Geocoder", url: geo?.url ?? CENSUS },
    },
    parcel,
    // Buildings help orient the map; keep the record compact.
    features: features
      .filter((f) => f.kind !== "building" || (f.path?.length ?? 0) <= 80)
      .slice(0, 160),
    sourcesQueried,
  };
}
