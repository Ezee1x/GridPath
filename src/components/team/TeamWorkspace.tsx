"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  teamState,
  teamServerState,
  subscribeTeam,
  teamRequest,
  refreshTeam,
  publishBrowserSites,
  pullTeam,
} from "@/lib/team/client";
import { useWorkspace } from "@/lib/store";
export const useTeamState = () =>
  useSyncExternalStore(subscribeTeam, teamState, teamServerState);
export function TeamStatus() {
  const state = useTeamState();
  return state.error ? (
    <p className="notice" role="alert">
      Shared workspace: {state.error}{" "}
      <Link href="/settings">Review sync settings</Link>
    </p>
  ) : state.user ? (
    <p className="team-status" role="status">
      Shared workspace · {state.user.name} · {state.user.role} ·{" "}
      {state.pending
        ? `${state.pending} saves pending`
        : "Records synchronized"}
    </p>
  ) : null;
}
export function TeamWorkspace() {
  const state = useTeamState(),
    { sites } = useWorkspace();
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [audit, setAudit] = useState<
      {
        id: number;
        at: string;
        actor: string;
        action: string;
        recordKey: string;
      }[]
    >([]);
  useEffect(() => {
    void refreshTeam().catch((e) => setError(e.message));
  }, []);
  async function submit(
    event: React.FormEvent<HTMLFormElement>,
    action: string,
  ) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget),
      body = Object.fromEntries(form);
    try {
      await teamRequest(action, body);
      if (action === "bootstrap") {
        await teamRequest("login", body);
      }
      await refreshTeam();
      setMessage(
        action === "users"
          ? "Team member created. Share their temporary password through your secure channel."
          : "Shared workspace connected.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card panel-padding">
      <h2>Shared team workspace</h2>
      <p>
        One server, shared site records and document files. Engineer/admin
        accounts can attribute reviews to their signed-in identity. Browser-only
        records remain available until you publish them.
      </p>
      {!state.enabled ? (
        <p>
          To enable the self-hosted workspace, set{" "}
          <code>QORE_TEAM_ENABLED=true</code>, a persistent{" "}
          <code>QORE_DATA_DIR</code>, and a secret{" "}
          <code>QORE_TEAM_SETUP_TOKEN</code> on the server, then restart. See
          the team deployment guide.
        </p>
      ) : !state.user ? (
        <form
          className="intake-form"
          onSubmit={(e) =>
            void submit(e, state.initialized ? "login" : "bootstrap")
          }
        >
          {!state.initialized && (
            <>
              <label>
                Administrator name
                <input name="name" required autoComplete="name" />
              </label>
              <label>
                Server setup token
                <input
                  name="setupToken"
                  type="password"
                  required
                  autoComplete="off"
                />
              </label>
            </>
          )}
          <label>
            Email
            <input name="email" type="email" required autoComplete="username" />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              minLength={12}
              required
              autoComplete={
                state.initialized ? "current-password" : "new-password"
              }
            />
          </label>
          <button className="button" disabled={busy}>
            {state.initialized ? "Sign in" : "Create workspace administrator"}
          </button>
        </form>
      ) : (
        <>
          <p>
            Signed in as {state.user.name} ({state.user.email}) ·{" "}
            {state.user.role}
          </p>
          <div className="button-row">
            <button
              className="button secondary"
              disabled={busy || state.user.role === "viewer"}
              onClick={async () => {
                setBusy(true);
                try {
                  await publishBrowserSites(sites);
                  setMessage("Browser records and available files published.");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Publish browser records & files
            </button>
            <button
              className="button secondary"
              onClick={async () => {
                if (
                  !window.confirm(
                    "Pull shared copies? Export a site package first if you have local changes that failed to sync.",
                  )
                )
                  return;
                try {
                  await pullTeam(true);
                  setMessage("Shared records pulled.");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Pull latest shared copies
            </button>
            <button
              className="text-link"
              onClick={async () => {
                await teamRequest("logout", {});
                await refreshTeam();
              }}
            >
              Sign out
            </button>
          </div>
          <p className="muted">
            Signing out ends the server session. Downloaded records remain in
            this browser; use a trusted device.
          </p>
          <details>
            <summary>Change password</summary>
            <form
              className="intake-form"
              onSubmit={(e) => void submit(e, "password")}
            >
              <label>
                Current password
                <input
                  name="oldPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              <label>
                New password
                <input
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
              </label>
              <button className="button" disabled={busy}>
                Change password and sign out all sessions
              </button>
            </form>
          </details>
          {state.user.role === "admin" && (
            <details>
              <summary>Disable team member</summary>
              <form
                className="intake-form"
                onSubmit={(e) => void submit(e, "disable-user")}
              >
                <label>
                  Member email
                  <input name="email" type="email" required />
                </label>
                <button className="button secondary" disabled={busy}>
                  Disable account and revoke sessions
                </button>
              </form>
            </details>
          )}
          {state.user.role === "admin" && (
            <details>
              <summary>Add team member</summary>
              <form
                className="intake-form"
                onSubmit={(e) => void submit(e, "users")}
              >
                <label>
                  Name
                  <input name="name" required />
                </label>
                <label>
                  Email
                  <input name="email" type="email" required />
                </label>
                <label>
                  Temporary password
                  <input
                    name="password"
                    type="password"
                    minLength={12}
                    required
                    autoComplete="new-password"
                  />
                </label>
                <label>
                  Role
                  <select name="role">
                    <option value="editor">Editor</option>
                    <option value="engineer">Engineer/reviewer</option>
                    <option value="viewer">Viewer</option>
                    <option value="admin">Administrator</option>
                  </select>
                </label>
                <button className="button" disabled={busy}>
                  Create team member
                </button>
              </form>
            </details>
          )}
          <details>
            <summary
              onClick={() =>
                void teamRequest("audit")
                  .then(setAudit)
                  .catch((e) => setError(e.message))
              }
            >
              Recent server audit events
            </summary>
            <ul>
              {audit.map((row) => (
                <li key={row.id}>
                  {new Date(row.at).toLocaleString()} · {row.actor} ·{" "}
                  {row.action}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
