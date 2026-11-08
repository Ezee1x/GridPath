"use client";
import { useEffect, useSyncExternalStore } from "react";
import { engineeringStore } from "@/lib/intake/record-store";
import type { IntakeRecord } from "@/lib/intake/types";
import {
  engineeringKeyForSite,
  initialEngineeringRecord,
} from "@/lib/intake/site-identity";
import { useWorkspace } from "@/lib/store";
import type { SiteRecord } from "@/lib/types";
export function useEngineeringRecord(
  key: string,
  initialize: () => IntakeRecord,
) {
  const entry = engineeringStore().open(key, initialize);
  const state = useSyncExternalStore(
    entry.subscribe,
    entry.getSnapshot,
    entry.getSnapshot,
  );
  useEffect(() => {
    entry.flush();
  }, [entry]);
  return { ...state, update: entry.update, files: entry.files };
}
export function useSavedEngineeringRecord(site: SiteRecord) {
  const state = useEngineeringRecord(engineeringKeyForSite(site), () =>
    initialEngineeringRecord(site),
  );
  const { files: staged } = useWorkspace();
  useEffect(() => {
    for (const source of Object.values(state.record.sources)) {
      if (source.documentId && staged[source.documentId])
        state.files.set(source.key, staged[source.documentId]);
    }
  }, [state.record.sources, state.files, staged]);
  return state;
}
