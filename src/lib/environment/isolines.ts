import type { Position } from "geojson";
/** Genuine marching-squares isolines. Grid vertices are pixel centers; NoData cells cannot produce segments. */
export function marchingIsolines(
  values: ArrayLike<number>,
  width: number,
  height: number,
  levels: number[],
  valid: (i: number) => boolean,
): { level: number; lines: Position[][] }[] {
  const result = [];
  for (const level of levels) {
    const segments: [Position, Position][] = [];
    for (let y = 0; y < height - 1; y++)
      for (let x = 0; x < width - 1; x++) {
        const ids = [
          y * width + x,
          y * width + x + 1,
          (y + 1) * width + x + 1,
          (y + 1) * width + x,
        ];
        if (!ids.every(valid)) continue;
        const v = ids.map((i) => values[i]),
          points: [
            [number, number],
            [number, number],
            [number, number],
            [number, number],
          ] = [
            [x, y],
            [x + 1, y],
            [x + 1, y + 1],
            [x, y + 1],
          ];
        let code = 0;
        for (let k = 0; k < 4; k++) if (v[k] >= level) code |= 1 << k;
        if (code === 0 || code === 15) continue;
        const edges: Position[] = [];
        const crossed: number[] = [];
        for (let k = 0; k < 4; k++) {
          const j = (k + 1) % 4;
          if (v[k] >= level === v[j] >= level) continue;
          const t = (level - v[k]) / (v[j] - v[k]);
          edges[k] = [
            points[k][0] + t * (points[j][0] - points[k][0]),
            points[k][1] + t * (points[j][1] - points[k][1]),
          ];
          crossed.push(k);
        }
        if (crossed.length === 2)
          segments.push([edges[crossed[0]], edges[crossed[1]]]);
        else if (crossed.length === 4) {
          const q =
            (v[0] - level) * (v[2] - level) - (v[1] - level) * (v[3] - level);
          const pairs =
            q >= 0
              ? [
                  [0, 1],
                  [2, 3],
                ]
              : [
                  [0, 3],
                  [1, 2],
                ];
          for (const [a, b] of pairs) segments.push([edges[a], edges[b]]);
        }
      }
    // Join coincident edge intersections. No artificial box boundary is added.
    const key = (p: Position) => `${p[0].toFixed(8)},${p[1].toFixed(8)}`;
    const adjacency = new Map<string, number[]>();
    segments.forEach((s, i) =>
      s.forEach((p) => {
        const k = key(p),
          a = adjacency.get(k) ?? [];
        a.push(i);
        adjacency.set(k, a);
      }),
    );
    const used = new Set<number>(),
      lines: Position[][] = [];
    const walk = (start: number, from: Position) => {
      const line = [from];
      let id = start,
        p = from;
      while (!used.has(id)) {
        used.add(id);
        const segment = segments[id],
          other = key(segment[0]) === key(p) ? segment[1] : segment[0];
        line.push(other);
        const next = adjacency.get(key(other))?.find((i) => !used.has(i));
        if (next === undefined) break;
        p = other;
        id = next;
      }
      if (line.length > 1) lines.push(line);
    };
    for (const [k, ids] of adjacency)
      if (ids.length === 1 && !used.has(ids[0])) {
        const s = segments[ids[0]];
        walk(ids[0], key(s[0]) === k ? s[0] : s[1]);
      }
    segments.forEach((s, i) => {
      if (!used.has(i)) walk(i, s[0]);
    });
    result.push({ level, lines });
  }
  return result;
}
