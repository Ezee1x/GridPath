import { fromImagePixel, toImagePixel, type AerialView } from "./aerial";
export function locationOnAerial(
  view: AerialView,
  point: { x: number; y: number },
  size: { width: number; height: number },
) {
  if (
    ![point.x, point.y, size.width, size.height].every(Number.isFinite) ||
    point.x < 0 ||
    point.x > 1 ||
    point.y < 0 ||
    point.y > 1 ||
    size.width <= 0 ||
    size.height <= 0
  )
    return null;
  return fromImagePixel(
    view,
    point.x * size.width,
    point.y * size.height,
    size,
  );
}
export function bearingToPoint(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) {
  const rad = Math.PI / 180;
  const delta = (to.lng - from.lng) * rad;
  return (
    (Math.atan2(
      Math.sin(delta) * Math.cos(to.lat * rad),
      Math.cos(from.lat * rad) * Math.sin(to.lat * rad) -
        Math.sin(from.lat * rad) * Math.cos(to.lat * rad) * Math.cos(delta),
    ) /
      rad +
      360) %
    360
  );
}
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
