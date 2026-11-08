"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SelectedAddress } from "@/lib/maps/address";
import type { GisLayerResult, GisLayerState, LayerKind } from "@/lib/gis/types";
const idle = (): GisLayerState => ({
  status: "idle",
  result: null,
  error: null,
});
export function useSiteGis(address: SelectedAddress | null) {
  const [layers, setLayers] = useState<Record<LayerKind, GisLayerState>>({
    parcels: idle(),
    buildings: idle(),
    roads: idle(),
  });
  const [parcelId, setParcelId] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
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
          setParcelId(result.selectedParcelId ?? null);
          setManual(false);
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
    void load("parcels");
    const active = controllers.current;
    return () => Object.values(active).forEach((c) => c?.abort());
  }, [load]);
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
    if (id !== parcelId) {
      controllers.current.buildings?.abort();
      controllers.current.roads?.abort();
      setLayers((old) => ({ ...old, buildings: idle(), roads: idle() }));
    }
    setParcelId(id);
    setManual(true);
  }
  function retry(kind: LayerKind) {
    if (kind === "parcels") {
      controllers.current.buildings?.abort();
      controllers.current.roads?.abort();
      setParcelId(null);
    }
    void load(kind, kind === "parcels" ? null : parcelId);
  }
  return { layers, parcelId, manual, selectParcel, retry };
}
