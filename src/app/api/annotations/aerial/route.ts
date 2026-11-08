import { parseAerialView } from "@/lib/annotations/aerial";
import { fetchAerial } from "@/lib/annotations/aerial.server";

export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const view = parseAerialView(params);
  if (!view) return Response.json({ error: "Give a valid latitude, longitude and zoom." }, { status: 400 });
  try {
    const { bytes, provider } = await fetchAerial(view);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=86400",
        "X-Aerial-Provider": provider.id,
      },
    });
  } catch (e) {
    console.error("Aerial imagery failed", e);
    return Response.json({ error: "Aerial imagery could not be loaded for this location." }, { status: 502 });
  }
}
