import { createHash } from "node:crypto";
import { validateEnvironmentInput } from "@/lib/environment/spatial";
import { collectFlood, collectWetlands } from "@/lib/environment/polygons";
import { collectElevation } from "@/lib/environment/elevation";
import type {
  EnvironmentKind,
  EnvironmentResult,
} from "@/lib/environment/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const cache = new Map<
  string,
  { expires: number; promise: Promise<EnvironmentResult> }
>();
export async function POST(request: Request) {
  const layer = new URL(request.url).searchParams.get(
    "layer",
  ) as EnvironmentKind;
  if (!["flood", "wetlands", "elevation"].includes(layer))
    return Response.json(
      { error: "Choose flood, wetlands or elevation." },
      { status: 400 },
    );
  let input;
  try {
    const text = await request.text();
    if (text.length > 350000)
      throw Error("Parcel input exceeds the size limit.");
    input = validateEnvironmentInput(JSON.parse(text));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Invalid parcel input" },
      { status: 400 },
    );
  }
  const key =
    layer +
    ":" +
    createHash("sha256")
      .update(
        JSON.stringify({
          parcelId: input.parcelId,
          geometry: input.geometry,
          ...(layer === "wetlands"
            ? { radius: input.radiusMeters }
            : layer === "elevation"
              ? { interval: input.intervalFeet, forceDem: input.forceDem }
              : {}),
        }),
      )
      .digest("hex");
  let hit = cache.get(key);
  if (!hit || hit.expires < Date.now()) {
    const promise = (
      layer === "flood"
        ? collectFlood(input)
        : layer === "wetlands"
          ? collectWetlands(input)
          : collectElevation(input)
    )
      .then((data) => {
        if (data.status === "error") cache.delete(key);
        return data;
      })
      .catch((e) => {
        cache.delete(key);
        throw e;
      });
    if (cache.size >= 24) cache.delete(cache.keys().next().value!);
    hit = { expires: Date.now() + 600000, promise };
    cache.set(key, hit);
  }
  try {
    return Response.json(await hit.promise, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      {
        error:
          "Environmental source processing failed. Other sources remain available.",
      },
      { status: 502 },
    );
  }
}
