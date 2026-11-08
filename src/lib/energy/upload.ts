import type { IntakeRecord } from "../intake/types";
import { prepareFieldFiles } from "../intake/file-evidence";
import { parseEnergy } from "./parse";
import type { EnergyImport } from "./types";

/** Keep the original even when parsing fails; extraction never verifies a field. */
export async function prepareCustomerEnergy(record: IntakeRecord, file: File) {
  if (!/\.(csv|xml)$/i.test(file.name) || file.size > 8_000_000)
    throw Error("Choose a CSV or Green Button XML file under 8 MB.");
  const prepared = await prepareFieldFiles(
    record,
    "interval",
    [file],
    "Customer electricity upload; automatically analyzed, not user verified. Timestamps without offsets use America/New_York.",
  );
  const source = {
    ...Object.values(prepared.sources)[0],
    documentFolder: "additional-files" as const,
  };
  let energy: EnergyImport | null = null;
  let error = "";
  try {
    const parsed = parseEnergy(
      await file.text(),
      file.name,
      "America/New_York",
    );
    if (parsed.blocking)
      throw Error(
        "Conflicting or overlapping readings need correction before autofill.",
      );
    energy = {
      ...parsed,
      id: source.fileHash!,
      siteKey: record.siteKey,
      sourceKey: source.key,
      fileHash: source.fileHash!,
      fileName: file.name,
      acceptedAt: new Date().toISOString(),
      classification: parsed.synthetic
        ? "Modeled / synthetic"
        : "Customer supplied",
    };
  } catch (cause) {
    error =
      cause instanceof Error
        ? cause.message
        : "Could not read electricity data.";
  }
  return { source, bytes: prepared.bytes, energy, error };
}
