import { centuryTywoodSite, emptyFields, requirements } from "./fixtures";
import { SiteField, SiteRecord, SourceDocument } from "./types";

const addedAt = "2026-11-07T17:00:00.000Z";
const summarySource: SourceDocument = {
  id: "user-project-summary-2026-11-07",
  title: "Project sites and reported status — user-provided screenshot",
  type: "User input",
  fileName: "Screenshot 2026-11-07 at 11.58.08 AM.png",
  url: null,
  uploadedAt: addedAt,
  retrievedAt: null,
  referencePage:
    "Project site / Location / Latest publicly supported status table",
  sourceAuthority:
    "User-provided project summary. Original public statements have not been supplied or independently verified.",
  size: null,
};
function summaryField(
  id: string,
  label: string,
  value: string,
  required = false,
): SiteField {
  return {
    id,
    label,
    value,
    required,
    category: "Property",
    unit: null,
    conditionType: "existing",
    status: "Needs review",
    confidence: "Unknown",
    sourceIds: [summarySource.id],
    reviewedBy: null,
    reviewedAt: null,
    notes:
      "Transcribed from the user-provided project summary. Requires original-source confirmation; not independently verified.",
  };
}
function project(
  id: string,
  facilityName: string,
  location: string,
  municipality: string | null,
  region: string,
  reportedStatus: string,
): SiteRecord {
  const fields = emptyFields().map((field) =>
    field.id === "facility"
      ? summaryField(field.id, field.label, facilityName, true)
      : field.id === "municipality" && municipality
        ? summaryField(field.id, field.label, municipality, true)
        : field,
  );
  fields.push(
    summaryField("region", "State / region", region),
    summaryField(
      "reportedProjectStatus",
      "Reported project status",
      reportedStatus,
    ),
  );
  return {
    id,
    facilityName,
    address: `${location} — street address not supplied`,
    location: { municipality, coordinates: null, parcelGeometry: null },
    lifecycleStatus: "Needs review",
    dataFields: fields,
    sourceDocuments: [{ ...summarySource }],
    missingRequirements: requirements(fields),
    createdAt: addedAt,
    updatedAt: addedAt,
    sample: true,
  };
}
const century = structuredClone(centuryTywoodSite);
const centuryStatus = summaryField(
  "reportedProjectStatus",
  "Reported project status",
  "Active demonstration project; the supplied summary reports EQORE integration and an on-site walkthrough.",
);
century.dataFields.push(centuryStatus);
century.sourceDocuments.push({ ...summarySource });
century.missingRequirements.push(...requirements([centuryStatus]));

export const referenceProjects: SiteRecord[] = [
  century,
  project(
    "thermofusion",
    "ThermoFusion",
    "Hayward, California",
    "Hayward",
    "California",
    "Operating; the supplied summary reports EQORE-published battery dispatch performance.",
  ),
  project(
    "aalberts-surface-technologies",
    "Aalberts Surface Technologies",
    "New Hampshire",
    null,
    "New Hampshire",
    "Operating; the supplied summary reports an EQORE-confirmed installed system.",
  ),
];

/** Add newly supplied references without replacing saved evidence, review edits, or custom records. */
export function mergeReferenceProjects(saved: SiteRecord[]): SiteRecord[] {
  let changed = false;
  const merged = saved.map((site) => {
    const reference = referenceProjects.find((item) => item.id === site.id);
    if (!reference) return site;
    const additions = reference.dataFields.filter(
      (field) => !site.dataFields.some((current) => current.id === field.id),
    );
    if (!additions.length) return site;
    changed = true;
    const sourceIds = new Set(additions.flatMap((field) => field.sourceIds));
    return {
      ...site,
      dataFields: [...site.dataFields, ...structuredClone(additions)],
      sourceDocuments: [
        ...site.sourceDocuments,
        ...structuredClone(
          reference.sourceDocuments.filter(
            (source) =>
              sourceIds.has(source.id) &&
              !site.sourceDocuments.some((current) => current.id === source.id),
          ),
        ),
      ],
      missingRequirements: [
        ...site.missingRequirements,
        ...structuredClone(
          reference.missingRequirements.filter(
            (requirement) =>
              additions.some((field) => field.id === requirement.fieldId) &&
              !site.missingRequirements.some(
                (current) => current.id === requirement.id,
              ),
          ),
        ),
      ],
    };
  });
  for (const reference of referenceProjects) {
    if (!merged.some((site) => site.id === reference.id)) {
      merged.push(structuredClone(reference));
      changed = true;
    }
  }
  return changed ? merged : saved;
}
