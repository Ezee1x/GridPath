import { boundedForm } from "@/lib/team/request-access.server";
import { teamRepository, TeamError, type TeamRole } from "@/lib/team/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const cookieName = "qore-team-session";
function token(request: Request) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
}
function cookie(value: string) {
  return `${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${value ? 604800 : 0}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    const { action } = await params;
    if (action === "session" && process.env.QORE_TEAM_ENABLED !== "true")
      return Response.json({ enabled: false, user: null });
    const repo = teamRepository();
    if (action === "session") {
      let user = null;
      try {
        user = repo.authenticate(token(request));
      } catch {}
      return Response.json({
        enabled: true,
        initialized: repo.hasUsers(),
        user,
      });
    }
    const user = repo.authenticate(token(request));
    if (action === "records") return Response.json(repo.list());
    if (action === "audit") return Response.json(repo.audit(user));
    if (action === "users") return Response.json(repo.users(user));
    if (action === "files")
      return Response.json(
        repo.files(new URL(request.url).searchParams.get("siteKey") ?? ""),
      );
    if (action === "file") {
      const row = repo.file(new URL(request.url).searchParams.get("key") ?? "");
      return new Response(row.bytes, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(String(row.name))}`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    throw new TeamError("Unknown endpoint.", 404);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Shared workspace failed." },
      { status: e instanceof TeamError ? e.status : 500 },
    );
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    if (
      request.headers.get("origin") &&
      request.headers.get("origin") !== new URL(request.url).origin
    )
      throw new TeamError("Cross-origin writes are not allowed.", 403);
    const { action } = await params;
    const repo = teamRepository();
    if (action === "upload") {
      const user = repo.authenticate(token(request));
      if (Number(request.headers.get("content-length")) > 51 * 1024 * 1024)
        throw new TeamError("File too large.", 413);
      const form = await boundedForm(request, 51 * 1024 * 1024);
      const file = form.get("file");
      if (!(file instanceof File)) throw new TeamError("Choose a file.");
      return Response.json(
        repo.putFile(
          user,
          String(form.get("key")),
          String(form.get("siteKey")),
          file.name,
          file.type,
          new Uint8Array(await file.arrayBuffer()),
        ),
      );
    }
    const text = await request.text();
    if (text.length > 6_500_000) throw new TeamError("Request too large.", 413);
    const body = JSON.parse(text);
    if (action === "bootstrap") {
      repo.bootstrap(
        {
          email: body.email,
          name: body.name,
          password: body.password,
          role: "admin",
        },
        String(body.setupToken ?? ""),
        process.env.QORE_TEAM_SETUP_TOKEN,
      );
      return Response.json({ ok: true });
    }
    if (action === "login") {
      const session = repo.login(body.email, body.password);
      return Response.json(
        { user: session.user },
        {
          headers: {
            "Set-Cookie": cookie(session.token),
            "Cache-Control": "no-store",
          },
        },
      );
    }
    const user = repo.authenticate(token(request));
    if (action === "logout") {
      repo.logout(token(request)!);
      return Response.json(
        { ok: true },
        { headers: { "Set-Cookie": cookie("") } },
      );
    }
    if (action === "password")
      return Response.json(
        repo.changePassword(user, body.oldPassword, body.newPassword),
      );
    if (action === "disable-user")
      return Response.json(repo.disableUser(user, body.email));
    if (action === "users")
      return Response.json(
        repo.addUser(
          {
            email: body.email,
            name: body.name,
            password: body.password,
            role: body.role as TeamRole,
          },
          user,
        ),
      );
    if (action === "records")
      return Response.json(
        repo.save(user, body.kind, body.key, body.payload, body.baseVersion),
      );
    throw new TeamError("Unknown endpoint.", 404);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Shared workspace failed." },
      { status: e instanceof TeamError ? e.status : 400 },
    );
  }
}
