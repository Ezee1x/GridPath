import type { EvidenceReference, IntakeRecord } from "./types";

export const FILE_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.csv,.xml,.txt,.json,.xlsx,.xls,.docx,.doc,.dwg,.dxf";
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Prepare references before committing anything to the shared site record. */
export async function prepareFieldFiles(
  record: IntakeRecord,
  fieldId: string,
  files: File[],
  note = "",
  scope: NonNullable<EvidenceReference["documentScope"]> = "unclassified",
) {
  if (!["unclassified", "site-evidence", "reference-only"].includes(scope))
    throw Error("Choose a valid document classification.");
  if (!record.fields.some((field) => field.id === fieldId))
    throw Error("Choose a field in this site record.");
  if (!files.length) throw Error("Choose at least one file.");
  if (files.length > 10) throw Error("Add up to 10 files at a time.");
  for (const file of files) {
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!FILE_ACCEPT.split(",").includes(extension))
      throw Error(
        `Unsupported file type: ${file.name}. Choose a supported document, image, spreadsheet or drawing.`,
      );
    if (!file.size) throw Error(`${file.name} is empty.`);
    if (file.size > MAX_FILE_BYTES)
      throw Error(`${file.name} exceeds the 25 MB file limit.`);
  }
  const sources: Record<string, EvidenceReference> = {};
  const bytes = new Map<string, File>();
  for (const file of files) {
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
      ),
    )
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
    // Keep legacy keys for unclassified uploads; separate reference copies from
    // site evidence so re-uploading bytes cannot silently promote a sample.
    const key = `input:${record.siteKey}:${fieldId}:${hash}${scope === "unclassified" ? "" : `:${scope}`}`;
    sources[key] = record.sources[key] ?? {
      key,
      dataset: file.name,
      provider: "Customer document",
      serviceUrl: "",
      featureId: null,
      featureName: null,
      recordDate: null,
      datasetUpdated: null,
      retrievedAt: new Date().toISOString(),
      matchingMethod:
        note.trim() ||
        "Supporting file attached to this field; no value extracted or verified.",
      documentId: hash,
      fileName: file.name,
      fileHash: hash,
      documentScope: scope,
      referenceOnly: scope === "reference-only",
    };
    bytes.set(key, file);
  }
  return { sources, bytes };
}
