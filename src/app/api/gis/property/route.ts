import { collectProperty } from "@/lib/gis/property";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const locId = p.get("locId") ?? "",
    townId = Number(p.get("townId"));
  if (
    (locId !== "" && !/^[MF]_\d+_\d+$/.test(locId)) ||
    locId.length > 30 ||
    !Number.isInteger(townId) ||
    townId < 1 ||
    townId > 352
  )
    return Response.json(
      { error: "Provide the selected parcel's valid LOC_ID and TOWN_ID." },
      { status: 400 },
    );
  return Response.json(await collectProperty(locId, townId), {
    headers: { "Cache-Control": "no-store" },
  });
}
