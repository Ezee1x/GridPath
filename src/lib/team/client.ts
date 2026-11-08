"use client";
import type { SiteRecord } from "../types";
import type { IntakeRecord } from "../intake/types";
import type { TeamUser } from "./server";
import { WORKSPACE_STORAGE_KEY } from "../persistence";
import { engineeringKeyForSite } from "../intake/site-identity";
import { INTAKE_STORAGE } from "../intake/model";
import { portableIntake } from "../intake/portable";
import { indexedDbVault, toFile } from "../intake/file-vault";
import { loadAnalysisImage } from "../annotations/images";
type SharedRow = {
  kind: "site" | "engineering";
  key: string;
  version: number;
  payload: SiteRecord | IntakeRecord;
};
type State = {
  enabled: boolean;
  initialized: boolean;
  user: TeamUser | null;
  error: string;
  pending: number;
};
const initial: State = {
  enabled: false,
  initialized: false,
  user: null,
  error: "",
  pending: 0,
};
let state = initial;
const listeners = new Set<() => void>(),
  versions = new Map<string, number>(),
  published = new Set<string>(),
  imageSites = new Map<string, string>(),
  blocked = new Set<string>(),
  revisions = new Map<string, number>();
let applying = false,
  queue = Promise.resolve(),
  timer: ReturnType<typeof setInterval> | undefined;
const notify = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
};
export const teamState = () => state;
export const teamServerState = () => initial;
export const subscribeTeam = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export async function teamRequest(action: string, body?: unknown) {
  const response = await fetch(
    `/api/team/${action}`,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const result = await response.json();
  if (!response.ok) {
    const e = new Error(
      result.error ?? "Shared workspace request failed.",
    ) as Error & { status: number };
    e.status = response.status;
    throw e;
  }
  return result;
}
function registerSite(site: SiteRecord) {
  const key = engineeringKeyForSite(site);
  published.add(key);
  for (const a of site.annotatedImages ?? []) imageSites.set(a.id, key);
}
export async function pullTeam(force = false) {
  if (!state.user || (state.pending && !force)) return;
  const rows: SharedRow[] = await teamRequest("records");
  applying = true;
  try {
    const sites: SiteRecord[] = [];
    for (const row of rows) {
      const id = `${row.kind}:${row.key}`;
      if (blocked.has(id) && !force) continue;
      if ((versions.get(id) ?? 0) >= row.version && !force) continue;
      if (!force && !versions.has(id)) {
        const local =
          row.kind === "engineering"
            ? localStorage.getItem(INTAKE_STORAGE + row.key)
            : JSON.stringify(
                (
                  JSON.parse(
                    localStorage.getItem(WORKSPACE_STORAGE_KEY) || "[]",
                  ) as SiteRecord[]
                ).find((s) => s.id === row.key),
              );
        if (local && local !== JSON.stringify(row.payload)) {
          blocked.add(id);
          notify({
            error:
              "A browser record differs from the shared copy. Export your local site package, then choose Pull latest shared copies in Settings to resolve it.",
          });
          continue;
        }
      }
      versions.set(id, row.version);
      if (force) blocked.delete(id);
      if (row.kind === "site") {
        registerSite(row.payload as SiteRecord);
        sites.push(row.payload as SiteRecord);
      } else {
        localStorage.setItem(
          INTAKE_STORAGE + row.key,
          JSON.stringify(row.payload),
        );
        window.dispatchEvent(
          new CustomEvent("qore-team-engineering", { detail: row.key }),
        );
      }
    }
    if (sites.length)
      window.dispatchEvent(
        new CustomEvent("qore-team-sites", { detail: sites }),
      );
    if (force) notify({ error: "" });
  } finally {
    applying = false;
  }
}
export async function refreshTeam() {
  const session = await teamRequest("session");
  notify({ ...session, error: "" });
  if (timer) clearInterval(timer);
  if (session.user) {
    await pullTeam();
    timer = setInterval(() => {
      void pullTeam().catch((e) => notify({ error: e.message }));
    }, 10000);
  }
}
export function queueTeamRecord(
  kind: SharedRow["kind"],
  key: string,
  payload: SiteRecord | IntakeRecord,
) {
  if (
    !state.user ||
    applying ||
    (kind === "engineering" && !published.has(key))
  )
    return;
  if (state.user.role === "viewer") {
    notify({
      error: "This account is read-only. Local changes have not been shared.",
    });
    return;
  }
  const id = `${kind}:${key}`;
  if (blocked.has(id)) return;
  const revision = (revisions.get(id) ?? 0) + 1;
  revisions.set(id, revision);
  const copy = JSON.parse(JSON.stringify(payload));
  notify({ pending: state.pending + 1 });
  queue = queue
    .then(async () => {
      if (blocked.has(id)) return;
      try {
        const result = await teamRequest("records", {
          kind,
          key,
          payload: copy,
          baseVersion: versions.get(id) ?? 0,
        });
        versions.set(id, result.version);
        if (kind === "engineering" && revisions.get(id) === revision) {
          localStorage.setItem(
            INTAKE_STORAGE + key,
            JSON.stringify(result.payload),
          );
          window.dispatchEvent(
            new CustomEvent("qore-team-engineering", { detail: key }),
          );
        } else if (kind === "site") registerSite(copy as SiteRecord);
      } catch (e) {
        blocked.add(id);
        notify({
          error: e instanceof Error ? e.message : "Shared save failed.",
        });
      }
    })
    .finally(() => notify({ pending: Math.max(0, state.pending - 1) }));
}
export async function flushTeam() {
  await queue;
}
export async function uploadTeamFile(key: string, siteKey: string, file: File) {
  if (!state.user || !published.has(siteKey)) return;
  await flushTeam();
  const form = new FormData();
  form.set("key", key);
  form.set("siteKey", siteKey);
  form.set("file", file);
  const response = await fetch("/api/team/upload", {
    method: "POST",
    body: form,
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error ?? "Shared file upload failed.");
}
export function syncTeamFile(key: string, siteKey: string, file: File) {
  void uploadTeamFile(key, siteKey, file).catch((e) =>
    notify({ error: e.message }),
  );
}
export function syncTeamSite(site: SiteRecord) {
  queueTeamRecord("site", site.id, site);
  if (!state.user || applying) return;
  registerSite(site);
  const key = engineeringKeyForSite(site),
    raw = localStorage.getItem(INTAKE_STORAGE + key);
  if (raw) queueTeamRecord("engineering", key, portableIntake(JSON.parse(raw)));
  void (async () => {
    await flushTeam();
    for (const analysis of site.annotatedImages ?? []) {
      const blob = await loadAnalysisImage(analysis.id);
      if (blob)
        await uploadTeamFile(
          `image:${engineeringKeyForSite(site)}:${analysis.id}`,
          engineeringKeyForSite(site),
          new File([blob], analysis.image.fileName, { type: blob.type }),
        );
    }
  })().catch((e) => notify({ error: e.message }));
}
export async function publishBrowserSites(sites: SiteRecord[]) {
  if (!state.user) throw Error("Sign in first.");
  for (const site of sites) {
    syncTeamSite(site);
    await flushTeam();
    const key = engineeringKeyForSite(site),
      raw = localStorage.getItem(INTAKE_STORAGE + key);
    if (raw)
      queueTeamRecord("engineering", key, portableIntake(JSON.parse(raw)));
    await flushTeam();
    for (const row of (await indexedDbVault()?.list(key)) ?? [])
      await uploadTeamFile(row.key, key, toFile(row));
  }
  if (state.error) throw Error(state.error);
}
export async function sharedFiles(siteKey: string) {
  if (!state.user || !published.has(siteKey)) return [];
  const rows: { key: string; name: string; type: string; hash: string }[] =
    await teamRequest(`files?siteKey=${encodeURIComponent(siteKey)}`);
  const out: { key: string; file: File; hash: string }[] = [];
  for (const row of rows.filter((r) => r.key.startsWith("input:"))) {
    const response = await fetch(
      `/api/team/file?key=${encodeURIComponent(row.key)}`,
    );
    if (response.ok)
      out.push({
        key: row.key,
        file: new File([await response.blob()], row.name, { type: row.type }),
        hash: row.hash,
      });
  }
  return out;
}
export async function sharedImage(id: string) {
  const key = imageSites.get(id);
  if (!state.user || !key) return undefined;
  const response = await fetch(
    `/api/team/file?key=${encodeURIComponent(`image:${key}:${id}`)}`,
  );
  return response.ok ? response.blob() : undefined;
}
