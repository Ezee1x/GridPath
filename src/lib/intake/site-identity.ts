import type { SiteRecord } from "../types";
import {
  createIntakeRecord,
  siteRecordKey,
  mergeCollectedFields,
  observationId,
} from "./model";
import { mergeLegacyRecord } from "./adapters";
export const engineeringKeyForSite = (site: SiteRecord) =>
  siteRecordKey(
    site.mapPlaceId ?? `workspace:${site.id}`,
    site.parcelFeatureId ?? null,
  );
export function initialEngineeringRecord(site: SiteRecord) {
  const record = createIntakeRecord(
    site.mapPlaceId ?? `workspace:${site.id}`,
    site.address,
    site.parcelFeatureId ?? null,
  );
  if (site.dataFields.length || site.missingRequirements.length)
    return mergeLegacyRecord(record, site);
  const census = site.sourceDocuments.find(
    (s) => s.sourceAuthority === "U.S. Census address geocoder",
  );
  const key = `saved-address:${site.id}`,
    provider = census ? "U.S. Census address geocoder" : "Workspace user";
  return mergeCollectedFields(
    record,
    [
      {
        fieldId: "address",
        observation: {
          id: observationId(
            "address",
            site.address,
            provider,
            [key],
            "Saved public address or explicit manual intake",
            null,
          ),
          value: site.address,
          unit: null,
          originalUnits: null,
          provider,
          provenance: census ? "Public GIS record" : "User supplied",
          sourceKeys: [key],
          method: census
            ? "Independent Census address saved during site selection; Google content is not stored."
            : "Manually supplied site address; not independently geocoded or verified.",
          confidence: census ? "Documented" : "User supplied",
          observedAt: site.updatedAt,
        },
      },
    ],
    {
      [key]: {
        key,
        provider,
        dataset: census
          ? "Saved Census address lookup"
          : "Manual address entry",
        serviceUrl: census?.url ?? "",
        featureId: null,
        featureName: null,
        recordDate: null,
        datasetUpdated: null,
        retrievedAt: census?.retrievedAt ?? site.createdAt,
        referenceOnly: !census,
      },
    },
  );
}
