import { getSiteContext } from "@/lib/annotations/context.server";

export const maxDuration = 90;

export async function POST(request: Request) {
  let address = "";
  try {
    const body = (await request.json()) as { address?: unknown };
    address = typeof body.address === "string" ? body.address.trim() : "";
  } catch {
    return Response.json({ error: "The request could not be read." }, { status: 400 });
  }
  if (address.length < 6 || address.length > 200)
    return Response.json(
      { error: "Enter a street address with a building number, town and state." },
      { status: 400 },
    );
  try {
    return Response.json(await getSiteContext(address), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("Site context failed", e);
    return Response.json(
      { error: "Public sources could not be searched. Check the server's internet connection and try again." },
      { status: 502 },
    );
  }
}
