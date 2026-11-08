import { discoverElectrical } from "@/lib/electrical/adapters";
import { siteRecordKey } from "@/lib/intake/model";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 3000)
      return Response.json(
        { error: "Site identity is too large." },
        { status: 400 },
      );
    const body = JSON.parse(raw);
    let identity;
    try {
      identity = JSON.parse(body.siteKey);
    } catch {
      /* Rejected below. */
    }
    if (
      !Array.isArray(identity) ||
      identity.length !== 2 ||
      typeof identity[0] !== "string" ||
      identity[0].length > 250 ||
      (identity[1] !== null && !/^\d+$/.test(identity[1])) ||
      siteRecordKey(identity[0], identity[1]) !== body.siteKey ||
      body.parcelFeatureId !== identity[1] ||
      typeof body.address !== "string" ||
      body.address.length < 5 ||
      body.address.length > 300 ||
      (body.townId != null &&
        (!Number.isInteger(body.townId) ||
          body.townId < 1 ||
          body.townId > 351)) ||
      (body.parcelId != null &&
        (typeof body.parcelId !== "string" || body.parcelId.length > 80))
    )
      return Response.json(
        { error: "Provide this site's valid identity and address." },
        { status: 400 },
      );
    const result = await discoverElectrical({
      siteKey: body.siteKey,
      parcelFeatureId: body.parcelFeatureId,
      address: body.address,
      townId: body.townId,
      parcelId: body.parcelId,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      {
        error:
          "Electrical discovery request could not be read. Retry with a valid site identity.",
      },
      { status: 400 },
    );
  }
}
