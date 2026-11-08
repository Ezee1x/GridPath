import { sharedJobAccess, boundedForm } from "@/lib/team/request-access.server";
import { TeamError } from "@/lib/team/server";
import { extractCandidates } from "@/lib/documents/candidates";
import { analyzeImage } from "@/lib/annotations/worker.server";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    sharedJobAccess(request);
    const form = await boundedForm(request, 21 * 1024 * 1024),
      file = form.get("file");
    if (
      !(file instanceof File) ||
      file.size === 0 ||
      file.size > 20 * 1024 * 1024
    )
      return Response.json(
        { error: "Choose a nonempty document under 20 MB." },
        { status: 400 },
      );
    const bytes = new Uint8Array(await file.arrayBuffer());
    let pages: { page: number; text: string }[] = [];
    const warnings: string[] = [];
    let scanned = 0;
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const task = getDocument({
        data: bytes,
        useSystemFonts: false,
        useWorkerFetch: false,
      });
      try {
        const pdf = await task.promise;
        if (pdf.numPages > 100) throw Error("Use a PDF of at most 100 pages.");
        let characters = 0;
        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          const content = await page.getTextContent();
          let text = content.items
            .map((i) => ("str" in i ? i.str : ""))
            .join(" ");
          if (text.trim().length < 80 && form.get("ocrScanned") === "true") {
            if (scanned >= 3)
              warnings.push(
                `Page ${n}: scanned/low-text OCR limit reached; review manually.`,
              );
            else {
              scanned++;
              try {
                request.signal.throwIfAborted();
                const { createCanvas } = await import("@napi-rs/canvas");
                const initial = page.getViewport({ scale: 1 });
                const viewport = page.getViewport({
                  scale: Math.min(
                    2,
                    1800 / Math.max(initial.width, initial.height),
                  ),
                });
                const canvas = createCanvas(
                  Math.ceil(viewport.width),
                  Math.ceil(viewport.height),
                );
                await page.render({
                  canvas: canvas as unknown as HTMLCanvasElement,
                  viewport,
                }).promise;
                const result = await analyzeImage(
                  canvas.toBuffer("image/png"),
                  "ocr",
                  () => {},
                  request.signal,
                );
                text += "\n" + (result.text ?? "");
              } catch (error) {
                warnings.push(
                  `Page ${n}: local OCR unavailable or unreadable; review manually. ${error instanceof Error ? error.message : ""}`,
                );
              }
            }
          } else if (!text.trim())
            warnings.push(
              `Page ${n}: no embedded text; enable local scanned-page OCR or provide a page image/manual transcription.`,
            );
          characters += text.length;
          if (characters > 2_000_000)
            throw Error("Document text exceeds extraction limits.");
          pages.push({ page: n, text });
          page.cleanup();
        }
      } finally {
        await task.destroy();
      }
    } else if (/^image\/(png|jpeg|webp)$/.test(file.type)) {
      const result = await analyzeImage(
        Buffer.from(bytes),
        "ocr",
        () => {},
        request.signal,
      );
      pages = [{ page: 1, text: result.text ?? "" }];
    } else if (/\.(txt|csv)$/i.test(file.name)) {
      pages = [{ page: 1, text: new TextDecoder().decode(bytes) }];
    } else
      return Response.json(
        { error: "Use a PDF, text, CSV, PNG, JPEG or WebP document." },
        { status: 415 },
      );
    const candidates = extractCandidates(pages);
    return Response.json({
      candidates,
      warnings,
      pages: pages.length,
      message:
        (warnings.length ? warnings.join(" ") + " " : "") +
        (!pages.some((p) => p.text.trim())
          ? "No embedded text found. For a scanned PDF, upload an image of the relevant nameplate or page, or enter the value manually."
          : candidates.length
            ? "Candidates require comparison with the original document and confirmation of existing conditions."
            : "No explicitly labelled supported ratings were found. Review the original document manually."),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Extraction failed." },
      { status: error instanceof TeamError ? error.status : 422 },
    );
  }
}
