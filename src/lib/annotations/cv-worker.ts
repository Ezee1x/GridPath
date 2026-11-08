import { analyzeImage, readDocumentImage } from "./cv-models.server";
import type { Vocabulary } from "./vision";
process.once(
  "message",
  (job: { bytes: Uint8Array; vocabulary: Vocabulary | "ocr" }) => {
    const progress = (stage: string, detail?: string) =>
      process.send?.({ type: "progress", stage, detail });
    void (
      job.vocabulary === "ocr"
        ? readDocumentImage(Buffer.from(job.bytes), progress).then((text) => ({
            width: 0,
            height: 0,
            annotations: [],
            text,
          }))
        : analyzeImage(Buffer.from(job.bytes), job.vocabulary, progress)
    )
      .then((result) => process.send?.({ type: "result", result }))
      .catch((error) =>
        process.send?.({
          type: "error",
          error: String(error.message ?? error),
        }),
      );
  },
);
