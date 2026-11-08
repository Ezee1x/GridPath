import { engineeringStore } from "./intake/record-store";
import {
  engineeringKeyForSite,
  initialEngineeringRecord,
} from "./intake/site-identity";
import { verificationItems } from "./intake/verification";
import type { SiteRecord } from "./types";
import { readiness as legacyReadiness } from "./calculations";
import {
  loadIntake,
  siteRecordKey,
  readiness,
  isPopulated,
} from "./intake/model";
import { FIELD_SCHEMA } from "./intake/schema";
export function savedSiteReadiness(
  site: SiteRecord,
  storage?: Pick<Storage, "getItem">,
) {
  if (!site.mapPlaceId) return legacyReadiness(site);
  let record = null;
  try {
    if (storage)
      record = loadIntake(
        storage,
        siteRecordKey(site.mapPlaceId, site.parcelFeatureId ?? null),
      );
  } catch {
    /* Unreadable evidence cannot inflate readiness. */
  }
  const required = FIELD_SCHEMA.filter((f) => f.required);
  const r = record
    ? readiness(record)
    : {
        required: required.length,
        populated: 0,
        missing: required.length,
        awaitingVerification: 0,
      };
  return {
    total: r.required,
    populated: r.populated,
    percent: Math.round((100 * r.populated) / r.required),
    missing: r.missing,
    outstanding: r.missing + r.awaitingVerification,
    critical: required.filter(
      (d) =>
        d.priority === 1 &&
        (!record || !isPopulated(record.fields.find((f) => f.id === d.id)!)),
    ).length,
  };
}

/** Live summaries use the same in-memory engineering record as the queue and dashboard. */
export function currentSavedSiteReadiness(site: SiteRecord) {
  const record = engineeringStore()
    .open(engineeringKeyForSite(site), () => initialEngineeringRecord(site))
    .getSnapshot().record;
  const r = readiness(record),
    items = verificationItems(record);
  return {
    lifecycleStatus: (items.length === 0
      ? "Ready for review"
      : r.populated > 0 ||
          record.fields.some((f) => f.request.status !== "Missing")
        ? "Needs review"
        : "Preliminary") as SiteRecord["lifecycleStatus"],
    total: r.required,
    populated: r.populated,
    percent: Math.round((100 * r.populated) / r.required),
    missing: r.missing,
    outstanding: items.length,
    critical: items.filter((item) => item.priority === "Critical").length,
  };
}
