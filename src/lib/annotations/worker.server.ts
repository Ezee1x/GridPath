import { fork } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import type { Vocabulary } from "./vision";
import type { RawAnnotation, Progress } from "./cv-models.server";
const state = globalThis as unknown as {
  qoreVisionBusy?: boolean;
  qoreVisionBuild?: Promise<string>;
};
export const modelsLoaded = () => false; // Workers release models after each job; disk download cache persists.
export const analysisBusy = () => !!state.qoreVisionBusy;
export async function analyzeImage(
  bytes: Buffer,
  vocabulary: Vocabulary | "ocr",
  progress: Progress,
  signal?: AbortSignal,
): Promise<{
  width: number;
  height: number;
  annotations: RawAnnotation[];
  text?: string;
}> {
  if (state.qoreVisionBusy)
    throw Error("Another image is being analyzed. Try again when it finishes.");
  state.qoreVisionBusy = true;
  try {
    const filename = await (state.qoreVisionBuild ??= (async () => {
      const directory = path.join(process.cwd(), ".cache", "workers");
      await mkdir(directory, { recursive: true });
      const out = path.join(directory, "vision.cjs");
      await build({
        entryPoints: [
          path.join(process.cwd(), "src/lib/annotations/cv-worker.ts"),
        ],
        outfile: out,
        bundle: true,
        platform: "node",
        format: "cjs",
        packages: "external",
      });
      return out;
    })().catch((e) => {
      state.qoreVisionBuild = undefined;
      throw e;
    }));
    signal?.throwIfAborted();
    return await new Promise((resolve, reject) => {
      const worker = fork(filename, [], {
        serialization: "advanced",
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        execArgv: ["--max-old-space-size=2048"],
      });
      worker.send({ bytes, vocabulary });
      let settled = false;
      const finish = (
        error?: Error,
        result?: {
          width: number;
          height: number;
          annotations: RawAnnotation[];
          text?: string;
        },
      ) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        worker.kill("SIGKILL");
        if (error) reject(error);
        else resolve(result!);
      };
      const abort = () => finish(Error("Image analysis cancelled."));
      const timeout = Number(process.env.QORE_VISION_TIMEOUT_MS) || 300000;
      const timer = setTimeout(
        () =>
          finish(
            Error(
              "Image analysis timed out. Cached models are retained; try a smaller photo.",
            ),
          ),
        Math.max(1000, Math.min(timeout, 600000)),
      );
      signal?.addEventListener("abort", abort, { once: true });
      worker.on(
        "message",
        (m: {
          type: string;
          stage: string;
          detail?: string;
          result: {
            width: number;
            height: number;
            annotations: RawAnnotation[];
            text?: string;
          };
          error: string;
        }) => {
          if (m.type === "progress") progress(m.stage, m.detail);
          else if (m.type === "result") finish(undefined, m.result);
          else finish(Error(m.error));
        },
      );
      worker.on("error", (e) => finish(e));
      worker.on("exit", (code) => {
        if (!settled) finish(Error(`Image worker exited (${code}).`));
      });
    });
  } finally {
    state.qoreVisionBusy = false;
  }
}
