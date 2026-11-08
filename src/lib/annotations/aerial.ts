/**
 * Overhead imagery that may be analyzed by the computer-vision model. Both
 * providers publish without use restrictions: MassGIS orthoimagery ("No
 * restrictions apply to these data") and USGS National Map imagery (public
 * domain). Google imagery is never used here.
 */
export interface AerialView {
  lat: number;
  lng: number;
  zoom: number;
}
export interface AerialProvider {
  id: "massgis-2025" | "usgs";
  name: string;
  attribution: string;
  /** Human-readable page describing the dataset and its terms. */
  sourceUrl: string;
  maxZoom: number;
}

export const AERIAL_SIZE = { width: 1024, height: 768 };
export const AERIAL_MIN_ZOOM = 16;
export const AERIAL_DEFAULT_ZOOM = 19;

export const MASSGIS_IMAGERY: AerialProvider = {
  id: "massgis-2025",
  name: "MassGIS 2025 aerial imagery (15 cm)",
  attribution: "Imagery: MassGIS, spring 2025",
  sourceUrl:
    "https://www.arcgis.com/home/item.html?id=a3bbd504c80746ac9aedc7b5ca4e0d00",
  maxZoom: 20,
};
export const USGS_IMAGERY: AerialProvider = {
  id: "usgs",
  name: "USGS National Map orthoimagery",
  attribution: "Imagery: USGS The National Map",
  sourceUrl: "https://apps.nationalmap.gov/services/",
  maxZoom: 19,
};

/** Extent of the MassGIS 2025 imagery service, in degrees. */
const MASSGIS_EXTENT = { west: -73.52, east: -69.92, south: 41.2, north: 42.9 };

export function providerFor(lat: number, lng: number): AerialProvider {
  const e = MASSGIS_EXTENT;
  return lat >= e.south && lat <= e.north && lng >= e.west && lng <= e.east
    ? MASSGIS_IMAGERY
    : USGS_IMAGERY;
}

export function clampZoom(zoom: number, provider: AerialProvider) {
  return Math.round(
    Math.min(provider.maxZoom, Math.max(AERIAL_MIN_ZOOM, zoom)),
  );
}

const TILE = 256;
/** Global Web Mercator pixel coordinates at a zoom level. */
export function worldPixel(lat: number, lng: number, zoom: number) {
  const size = TILE * 2 ** zoom;
  const s = Math.sin((Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * size,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size,
  };
}
export function fromWorldPixel(x: number, y: number, zoom: number) {
  const size = TILE * 2 ** zoom;
  const lng = (x / size) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / size;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { lat, lng };
}
/** Top-left world pixel of the image centered on the view. */
export function viewOrigin(view: AerialView, size = AERIAL_SIZE) {
  const c = worldPixel(view.lat, view.lng, view.zoom);
  return { x: c.x - size.width / 2, y: c.y - size.height / 2 };
}
/** Image pixel position of a coordinate within the view's image. */
export function toImagePixel(
  view: AerialView,
  lat: number,
  lng: number,
  size = AERIAL_SIZE,
) {
  const o = viewOrigin(view, size);
  const p = worldPixel(lat, lng, view.zoom);
  return { x: p.x - o.x, y: p.y - o.y };
}
export function fromImagePixel(
  view: AerialView,
  x: number,
  y: number,
  size = AERIAL_SIZE,
) {
  const o = viewOrigin(view, size);
  return fromWorldPixel(o.x + x, o.y + y, view.zoom);
}
export function metersPerPixel(lat: number, zoom: number) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}
/** Bounds of the view in Web Mercator meters (EPSG:3857). */
export function mercatorBounds(view: AerialView, size = AERIAL_SIZE) {
  const o = viewOrigin(view, size);
  const half = 20037508.342789244;
  const res = (2 * half) / (TILE * 2 ** view.zoom);
  return {
    xmin: o.x * res - half,
    xmax: (o.x + size.width) * res - half,
    ymax: half - o.y * res,
    ymin: half - (o.y + size.height) * res,
  };
}
export function aerialImageUrl(view: AerialView) {
  const q = new URLSearchParams({
    lat: view.lat.toFixed(6),
    lng: view.lng.toFixed(6),
    zoom: String(view.zoom),
  });
  return `/api/annotations/aerial?${q}`;
}
export function parseAerialView(input: unknown): AerialView | null {
  if (!input || typeof input !== "object") return null;
  const { lat, lng, zoom } = input as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "string" ? Number(v) : v);
  const [la, ln, z] = [n(lat), n(lng), n(zoom)];
  if (typeof la !== "number" || typeof ln !== "number" || typeof z !== "number")
    return null;
  if (!Number.isFinite(la) || !Number.isFinite(ln) || !Number.isFinite(z))
    return null;
  if (Math.abs(la) > 85 || Math.abs(ln) > 180) return null;
  return { lat: la, lng: ln, zoom: clampZoom(z, providerFor(la, ln)) };
}
