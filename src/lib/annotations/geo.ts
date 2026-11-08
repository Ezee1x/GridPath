export function distanceMeters(a: [number, number], b: [number, number]) {
  const k = Math.PI / 180;
  const x = (b[0] - a[0]) * k * Math.cos(((a[1] + b[1]) / 2) * k);
  const y = (b[1] - a[1]) * k;
  return Math.hypot(x, y) * 6371000;
}

/** Shortest distance in meters from a point to a polyline of [lng, lat] vertices. */
export function distanceToPath(p: [number, number], path: [number, number][]) {
  if (path.length === 1) return distanceMeters(p, path[0]);
  // Local planar projection around the point is accurate at site scale.
  const k = Math.PI / 180;
  const mx = Math.cos(p[1] * k) * 6371000 * k;
  const my = 6371000 * k;
  const xy = (q: [number, number]) => [(q[0] - p[0]) * mx, (q[1] - p[1]) * my];
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = xy(path[i - 1]);
    const [bx, by] = xy(path[i]);
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

export function formatDistance(m: number) {
  return m < 1000
    ? `${Math.round(m / 10) * 10} m`
    : `${(m / 1000).toFixed(1)} km`;
}

/** Formats an OSM voltage tag ("115000;13800") as kV, transcribing what is tagged. */
export function voltageLabel(tag: string | undefined) {
  if (!tag) return null;
  const parts = tag
    .split(";")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (!parts.length) return null;
  return parts
    .map(
      (v) =>
        `${v >= 1000 ? +(v / 1000).toFixed(1) : v} ${v >= 1000 ? "kV" : "V"}`,
    )
    .join(" / ");
}
