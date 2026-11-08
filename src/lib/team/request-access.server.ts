import { teamRepository, TeamError } from "./server";
/** Public research works locally; shared installations require a team session for expensive document/model jobs. */
export function sharedJobAccess(request: Request) {
  if (process.env.QORE_TEAM_ENABLED !== "true") return;
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== new URL(request.url).origin
  )
    throw new TeamError("Cross-origin jobs are not allowed.", 403);
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("qore-team-session="))
    ?.slice("qore-team-session=".length);
  teamRepository().authenticate(token);
}
export async function boundedForm(request: Request, maximum: number) {
  if (Number(request.headers.get("content-length")) > maximum)
    throw new TeamError("Request body is too large.", 413);
  if (!request.body) throw new TeamError("Choose a file.");
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new TeamError("Request body is too large.", 413);
      }
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Response(new Blob(chunks as BlobPart[]), {
    headers: { "content-type": request.headers.get("content-type") ?? "" },
  }).formData();
}
