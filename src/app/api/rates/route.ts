import { utilityRates } from "@/lib/rates/openei.server";
import { sharedJobAccess } from "@/lib/team/request-access.server";
import { TeamError } from "@/lib/team/server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sharedJobAccess(request);
    const raw = await request.text();
    if (raw.length > 8000) throw Error("Request too large.");
    const body = JSON.parse(raw);
    const key = JSON.parse(body.siteKey);
    if (
      !Array.isArray(key) ||
      key.length !== 2 ||
      typeof key[0] !== "string" ||
      (key[1] !== null && typeof key[1] !== "string") ||
      typeof body.address !== "string" ||
      body.address.length < 6 ||
      body.address.length > 200 ||
      (body.label && !/^[a-z0-9_-]{1,100}$/i.test(body.label)) ||
      (body.utility &&
        (typeof body.utility !== "string" || body.utility.length > 150))
    )
      throw Error("Invalid site or rate request.");
    return Response.json(await utilityRates(body), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Rate request failed." },
      { status: e instanceof TeamError ? e.status : 400 },
    );
  }
}
