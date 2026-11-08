import sharp, { type OverlayOptions } from "sharp";
import {
  AERIAL_SIZE,
  AerialProvider,
  AerialView,
  mercatorBounds,
  providerFor,
  viewOrigin,
} from "./aerial";

const MASSGIS_TILES =
  "https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Aerial_Imagery_2025/MapServer/tile";
const USGS_EXPORT =
  "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/export";
const TILE = 256;

// The viewer and the detector usually request the same view back to back.
const cache = new Map<
  string,
  Promise<{ bytes: Buffer; provider: AerialProvider }>
>();

async function fetchBytes(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Imagery request returned ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (!/image|octet-stream/.test(type))
    throw new Error("Imagery service did not return an image");
  return Buffer.from(await res.arrayBuffer());
}

async function massgis(view: AerialView) {
  const { width, height } = AERIAL_SIZE;
  const o = viewOrigin(view);
  const tx0 = Math.floor(o.x / TILE);
  const ty0 = Math.floor(o.y / TILE);
  const tx1 = Math.floor((o.x + width - 1) / TILE);
  const ty1 = Math.floor((o.y + height - 1) / TILE);
  const jobs: Promise<OverlayOptions | null>[] = [];
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++)
      jobs.push(
        fetchBytes(`${MASSGIS_TILES}/${view.zoom}/${ty}/${tx}`)
          .then((input) => ({
            input,
            left: (tx - tx0) * TILE,
            top: (ty - ty0) * TILE,
          }))
          .catch(() => null),
      );
  const tiles = (await Promise.all(jobs)).filter(
    (t): t is OverlayOptions => t !== null,
  );
  if (tiles.length === 0)
    throw new Error(
      "No MassGIS imagery tiles were returned for this location.",
    );
  const canvas = await sharp({
    create: {
      width: (tx1 - tx0 + 1) * TILE,
      height: (ty1 - ty0 + 1) * TILE,
      channels: 3,
      background: { r: 236, g: 238, b: 234 },
    },
  })
    .composite(tiles)
    .png()
    .toBuffer();
  return sharp(canvas)
    .extract({
      left: Math.round(o.x - tx0 * TILE),
      top: Math.round(o.y - ty0 * TILE),
      width,
      height,
    })
    .jpeg({ quality: 88 })
    .toBuffer();
}

async function usgs(view: AerialView) {
  const b = mercatorBounds(view);
  const q = new URLSearchParams({
    bbox: [b.xmin, b.ymin, b.xmax, b.ymax].map((v) => v.toFixed(2)).join(","),
    bboxSR: "3857",
    imageSR: "3857",
    size: `${AERIAL_SIZE.width},${AERIAL_SIZE.height}`,
    format: "jpg",
    f: "image",
  });
  return fetchBytes(`${USGS_EXPORT}?${q}`);
}

/** Fetches the permitted orthoimage covering the view, as a JPEG of AERIAL_SIZE. */
export function fetchAerial(view: AerialView) {
  const key = `${view.lat.toFixed(6)},${view.lng.toFixed(6)},${view.zoom}`;
  let job = cache.get(key);
  if (!job) {
    const provider = providerFor(view.lat, view.lng);
    job = (provider.id === "massgis-2025" ? massgis(view) : usgs(view)).then(
      (bytes) => ({
        bytes,
        provider,
      }),
    );
    job.catch(() => cache.delete(key));
    cache.set(key, job);
    if (cache.size > 24) cache.delete(cache.keys().next().value!);
  }
  return job;
}
