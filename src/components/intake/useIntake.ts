"use client";
import { useEffect, useRef, useState } from "react";
import {
  createIntakeRecord,
  loadIntake,
  mergeCollectedFields,
  INTAKE_STORAGE,
  siteRecordKey,
} from "@/lib/intake/model";
import { portableIntake, migratePlacesStorage } from "@/lib/intake/portable";
import { environmentalCollection } from "@/lib/environment/adapters";
import type { EnvironmentBundle } from "@/lib/environment/types";
import { MassGISAdapter } from "@/lib/intake/adapters";
import type { PropertyData } from "@/lib/gis/property";
import type { IntakeRecord } from "@/lib/intake/types";
import type { SiteAnalysis } from "@/lib/gis/analysis-types";
import type { GisLayerResult } from "@/lib/gis/types";
import type { SelectedAddress } from "@/lib/maps/address";
export function useIntake(
  analysis: SiteAnalysis,
  address: SelectedAddress,
  layers: { parcels: GisLayerResult | null; roads: GisLayerResult | null },
  environment?: EnvironmentBundle,
) {
  const [state, setState] = useState(() => {
    let warning = "",
      blocked = false;
    let saved: IntakeRecord | null = null;
    try {
      migratePlacesStorage(localStorage);
      saved = loadIntake(
        localStorage,
        siteRecordKey(address.placeId, analysis.parcel.featureId),
      );
    } catch {
      warning =
        "Saved intake could not be loaded. The stored copy is preserved; export session changes to retain them.";
      blocked = true;
    }
    const c = MassGISAdapter(
      analysis,
      address,
      layers,
      saved?.propertyIdentification,
    );
    return {
      record: mergeCollectedFields(
        saved ??
          createIntakeRecord(
            address.placeId,
            address.formattedAddress,
            analysis.parcel.featureId,
          ),
        c.fields,
        c.sources,
        analysis,
      ),
      warning,
      blocked,
    };
  });
  const currentContext = useRef({ analysis, address, layers });
  useEffect(() => {
    currentContext.current = { analysis, address, layers };
  }, [analysis, address, layers]);
  const last = useRef(analysis);
  useEffect(() => {
    if (last.current === analysis) return;
    last.current = analysis;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const c = MassGISAdapter(
        analysis,
        address,
        layers,
        state.record.propertyIdentification,
      );
      setState((old) => ({
        ...old,
        record: mergeCollectedFields(old.record, c.fields, c.sources, analysis),
      }));
    });
    return () => {
      active = false;
    };
  }, [analysis, address, layers, state.record.propertyIdentification]);
  useEffect(() => {
    const c = environmentalCollection(
      environment,
      analysis.parcel.featureId,
      state.record.propertyIdentification,
      Number(
        layers.parcels?.features.find(
          (f) => f.properties.id === analysis.parcel.featureId,
        )?.properties.attributes.TOWN_ID,
      ),
    );
    let active = true;
    queueMicrotask(() => {
      if (active)
        setState((old) => ({
          ...old,
          record: {
            ...mergeCollectedFields(old.record, c.fields, c.sources),
            ...(environment?.parcelId === analysis.parcel.featureId
              ? { environment }
              : {}),
          },
        }));
    });
    return () => {
      active = false;
    };
  }, [
    environment,
    analysis.parcel.featureId,
    state.record.propertyIdentification,
    layers.parcels?.features,
  ]);
  const selectedParcel = layers.parcels?.features.find(
    (f) => f.properties.id === analysis.parcel.featureId,
  );
  const locId = String(selectedParcel?.properties.attributes.LOC_ID ?? "");
  const townId = Number(selectedParcel?.properties.attributes.TOWN_ID);
  const noMatch = selectedParcel?.properties.attributes.NO_MATCH === "Y";
  const lookupLocId = noMatch ? "" : locId;
  const [propertyStatus, setPropertyStatus] = useState(
    "Waiting for parcel identifiers",
  );
  const [propertyRetry, setPropertyRetry] = useState(0);
  useEffect(() => {
    if (!townId) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted)
        setPropertyStatus(
          "Loading linked assessor records and official municipality…",
        );
    });
    const params = new URLSearchParams({
      locId: lookupLocId,
      townId: String(townId),
    });
    fetch(`/api/gis/property?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Property lookup failed");
        return response.json() as Promise<PropertyData>;
      })
      .then((data) => {
        if (
          controller.signal.aborted ||
          data.locId !== lookupLocId ||
          data.townId !== townId
        )
          return;
        const latest = currentContext.current;
        const c = MassGISAdapter(
          latest.analysis,
          latest.address,
          latest.layers,
          data,
        );
        setState((old) => ({
          ...old,
          record: {
            ...mergeCollectedFields(
              old.record,
              c.fields,
              c.sources,
              latest.analysis,
            ),
            propertyIdentification: data,
          },
        }));
        setPropertyStatus(
          data.assessor.status === "ready"
            ? `${data.assessor.records.length} linked assessor records retrieved`
            : (data.assessor.error ?? "Assessor lookup unavailable"),
        );
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setPropertyStatus(
            "Linked property lookup unavailable; existing parcel results preserved.",
          );
      });
    return () => controller.abort();
    // Identifiers define this query, not changing map layer objects. The keyed dashboard remounts for another site/parcel.
  }, [lookupLocId, townId, propertyRetry]);
  useEffect(() => {
    if (state.blocked) return;
    try {
      localStorage.setItem(
        INTAKE_STORAGE + state.record.siteKey,
        JSON.stringify({
          ...portableIntake(state.record),
          environment: undefined,
        }),
      );
    } catch {
      queueMicrotask(() =>
        setState((old) => ({
          ...old,
          warning:
            "Browser storage is unavailable or full. Export your record to retain session changes.",
        })),
      );
    }
  }, [state.record, state.blocked]);
  return {
    record: state.record,
    warning: state.warning,
    propertyStatus: noMatch
      ? "Parcel is flagged NO_MATCH; assessor data not assigned."
      : !locId || !townId
        ? "Missing LOC_ID/TOWN_ID; linked assessor lookup unavailable."
        : propertyStatus,
    retryProperty: () => setPropertyRetry((n) => n + 1),
    update: (fn: (record: IntakeRecord) => IntakeRecord) =>
      setState((old) => ({ ...old, record: fn(old.record) })),
  };
}
