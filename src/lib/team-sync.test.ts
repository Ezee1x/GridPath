import test from "node:test";
import assert from "node:assert/strict";
import {
  refreshTeam,
  syncTeamSite,
  queueTeamRecord,
  flushTeam,
} from "./team/client";
import { createIntakeRecord, INTAKE_STORAGE } from "./intake/model";
import type { SiteRecord } from "./types";
test("shared acknowledgements update the latest revision per record without rolling back newer local edits", async () => {
  const oldFetch = global.fetch,
    oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window"),
    oldStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: new EventTarget(),
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
    },
  });
  let signedIn = true;
  const waiting: { payload: unknown; resolve: (response: Response) => void }[] =
    [];
  global.fetch = async (input, init) => {
    const action = String(input);
    if (action.includes("/session"))
      return Response.json({
        enabled: true,
        initialized: true,
        user: signedIn
          ? {
              id: "test-user",
              email: "qa@example.test",
              name: "QA",
              role: "engineer",
            }
          : null,
      });
    if (!init?.method) return Response.json([]);
    const body = JSON.parse(String(init.body));
    if (body.kind === "site")
      return Response.json({ version: 1, payload: body.payload });
    return new Promise((resolve) =>
      waiting.push({ payload: body.payload, resolve }),
    );
  };
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  try {
    await refreshTeam();
    for (const id of ["sync-a", "sync-b"])
      syncTeamSite({
        id,
        mapPlaceId: id,
        parcelFeatureId: null,
        annotatedImages: [],
      } as unknown as SiteRecord);
    await flushTeam();
    const a = createIntakeRecord("sync-a", "Synthetic A", null),
      b = createIntakeRecord("sync-b", "Synthetic B", null);
    queueTeamRecord("engineering", a.siteKey, a);
    queueTeamRecord("engineering", b.siteKey, b);
    await tick();
    waiting
      .shift()!
      .resolve(
        Response.json({
          version: 1,
          payload: { ...a, updatedAt: "server-a-ack" },
        }),
      );
    await tick();
    assert.equal(
      JSON.parse(storage.get(INTAKE_STORAGE + a.siteKey)!).updatedAt,
      "server-a-ack",
      "Another record pending must not suppress this acknowledgement",
    );
    waiting.shift()!.resolve(Response.json({ version: 1, payload: b }));
    await flushTeam();
    storage.set(
      INTAKE_STORAGE + a.siteKey,
      JSON.stringify({ ...a, updatedAt: "new-local-edit" }),
    );
    queueTeamRecord("engineering", a.siteKey, {
      ...a,
      updatedAt: "older-edit",
    });
    queueTeamRecord("engineering", a.siteKey, {
      ...a,
      updatedAt: "new-local-edit",
    });
    await tick();
    waiting
      .shift()!
      .resolve(
        Response.json({
          version: 2,
          payload: { ...a, updatedAt: "older-server-ack" },
        }),
      );
    await tick();
    assert.equal(
      JSON.parse(storage.get(INTAKE_STORAGE + a.siteKey)!).updatedAt,
      "new-local-edit",
    );
    waiting
      .shift()!
      .resolve(
        Response.json({
          version: 3,
          payload: { ...a, updatedAt: "new-server-ack" },
        }),
      );
    await flushTeam();
    assert.equal(
      JSON.parse(storage.get(INTAKE_STORAGE + a.siteKey)!).updatedAt,
      "new-server-ack",
    );
  } finally {
    signedIn = false;
    await refreshTeam();
    global.fetch = oldFetch;
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (oldStorage)
      Object.defineProperty(globalThis, "localStorage", oldStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
