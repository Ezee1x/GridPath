import path from "node:path";
import sharp from "sharp";
import type {
  PreTrainedModel,
  Processor,
  RawImage as RawImageType,
} from "@huggingface/transformers";
import {
  DETECTOR_MODEL,
  OCR_MODEL,
  Detection,
  cleanMarkings,
  decodeGroundedDetections,
  suppressDetections,
  VOCABULARIES,
  Vocabulary,
} from "./vision";
import { EquipmentCategory, NormalizedBox } from "./types";

type Transformers = typeof import("@huggingface/transformers");
interface Models {
  lib: Transformers;
  detector: { processor: Processor; model: PreTrainedModel };
  ocr: { processor: Processor; model: PreTrainedModel };
}
// Survive dev-server module reloads; each model is ~0.7–1 GB in memory.
const cache = globalThis as unknown as {
  __siteAnalysisModels?: Promise<Models>;
};

export type Progress = (stage: string, detail?: string) => void;

async function loadModels(progress: Progress): Promise<Models> {
  const lib = await import("@huggingface/transformers");
  lib.env.cacheDir =
    process.env.CV_MODEL_CACHE ??
    path.join(process.cwd(), ".cache", "cv-models");
  lib.env.allowRemoteModels = true;
  const report =
    (name: string) =>
    (p: { status: string; file?: string; progress?: number }) => {
      if (p.status === "progress" && p.file?.endsWith(".onnx"))
        progress("download", `${name} ${Math.round(p.progress ?? 0)}%`);
    };
  progress("load", "Loading detection model");
  const detector = {
    processor: await lib.AutoProcessor.from_pretrained(DETECTOR_MODEL),
    model: await lib.AutoModelForZeroShotObjectDetection.from_pretrained(
      DETECTOR_MODEL,
      {
        dtype: "fp32",
        progress_callback: report("Detection model"),
      },
    ),
  };
  progress("load", "Loading text-reading model");
  const ocr = {
    model: await lib.Florence2ForConditionalGeneration.from_pretrained(
      OCR_MODEL,
      {
        dtype: "fp32",
        progress_callback: report("Text-reading model"),
      },
    ),
    processor: await lib.AutoProcessor.from_pretrained(OCR_MODEL),
  };
  return { lib, detector, ocr };
}

export function modelsLoaded() {
  return Boolean(cache.__siteAnalysisModels);
}

function getModels(progress: Progress) {
  if (!cache.__siteAnalysisModels) {
    cache.__siteAnalysisModels = loadModels(progress).catch((e) => {
      cache.__siteAnalysisModels = undefined;
      throw e;
    });
  }
  return cache.__siteAnalysisModels;
}

export interface RawAnnotation {
  label: string;
  category: EquipmentCategory;
  score: number;
  box: NormalizedBox;
  markings: string[];
}

/** Orients by EXIF, caps the long edge, and returns RGB pixels. */
async function decode(lib: Transformers, bytes: Buffer) {
  const { data, info } = await sharp(bytes)
    .rotate()
    .resize({
      width: 2048,
      height: 2048,
      fit: "inside",
      withoutEnlargement: true,
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new lib.RawImage(
    new Uint8ClampedArray(data),
    info.width,
    info.height,
    3,
  );
}

async function readMarkings(
  models: Models,
  image: RawImageType,
  box: NormalizedBox,
) {
  const padX = (box[2] - box[0]) * 0.04;
  const padY = (box[3] - box[1]) * 0.04;
  const crop = await image.crop(
    [
      Math.max(0, box[0] - padX) * image.width,
      Math.max(0, box[1] - padY) * image.height,
      Math.min(1, box[2] + padX) * image.width - 1,
      Math.min(1, box[3] + padY) * image.height - 1,
    ].map(Math.round) as [number, number, number, number],
  );
  const { processor, model } = models.ocr;
  const task = "<OCR_WITH_REGION>";
  const prompts = (
    processor as unknown as { construct_prompts(t: string): string[] }
  ).construct_prompts(task);
  const inputs = await processor(crop, prompts);
  const ids = await model.generate({ ...inputs, max_new_tokens: 96 });
  const text = (
    processor as unknown as { batch_decode(i: unknown, o: object): string[] }
  ).batch_decode(ids, {
    skip_special_tokens: false,
  })[0];
  const parsed = (
    processor as unknown as {
      post_process_generation(
        t: string,
        task: string,
        size: [number, number],
      ): Record<string, { labels: string[] }>;
    }
  ).post_process_generation(text, task, crop.size);
  return cleanMarkings(parsed[task]?.labels ?? []);
}

export async function analyzeImage(
  bytes: Buffer,
  vocabulary: Vocabulary,
  progress: Progress,
) {
  const phrases = VOCABULARIES[vocabulary];
  const models = await getModels(progress);
  const image = await decode(models.lib, bytes);
  const { processor, model } = models.detector;
  // This ONNX build of Grounding DINO only scores the first phrase of a multi-phrase
  // prompt, so each phrase gets its own pass over one preprocessed image. Phrases
  // then compete per box in suppressDetections, which keeps the highest score.
  const pixels = await processor(image, null);
  const raw: Detection[] = [];
  for (let i = 0; i < phrases.length; i++) {
    progress(
      "detect",
      `Looking for ${phrases[i].label.toLowerCase()} (${i + 1} of ${phrases.length})`,
    );
    const text = await processor(null, `${phrases[i].text} .`);
    const outputs = await model({ ...pixels, ...text });
    const [, numQueries, numTokens] = outputs.logits.dims as number[];
    for (const d of decodeGroundedDetections({
      logits: outputs.logits.data as Float32Array,
      boxes: outputs.pred_boxes.data as Float32Array,
      numQueries,
      numTokens,
      tokenIds: Array.from(text.input_ids.data as BigInt64Array, Number),
      phrases: [phrases[i]],
    }))
      raw.push({ ...d, phrase: i });
  }
  // Overhead boxes spanning most of the frame say nothing about where things are.
  const detections =
    vocabulary === "aerial"
      ? suppressDetections(raw, phrases, 18, 0.6)
      : suppressDetections(raw, phrases);
  const annotations: RawAnnotation[] = [];
  const toRead = detections
    .filter((d) => phrases[d.phrase].readMarkings)
    .slice(0, 6);
  for (const d of detections) {
    let markings: string[] = [];
    if (toRead.includes(d)) {
      progress(
        "ocr",
        `Reading markings ${toRead.indexOf(d) + 1} of ${toRead.length}`,
      );
      markings = await readMarkings(models, image, d.box).catch(() => []);
    }
    const { label, category } = phrases[d.phrase];
    annotations.push({ label, category, score: d.score, box: d.box, markings });
  }
  return { width: image.width, height: image.height, annotations };
}

export async function readDocumentImage(bytes: Buffer, progress: Progress) {
  const models = await getModels(progress);
  const image = await decode(models.lib, bytes);
  return (await readMarkings(models, image, [0, 0, 1, 1])).join("\n");
}
