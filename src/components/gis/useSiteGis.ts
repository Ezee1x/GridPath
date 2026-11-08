"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SelectedAddress } from "@/lib/maps/address";
import type { GisLayerResult, GisLayerState, LayerKind } from "@/lib/gis/types";
import { resolvedParcelId } from "@/lib/parcel-selection";
const idle = (): GisLayerState => ({
  status: "idle",
  result: null,
  error: null,
});
export function useSiteGis(
  address: SelectedAddress | null,
  initialParcelId?: string | null,
) {
  const [layers, setLayers] = useState<Record<LayerKind, GisLayerState>>({
    parcels: idle(),
    buildings: idle(),
    roads: idle(),
  });
  const [parcelId, setParcelId] = useState<string | null>(
    initialParcelId ?? null,
  );
  const [manual, setManual] = useState(!!initialParcelId);
  // GisSiteContext is keyed by address. This ref belongs only to this site and
  // also protects a manual choice from an older in-flight response.
  const explicitParcel = useRef<string | null>(initialParcelId ?? null);
  const controllers = useRef<Partial<Record<LayerKind, AbortController>>>({});
  const load = useCallback(
    async (kind: LayerKind, selectedParcelId: string | null = null) => {
      if (!address) return;
      controllers.current[kind]?.abort();
      const controller = new AbortController();
      controllers.current[kind] = controller;
      setLayers((old) => ({
        ...old,
        [kind]: { status: "loading", result: null, error: null },
      }));
      const params = new URLSearchParams({
        lat: String(address.latitude),
        lng: String(address.longitude),
        address: address.formattedAddress,
        layer: kind,
        coordinateSource: address.source,
      });
      if (selectedParcelId) params.set("parcelId", selectedParcelId);
      try {
        const response = await fetch(`/api/gis/site?${params}`, {
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error ?? "GIS lookup failed. Retry this layer.",
          );
        if (controller.signal.aborted) return;
        setLayers((old) => ({
          ...old,
          [kind]: {
            status: "ready",
            result: result as GisLayerResult,
            error: null,
          },
        }));
        if (kind === "parcels") {
          const restored = resolvedParcelId(
            explicitParcel.current,
            result.selectedParcelId,
          );
          setParcelId(restored);
          setManual(!!explicitParcel.current);
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setLayers((old) => ({
            ...old,
            [kind]: {
              status: "error",
              result: null,
              error:
                error instanceof Error ? error.message : "GIS lookup failed.",
            },
          }));
      }
    },
    [address],
  );
  useEffect(() => {
    explicitParcel.current ??= initialParcelId ?? null;
    void load("parcels", explicitParcel.current);
    const active = controllers.current;
    return () => Object.values(active).forEach((c) => c?.abort());
  }, [load, initialParcelId]);
  const parcelStatus = layers.parcels.status;
  useEffect(() => {
    if (parcelStatus !== "ready" && parcelStatus !== "error") return;
    void load("buildings", parcelId);
    void load("roads", parcelId);
    const active = controllers.current;
    return () => {
      active.buildings?.abort();
      active.roads?.abort();
    };
  }, [parcelId, parcelStatus, load]);
  function selectParcel(id: string) {
    explicitParcel.current = id;
    if (id !== parcelId) {
      controllers.current.buildings?.abort();
      controllers.current.roads?.abort();
      setLayers((old) => ({ ...old, buildings: idle(), roads: idle() }));
    }
    setParcelId(id);
    setManual(true);
  }
  function retry(kind: LayerKind) {
    if (kind === "parcels") explicitParcel.current ??= parcelId;
    if (kind === "parcels") {
      controllers.current.buildings?.abort();
      controllers.current.roads?.abort();
      // Preserve the current parcel through a refresh of its source layer.
    }
    void load(kind, explicitParcel.current ?? parcelId);
  }
  return { layers, parcelId, manual, selectParcel, retry };
}
