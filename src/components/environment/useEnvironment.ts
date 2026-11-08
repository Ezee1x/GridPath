"use client";
import { useEffect, useMemo, useState } from "react";
import type { GisFeature } from "@/lib/gis/types";
import type {
  EnvironmentKind,
  EnvironmentBundle,
  EnvironmentResult,
  EnvironmentState,
  FloodResult,
  WetlandsResult,
  ElevationResult,
} from "@/lib/environment/types";
function useLayer<T extends EnvironmentResult>(
  kind: EnvironmentKind,
  body: string | null,
  enabled: boolean,
) {
  const [retry, setRetry] = useState(0);
  const key = `${body}:${retry}`;
  const [state, setState] = useState<EnvironmentState<T> & { key: string }>({
    key: "",
    status: "idle",
    data: null,
    error: null,
  });
  useEffect(() => {
    if (!body || !enabled) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted)
        setState({ key, status: "loading", data: null, error: null });
    });
    const startedAt = new Date().toISOString(),
      began = performance.now();
    fetch(`/api/environment?layer=${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error ?? "Source request failed.");
        if (d.kind !== kind || d.parcelId !== JSON.parse(body).parcelId)
          throw Error("Source response does not match the selected parcel.");
        return d as T;
      })
      .then((data) => {
        if (!controller.signal.aborted)
          setState({
            key,
            activity: {
              source: `Environmental ${kind}`,
              startedAt,
              durationMs: performance.now() - began,
              status: data.status,
            },
            status: data.status === "error" ? "error" : "ready",
            data,
            error: data.status === "error" ? data.error : null,
          });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setState({
            key,
            activity: {
              source: `Environmental ${kind}`,
              startedAt,
              durationMs: performance.now() - began,
              status: "error",
            },
            status: "error",
            data: null,
            error: e instanceof Error ? e.message : "Source unavailable",
          });
      });
    return () => controller.abort();
  }, [body, enabled, key, kind]);
  return {
    ...(enabled && body && state.key === key
      ? state
      : {
          activity: undefined,
          status: enabled && body ? ("loading" as const) : ("idle" as const),
          data: null,
          error: null,
        }),
    retry: () => setRetry((n) => n + 1),
  };
}
export function useEnvironment(
  parcel: GisFeature | null,
  enabled: boolean,
  intervalFeet: 1 | 2 | 5 | 10,
  radiusMeters: number,
  forceDem: boolean,
) {
  const base = parcel
    ? { parcelId: parcel.properties.id, geometry: parcel.geometry }
    : null;
  const flood = useLayer<FloodResult>(
    "flood",
    base
      ? JSON.stringify({ ...base, intervalFeet: 5, radiusMeters: 250 })
      : null,
    enabled,
  );
  const wetlands = useLayer<WetlandsResult>(
    "wetlands",
    base ? JSON.stringify({ ...base, intervalFeet: 5, radiusMeters }) : null,
    enabled,
  );
  const elevation = useLayer<ElevationResult>(
    "elevation",
    base
      ? JSON.stringify({ ...base, intervalFeet, radiusMeters: 250, forceDem })
      : null,
    enabled,
  );
  const bundle = useMemo<EnvironmentBundle>(
    () => ({
      parcelId: parcel?.properties.id ?? null,
      activities: [
        flood.activity,
        wetlands.activity,
        elevation.activity,
      ].filter((a): a is NonNullable<typeof a> => !!a),
      ...(flood.data ? { flood: flood.data } : {}),
      ...(wetlands.data ? { wetlands: wetlands.data } : {}),
      ...(elevation.data ? { elevation: elevation.data } : {}),
    }),
    [
      parcel?.properties.id,
      flood.data,
      wetlands.data,
      elevation.data,
      flood.activity,
      wetlands.activity,
      elevation.activity,
    ],
  );
  return { flood, wetlands, elevation, bundle };
}
