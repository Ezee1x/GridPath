import type { SiteRecord } from "./types";
/** The saved-site index contains identity only. Engineering values and actions live in IntakeRecord. */
export function createSiteMetadata(address: string): SiteRecord {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    facilityName: address,
    address,
    location: { municipality: null, coordinates: null, parcelGeometry: null },
    lifecycleStatus: "Preliminary",
    dataFields: [],
    missingRequirements: [],
    sourceDocuments: [],
    createdAt: now,
    updatedAt: now,
    sample: false,
  };
}
