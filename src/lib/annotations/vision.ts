import { EquipmentCategory, NormalizedBox, SiteAnnotation } from "./types";

/**
 * Detection vocabularies. Each phrase is sent to the open-vocabulary detector
 * as written; the label is what the callout shows. Phrases that are easily
 * confused with ordinary objects carry a higher minimum score.
 */
export interface DetectionPhrase {
  text: string;
  label: string;
  category: EquipmentCategory;
  minScore: number;
  readMarkings: boolean;
}
export type Vocabulary = "ground" | "aerial";

/**
 * Street-level and close-up photos of a property. Each phrase runs in its own
 * detector pass, so scores are higher than in a shared prompt; thresholds
 * are set accordingly.
 */
const GROUND_PHRASES: DetectionPhrase[] = [
  {
    text: "pad-mounted transformer",
    label: "Pad-mounted transformer",
    category: "transformer",
    minScore: 0.32,
    readMarkings: true,
  },
  {
    text: "pole-mounted transformer",
    label: "Pole-mounted transformer",
    category: "transformer",
    minScore: 0.37,
    readMarkings: false,
  },
  {
    text: "battery storage container",
    label: "Battery energy storage system",
    category: "bess",
    minScore: 0.42,
    readMarkings: true,
  },
  {
    text: "concrete equipment pad",
    label: "Possible BESS location",
    category: "bess-location",
    minScore: 0.42,
    readMarkings: false,
  },
  {
    text: "switchgear",
    label: "Switchgear",
    category: "switchgear",
    minScore: 0.37,
    readMarkings: true,
  },
  {
    text: "electrical switchboard",
    label: "Switchboard",
    category: "switchgear",
    minScore: 0.37,
    readMarkings: true,
  },
  {
    text: "electrical cabinet",
    label: "Electrical cabinet",
    category: "switchgear",
    minScore: 0.39,
    readMarkings: true,
  },
  {
    text: "disconnect switch",
    label: "Disconnect switch",
    category: "disconnect",
    minScore: 0.37,
    readMarkings: true,
  },
  {
    text: "electrical panel",
    label: "Electrical panel",
    category: "panel",
    minScore: 0.37,
    readMarkings: true,
  },
  {
    text: "electric meter",
    label: "Electric meter",
    category: "utility",
    minScore: 0.37,
    readMarkings: true,
  },
  {
    text: "utility pole",
    label: "Utility pole",
    category: "utility",
    minScore: 0.37,
    readMarkings: false,
  },
  {
    text: "overhead power lines",
    label: "Overhead power lines",
    category: "utility",
    minScore: 0.42,
    readMarkings: false,
  },
  {
    text: "electrical conduit",
    label: "Electrical conduit",
    category: "utility",
    minScore: 0.42,
    readMarkings: false,
  },
  {
    text: "electrical room door",
    label: "Possible electrical room entrance",
    category: "electrical-room",
    minScore: 0.47,
    readMarkings: true,
  },
  {
    text: "bollard",
    label: "Protective bollard",
    category: "bollard",
    minScore: 0.37,
    readMarkings: false,
  },
  {
    text: "fence",
    label: "Fence",
    category: "obstacle",
    minScore: 0.47,
    readMarkings: false,
  },
];

/** Overhead orthoimagery: site layout, open ground and obstacles. */
const AERIAL_PHRASES: DetectionPhrase[] = [
  {
    text: "building",
    label: "Building",
    category: "building",
    minScore: 0.3,
    readMarkings: false,
  },
  {
    text: "solar panels",
    label: "Solar array",
    category: "utility",
    minScore: 0.55,
    readMarkings: false,
  },
  {
    text: "parking lot",
    label: "Paved open area, possible BESS location",
    category: "bess-location",
    minScore: 0.28,
    readMarkings: false,
  },
  {
    text: "road",
    label: "Road or drive aisle",
    category: "road",
    minScore: 0.3,
    readMarkings: false,
  },
  {
    text: "trees",
    label: "Trees",
    category: "obstacle",
    minScore: 0.35,
    readMarkings: false,
  },
  {
    text: "shipping container",
    label: "Container or enclosure",
    category: "bess",
    minScore: 0.42,
    readMarkings: false,
  },
  {
    text: "electrical transformer",
    label: "Possible transformer",
    category: "transformer",
    minScore: 0.42,
    readMarkings: false,
  },
];

export const VOCABULARIES: Record<Vocabulary, DetectionPhrase[]> = {
  ground: GROUND_PHRASES,
  aerial: AERIAL_PHRASES,
};
/** Ground-level vocabulary, kept under its original name. */
export const DETECTION_PHRASES = GROUND_PHRASES;

export const CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  bess: "Battery energy storage",
  "bess-location": "Possible BESS location",
  transformer: "Utility transformer",
  switchgear: "Switchboard / switchgear",
  disconnect: "Disconnect switch",
  panel: "Electrical panel",
  "electrical-room": "Electrical room / entrance",
  utility: "Utility infrastructure",
  bollard: "Protective bollard",
  building: "Building",
  road: "Road or drive aisle",
  obstacle: "Physical obstacle",
  other: "Other equipment",
};

export interface Detection {
  phrase: number;
  score: number;
  box: NormalizedBox;
}

const BERT_SPECIAL = new Set([0, 101, 102]);
const BERT_PERIOD = 1012;

/**
 * Decodes Grounding DINO outputs. Each query's score for a phrase is the
 * highest token probability inside that phrase's span of the text prompt.
 */
export function decodeGroundedDetections({
  logits,
  boxes,
  numQueries,
  numTokens,
  tokenIds,
  phrases,
}: {
  logits: ArrayLike<number>;
  boxes: ArrayLike<number>;
  numQueries: number;
  numTokens: number;
  tokenIds: number[];
  phrases: Pick<DetectionPhrase, "minScore">[];
}): Detection[] {
  const owner: number[] = [];
  let phrase = 0;
  for (const id of tokenIds) {
    if (BERT_SPECIAL.has(id)) owner.push(-1);
    else if (id === BERT_PERIOD) {
      owner.push(-1);
      phrase++;
    } else owner.push(phrase < phrases.length ? phrase : -1);
  }
  const out: Detection[] = [];
  for (let q = 0; q < numQueries; q++) {
    const best = new Array<number>(phrases.length).fill(0);
    for (let t = 0; t < tokenIds.length; t++) {
      const o = owner[t];
      if (o < 0) continue;
      const p = 1 / (1 + Math.exp(-logits[q * numTokens + t]));
      if (p > best[o]) best[o] = p;
    }
    let k = 0;
    for (let i = 1; i < best.length; i++) if (best[i] > best[k]) k = i;
    if (best[k] < phrases[k].minScore) continue;
    const [cx, cy, w, h] = [0, 1, 2, 3].map((i) => boxes[q * 4 + i]);
    const box = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2].map((v) =>
      Math.min(1, Math.max(0, v)),
    ) as NormalizedBox;
    out.push({ phrase: k, score: best[k], box });
  }
  return out;
}

const area = (b: NormalizedBox) =>
  Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
function intersection(a: NormalizedBox, b: NormalizedBox) {
  return area([
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
    Math.min(a[2], b[2]),
    Math.min(a[3], b[3]),
  ]);
}
export function iou(a: NormalizedBox, b: NormalizedBox) {
  const i = intersection(a, b);
  return i / Math.max(1e-9, area(a) + area(b) - i);
}

/**
 * Removes duplicate boxes, boxes that cover almost the whole frame, and parts
 * nested inside a same-category detection (a sign on a transformer, say).
 */
export function suppressDetections(
  detections: Detection[],
  phrases: Pick<DetectionPhrase, "category">[],
  limit = 14,
  maxArea = 0.85,
): Detection[] {
  const sorted = detections
    .filter((d) => area(d.box) < maxArea && area(d.box) > 0.0004)
    .sort((a, b) => b.score - a.score);
  const kept: Detection[] = [];
  for (const d of sorted) {
    const cat = phrases[d.phrase].category;
    const duplicate = kept.some((k) => iou(k.box, d.box) > 0.55);
    if (duplicate) continue;
    const nestedIndex = kept.findIndex(
      (k) =>
        phrases[k.phrase].category === cat &&
        intersection(k.box, d.box) / area(k.box) > 0.85 &&
        area(d.box) > area(k.box) * 2,
    );
    // A larger enclosing box of the same category replaces the nested part if its score is comparable.
    if (nestedIndex >= 0 && d.score >= kept[nestedIndex].score * 0.6) {
      kept[nestedIndex] = d;
      continue;
    }
    const insideKept = kept.some(
      (k) =>
        phrases[k.phrase].category === cat &&
        intersection(k.box, d.box) / area(d.box) > 0.85,
    );
    if (insideKept) continue;
    kept.push(d);
  }
  return kept.slice(0, limit);
}

/** Keeps short alphanumeric strings that are plausibly painted or printed markings. */
export function cleanMarkings(lines: string[]): string[] {
  const seen = new Set<string>();
  return lines
    .map((l) =>
      l
        .replace(/<\/?[a-z_]+>/gi, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((l) => l.length >= 2 && l.length <= 40 && /[A-Z0-9]/i.test(l))
    .filter((l) => {
      const key = l.toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

/* Drawing-sheet zones and callout layout */

export const ZONE_COLUMNS = 8;
export function zoneRows(aspect: number) {
  return Math.max(3, Math.min(8, Math.round(ZONE_COLUMNS / aspect)));
}
export function zoneFor(box: NormalizedBox, aspect: number) {
  const rows = zoneRows(aspect);
  const cx = (box[0] + box[2]) / 2;
  const cy = (box[1] + box[3]) / 2;
  const col = Math.min(ZONE_COLUMNS, Math.floor(cx * ZONE_COLUMNS) + 1);
  const row = Math.min(rows - 1, Math.floor(cy * rows));
  return `${String.fromCharCode(65 + row)}${col}`;
}

/**
 * Callout metrics in image pixels, shared by layout and rendering. `scale` is
 * image pixels per screen pixel, so callouts read at the same size on screen
 * whatever the photo's resolution or orientation.
 */
export function calloutMetrics(scale: number) {
  const font = 12.5 * scale;
  return { font, line: font * 1.3, pad: font * 0.6, stroke: 1.25 * scale };
}
/** Image pixels per screen pixel for a viewer of the given on-screen width. */
export function displayScale(imageWidth: number, viewerWidth: number) {
  return imageWidth / Math.max(1, viewerWidth);
}
export function calloutLines(a: Pick<SiteAnnotation, "label" | "markings">) {
  const lines = [a.label];
  // Identifiers with digits (pad numbers, tags) are the most useful to show on the drawing.
  const shown = [...a.markings]
    .sort((x, y) => Number(/\d/.test(y)) - Number(/\d/.test(x)))
    .slice(0, 3);
  if (shown.length) lines.push(`Marked “${shown.join(" / ")}”`);
  return lines;
}
export function calloutSize(lines: string[], scale: number) {
  const m = calloutMetrics(scale);
  const chars = Math.max(
    ...lines.map((l, i) => l.length * (i === 0 ? 0.6 : 0.55)),
  );
  return {
    // Includes the tag cell on the left.
    w: chars * m.font + m.pad * 2 + m.font * 2.2,
    h: lines.length * m.line + m.pad * 1.4,
  };
}

/**
 * Places each callout beside its target, choosing among candidate positions
 * the one that overlaps least with other callouts and detections and stays
 * inside the frame. Works in image pixels; returns normalized positions.
 */
export function layoutCallouts(
  items: { box: NormalizedBox; lines: string[] }[],
  width: number,
  height: number,
  scale: number,
): { x: number; y: number }[] {
  type Rect = [number, number, number, number];
  const px = (b: NormalizedBox): Rect => [
    b[0] * width,
    b[1] * height,
    b[2] * width,
    b[3] * height,
  ];
  const targets = items.map((i) => px(i.box));
  const placed: Rect[] = [];
  const overlap = (a: Rect, b: Rect) =>
    Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
    Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const gap = 26 * scale;
  return items.map((item, index) => {
    const { w, h } = calloutSize(item.lines, scale);
    const t = targets[index];
    const cx = (t[0] + t[2]) / 2;
    const candidates: [number, number][] = [
      [t[0] - w * 0.25, t[1] - gap - h],
      [t[2] - w * 0.75, t[1] - gap - h],
      [t[2] + gap, t[1]],
      [t[0] - gap - w, t[1]],
      [cx - w / 2, t[3] + gap],
      [t[2] + gap, t[3] - h],
      [t[0] - gap - w, t[3] - h],
      [cx - w / 2, t[1] + gap * 0.5],
    ];
    let best: Rect | null = null;
    let bestCost = Infinity;
    for (const [x0, y0] of candidates) {
      const x = Math.min(Math.max(x0, 4), width - w - 4);
      const y = Math.min(Math.max(y0, 4), height - h - 4);
      const r: Rect = [x, y, x + w, y + h];
      const clampCost = Math.abs(x - x0) + Math.abs(y - y0);
      let cost = clampCost * 2;
      for (const p of placed) cost += overlap(r, p) * 8;
      targets.forEach((o, j) => {
        cost += overlap(r, o) * (j === index ? 3 : 1.5);
      });
      if (cost < bestCost) {
        bestCost = cost;
        best = r;
      }
    }
    placed.push(best!);
    return { x: best![0] / width, y: best![1] / height };
  });
}

/**
 * End points of a callout's leader: from the callout edge nearest the target
 * to the nearest point on the target's outline, so the line never covers the
 * equipment itself.
 */
export function leaderLine(
  callout: { x: number; y: number; w: number; h: number },
  box: NormalizedBox,
  width: number,
  height: number,
) {
  const [bx0, by0, bx1, by1] = [
    box[0] * width,
    box[1] * height,
    box[2] * width,
    box[3] * height,
  ];
  const ccx = callout.x + callout.w / 2;
  const ccy = callout.y + callout.h / 2;
  const inside = ccx > bx0 && ccx < bx1 && ccy > by0 && ccy < by1;
  // Nearest outline point to the callout centre; top-centre when the callout sits over the box.
  let tx = inside ? (bx0 + bx1) / 2 : Math.min(Math.max(ccx, bx0), bx1);
  let ty = inside ? by0 : Math.min(Math.max(ccy, by0), by1);
  if (!inside && tx > bx0 && tx < bx1 && ty > by0 && ty < by1) ty = by0;
  // Keep the terminator off the very corner so it reads as pointing at the equipment.
  tx = Math.min(
    Math.max(tx, bx0 + (bx1 - bx0) * 0.12),
    bx1 - (bx1 - bx0) * 0.12,
  );
  ty = Math.min(
    Math.max(ty, by0 + (by1 - by0) * 0.12),
    by1 - (by1 - by0) * 0.12,
  );
  const x = Math.min(Math.max(tx, callout.x), callout.x + callout.w);
  const y = Math.min(Math.max(ty, callout.y), callout.y + callout.h);
  return x === tx && y === ty
    ? { x1: tx, y1: callout.y + callout.h, x2: tx, y2: ty }
    : { x1: x, y1: y, x2: tx, y2: ty };
}

export const DETECTOR_MODEL = "onnx-community/grounding-dino-tiny-ONNX";
export const OCR_MODEL = "onnx-community/Florence-2-base-ft";
