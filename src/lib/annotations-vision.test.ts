import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DETECTION_PHRASES,
  cleanMarkings,
  decodeGroundedDetections,
  layoutCallouts,
  leaderLine,
  suppressDetections,
  zoneFor,
} from "./annotations/vision";

test("grounded detections take each query's label from the phrase span with the highest token score", () => {
  // [CLS] pad - mounted transformer . bollard . [SEP]
  const tokenIds = [101, 11687, 1011, 5614, 10938, 1012, 8945, 1012, 102];
  const phrases = [{ minScore: 0.3 }, { minScore: 0.3 }];
  const numTokens = 256;
  const logits = new Float32Array(2 * numTokens).fill(-10);
  logits[0 * numTokens + 4] = 2; // query 0 → "transformer" token
  logits[1 * numTokens + 6] = -1.5; // query 1 → "bollard", below threshold
  const boxes = new Float32Array([0.5, 0.5, 0.2, 0.4, 0.1, 0.1, 0.05, 0.05]);
  const out = decodeGroundedDetections({ logits, boxes, numQueries: 2, numTokens, tokenIds, phrases });
  assert.equal(out.length, 1);
  assert.equal(out[0].phrase, 0);
  assert.deepEqual(out[0].box.map((v) => +v.toFixed(2)), [0.4, 0.3, 0.6, 0.7]);
});

test("suppression keeps one enclosing box for a part nested in the same equipment", () => {
  const sign = { phrase: 0, score: 0.42, box: [0.41, 0.46, 0.49, 0.51] as [number, number, number, number] };
  const body = { phrase: 0, score: 0.37, box: [0.3, 0.43, 0.78, 0.72] as [number, number, number, number] };
  const kept = suppressDetections([sign, body], DETECTION_PHRASES);
  assert.deepEqual(kept, [body]);
});

test("markings are transcribed, trimmed and deduplicated without interpretation", () => {
  assert.deepEqual(cleanMarkings(["PAD 1", " pad 1 ", "50", "-", "C5038"]), ["PAD 1", "50", "C5038"]);
});

test("callouts stay inside the frame and leaders end on the equipment outline", () => {
  const box: [number, number, number, number] = [0.6, 0.3, 0.9, 0.6];
  const [pos] = layoutCallouts([{ box, lines: ["Pad-mounted transformer"] }], 1280, 1024, 1.4);
  assert.ok(pos.x >= 0 && pos.x < 1 && pos.y >= 0 && pos.y < 1);
  const leader = leaderLine({ x: 700, y: 100, w: 300, h: 50 }, box, 1280, 1024);
  assert.ok(leader.y2 <= 0.6 * 1024 && leader.y2 >= 0.3 * 1024);
  assert.equal(zoneFor(box, 1280 / 1024), "C7");
});

test("each vocabulary keeps its phrases distinct and inside the detector's prompt budget", async () => {
  const { VOCABULARIES } = await import("./annotations/vision");
  for (const phrases of Object.values(VOCABULARIES)) {
    const texts = phrases.map((p) => p.text);
    assert.equal(new Set(texts).size, texts.length);
    // Grounding DINO accepts 256 text tokens; words are a safe upper bound on sub-words here.
    assert.ok(texts.join(" . ").split(/\s+/).length < 120);
    assert.ok(phrases.every((p) => !p.text.includes(".")));
  }
});
