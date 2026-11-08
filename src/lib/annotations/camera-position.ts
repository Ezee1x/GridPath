import { toImagePixel, type AerialView } from "./aerial";
export function cameraOnAerial(
  view: AerialView,
  position: { lat: number; lng: number; heading: number },
  size: { width: number; height: number },
) {
  if (![position.lat, position.lng, position.heading].every(Number.isFinite))
    return null;
  const p = toImagePixel(view, position.lat, position.lng, size);
  if (p.x < 0 || p.y < 0 || p.x > size.width || p.y > size.height) return null;
  return { ...p, heading: ((position.heading % 360) + 360) % 360 };
}
