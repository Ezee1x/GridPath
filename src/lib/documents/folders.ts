import type { EvidenceReference } from "../intake/types";
export type DocumentFolder = "map-images" | "additional-files" | "site-photos";
function legacyMapKind(
  source: EvidenceReference,
): EvidenceReference["mapImageKind"] {
  if (source.provider !== "Saved site map") return undefined;
  const name = source.fileName?.toLowerCase();
  return name === "qoresites_gis_layer.png"
    ? "gis"
    : name === "qoresites_contour.png"
      ? "contour"
      : name === "qoresites_annotated_layer.png"
        ? "annotated"
        : undefined;
}
export function documentFolder(source: EvidenceReference): DocumentFolder {
  if (source.documentFolder) return source.documentFolder;
  if (legacyMapKind(source)) return "map-images";
  return /\.(png|jpe?g|webp|heic)$/i.test(source.fileName ?? "")
    ? "site-photos"
    : "additional-files";
}
export function folderSources(
  sources: Record<string, EvidenceReference>,
  folder: DocumentFolder,
) {
  const matching = Object.values(sources).filter(
    (s) => s.fileName && documentFolder(s) === folder,
  );
  if (folder !== "map-images") {
    // A single attachment can support several engineering fields.
    return [
      ...new Map(
        matching.map((source) => [source.fileHash ?? source.key, source]),
      ).values(),
    ];
  }
  // Keep prior image references for exports/history; show the latest of each view.
  const latest = new Map<string, EvidenceReference>();
  for (const source of matching) {
    const inferred = source.mapImageKind ?? legacyMapKind(source);
    const kind = inferred ?? source.key;
    if (
      !latest.has(kind) ||
      (source.retrievedAt ?? "") > (latest.get(kind)!.retrievedAt ?? "")
    )
      latest.set(
        kind,
        inferred ? { ...source, mapImageKind: inferred } : source,
      );
  }
  return [...latest.values()];
}
