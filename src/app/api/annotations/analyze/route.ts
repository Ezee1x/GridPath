import { analyzeImage, modelsLoaded } from "@/lib/annotations/cv-models.server";
import { DETECTOR_MODEL, OCR_MODEL, Vocabulary } from "@/lib/annotations/vision";
import { AerialProvider, parseAerialView } from "@/lib/annotations/aerial";
import { fetchAerial } from "@/lib/annotations/aerial.server";

export const maxDuration = 300;

const MAX_BYTES = 25 * 1024 * 1024;
const streetViewPermitted = () =>
  process.env.STREET_VIEW_ANALYSIS_PERMITTED === "true" &&
  Boolean(process.env.GOOGLE_MAPS_API_KEY);

export async function GET() {
  return Response.json({
    detector: DETECTOR_MODEL,
    ocr: OCR_MODEL,
    modelsLoaded: modelsLoaded(),
    streetViewAnalysis: streetViewPermitted(),
  });
}

interface StreetViewRequest {
  panoId: string;
  heading: number;
  pitch: number;
  fov: number;
}

async function fetchStreetView(view: StreetViewRequest) {
  const params = new URLSearchParams({
    size: "640x640",
    pano: view.panoId,
    heading: String(view.heading),
    pitch: String(view.pitch),
    fov: String(Math.min(120, Math.max(10, view.fov))),
    return_error_code: "true",
    key: process.env.GOOGLE_MAPS_API_KEY!,
  });
  const res = await fetch(`https://maps.googleapis.com/maps/api/streetview?${params}`);
  if (!res.ok)
    throw new Error(
      res.status === 404
        ? "No Street View image exists for this view."
        : `Street View Static API returned ${res.status}. Check that the API is enabled for this key.`,
    );
  return Buffer.from(await res.arrayBuffer());
}

export async function POST(request: Request) {
  let bytes: Buffer;
  let streetViewImage: string | null = null;
  let vocabulary: Vocabulary = "ground";
  let aerial: AerialProvider | null = null;
  try {
    const form = await request.formData();
    const file = form.get("image");
    const streetView = form.get("streetView");
    const aerialView = form.get("aerial");
    if (form.get("vocabulary") === "aerial") vocabulary = "aerial";
    if (file instanceof File) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type))
        return Response.json({ error: "Use a JPG, PNG or WebP photo." }, { status: 415 });
      if (file.size === 0 || file.size > MAX_BYTES)
        return Response.json({ error: "Photos must be nonempty and at most 25 MB." }, { status: 413 });
      bytes = Buffer.from(await file.arrayBuffer());
    } else if (typeof aerialView === "string") {
      // Public orthoimagery without use restrictions; fetched here so the analyzed pixels match the source.
      const view = parseAerialView(JSON.parse(aerialView));
      if (!view) return Response.json({ error: "Give a valid aerial view." }, { status: 400 });
      const result = await fetchAerial(view);
      bytes = result.bytes;
      aerial = result.provider;
      vocabulary = "aerial";
    } else if (typeof streetView === "string") {
      if (!streetViewPermitted())
        return Response.json(
          {
            error:
              "Street View analysis is turned off. Google Maps Platform terms restrict analyzing Street View imagery; an administrator must confirm your organization's license before enabling it.",
          },
          { status: 403 },
        );
      bytes = await fetchStreetView(JSON.parse(streetView) as StreetViewRequest);
      streetViewImage = `data:image/jpeg;base64,${bytes.toString("base64")}`;
    } else {
      return Response.json({ error: "Add a site photo to analyze." }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "The request could not be read." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (message: object) => controller.enqueue(encoder.encode(JSON.stringify(message) + "\n"));
      const started = Date.now();
      try {
        const result = await analyzeImage(bytes, vocabulary, (stage, detail) => send({ type: "progress", stage, detail }));
        send({
          type: "result",
          ...result,
          vocabulary,
          aerialProvider: aerial ? { id: aerial.id, name: aerial.name, attribution: aerial.attribution, sourceUrl: aerial.sourceUrl } : null,
          streetViewImage,
          detector: DETECTOR_MODEL,
          ocr: OCR_MODEL,
          durationMs: Date.now() - started,
        });
      } catch (e) {
        console.error("Site analysis failed", e);
        send({
          type: "error",
          error:
            e instanceof Error && /fetch|ENOTFOUND|ECONN/i.test(e.message)
              ? "The detection model could not be downloaded. Check the server's internet connection; models are cached after the first run."
              : "The image could not be analyzed. Try a different JPG or PNG image.",
        });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  });
}
