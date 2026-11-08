import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeImage } from "../src/lib/annotations/worker.server";
import type { NormalizedBox } from "../src/lib/annotations/types";
import type { Vocabulary } from "../src/lib/annotations/vision";
function iou(a: NormalizedBox, b: NormalizedBox) {
  const intersection =
    Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
    Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  return (
    intersection /
    ((a[2] - a[0]) * (a[3] - a[1]) +
      (b[2] - b[0]) * (b[3] - b[1]) -
      intersection || 1)
  );
}
async function main() {
  if (!process.argv[2])
    throw Error(
      "Usage: npx tsx scripts/benchmark-annotations.ts /path/to/labelled-manifest.json",
    );
  const manifest = JSON.parse(await readFile(process.argv[2], "utf8")) as {
    cases: {
      image: string;
      vocabulary: Vocabulary;
      truth: { category: string; box: NormalizedBox }[];
    }[];
  };
  if (!Array.isArray(manifest.cases) || !manifest.cases.length)
    throw Error("Provide labelled cases, including negative photos.");
  const rows = [];
  for (const c of manifest.cases) {
    for (const t of c.truth)
      if (
        t.box.length !== 4 ||
        t.box.some((v) => !Number.isFinite(v) || v < 0 || v > 1) ||
        t.box[2] <= t.box[0] ||
        t.box[3] <= t.box[1]
      )
        throw Error("Truth boxes must be normalized [left,top,right,bottom].");
    const result = await analyzeImage(
      await readFile(path.resolve(path.dirname(process.argv[2]), c.image)),
      c.vocabulary,
      () => {},
    );
    const used = new Set<number>();
    let tp = 0;
    for (const p of [...result.annotations].sort((a, b) => b.score - a.score)) {
      const best = c.truth
        .map((t, index) => ({
          index,
          score:
            used.has(index) || t.category !== p.category
              ? 0
              : iou(t.box, p.box),
        }))
        .sort((a, b) => b.score - a.score)[0];
      if (best?.score >= 0.5) {
        used.add(best.index);
        tp++;
      }
    }
    rows.push({
      image: c.image,
      truth: c.truth.length,
      predicted: result.annotations.length,
      truePositive: tp,
      falsePositive: result.annotations.length - tp,
      falseNegative: c.truth.length - tp,
    });
  }
  const tp = rows.reduce((n, r) => n + r.truePositive, 0),
    fp = rows.reduce((n, r) => n + r.falsePositive, 0),
    fn = rows.reduce((n, r) => n + r.falseNegative, 0);
  const report = {
    at: new Date().toISOString(),
    iouThreshold: 0.5,
    precision: tp + fp ? tp / (tp + fp) : null,
    recall: tp + fn ? tp / (tp + fn) : null,
    cases: rows,
  };
  const output = path.resolve(process.argv[2] + ".results.json");
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log(output);
}
void main();
