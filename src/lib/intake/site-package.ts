import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import type { SiteRecord } from "../types";
import type { IntakeRecord } from "./types";
import { engineeringExport } from "../engineering/coverage";
import { portableIntake } from "./portable";
import { loadIntake, INTAKE_STORAGE } from "./model";
import { sha256 } from "./file-vault";
import { BRAND } from "../brand";
interface Asset {
  key: string;
  path: string;
  hash: string;
  name: string;
  type: string;
  size: number;
  kind: "evidence" | "annotation";
  analysisId?: string;
}
export interface SitePackageManifest {
  application?: string;
  format: "qore-site-package";
  version: 1;
  exportedAt: string;
  site: SiteRecord;
  record: IntakeRecord;
  assets: Asset[];
  missing: string[];
  omitted: string[];
  engineering?: ReturnType<typeof engineeringExport>;
}
const LIMIT = 250 * 1024 * 1024;
export async function makeSitePackage(
  site: SiteRecord,
  record: IntakeRecord,
  files: Map<string, File>,
  image: (id: string) => Promise<Blob | undefined>,
) {
  const entries: Record<string, Uint8Array> = {},
    assets: Asset[] = [],
    missing: string[] = [],
    omitted: string[] = [];
  let total = 0;
  async function add(
    blob: Blob,
    key: string,
    name: string,
    kind: Asset["kind"],
    analysisId?: string,
  ) {
    if (blob.size > 50 * 1024 * 1024 || (total += blob.size) > LIMIT)
      throw Error("Package exceeds the 250 MB handoff limit (50 MB per file).");
    const hash = await sha256(blob),
      path = `files/${hash}`;
    entries[path] = new Uint8Array(await blob.arrayBuffer());
    assets.push({
      key,
      path,
      hash,
      name,
      type: blob.type,
      size: blob.size,
      kind,
      analysisId,
    });
  }
  const portable = portableIntake(record);
  for (const [key, source] of Object.entries(portable.sources)) {
    if (!source.fileName) continue;
    const file = files.get(key);
    if (!file) {
      missing.push(source.fileName);
      continue;
    }
    if (source.fileHash && (await sha256(file)) !== source.fileHash)
      throw Error(`File hash mismatch: ${source.fileName}`);
    if (!key.startsWith(`input:${record.siteKey}:`)) {
      missing.push(
        `${source.fileName} (legacy reference requires reattachment)`,
      );
      continue;
    }
    portable.sources[key] = { ...source, fileHash: await sha256(file) };
    await add(file, key, source.fileName, "evidence");
  }
  const analyses = [] as NonNullable<SiteRecord["annotatedImages"]>;
  for (const analysis of site.annotatedImages ?? []) {
    if (analysis.image.source === "street-view") {
      omitted.push(
        `Street View asset ${analysis.id}: external imagery export is not enabled.`,
      );
      continue;
    }
    analyses.push(analysis);
    const blob = await image(analysis.id);
    if (blob)
      await add(
        blob,
        `image:${record.siteKey}:${analysis.id}`,
        analysis.image.fileName,
        "annotation",
        analysis.id,
      );
    else missing.push(analysis.image.fileName);
  }
  const manifest: SitePackageManifest = {
    application: BRAND.name,
    engineering: engineeringExport(portable),
    format: "qore-site-package",
    version: 1,
    exportedAt: new Date().toISOString(),
    site: { ...site, annotatedImages: analyses },
    record: portable,
    assets,
    missing,
    omitted,
  };
  entries["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  if (
    entries["manifest.json"].length > 8_000_000 ||
    total + entries["manifest.json"].length > LIMIT
  )
    throw Error("Package manifest or total contents exceed handoff limits.");
  return {
    blob: new Blob([zipSync(entries, { level: 1 })], {
      type: "application/zip",
    }),
    manifest,
  };
}
export async function readSitePackage(file: Blob) {
  if (file.size > LIMIT + 8 * 1024 * 1024)
    throw Error("Compressed package exceeds the 258 MB limit.");
  let total = 0,
    count = 0;
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (entry) => {
      if (
        ++count > 300 ||
        entry.originalSize > 50 * 1024 * 1024 ||
        (total += entry.originalSize) > LIMIT ||
        (entry.name !== "manifest.json" &&
          !/^files\/[a-f0-9]{64}$/.test(entry.name))
      )
        throw Error(
          "Package contains invalid paths or exceeds extraction limits.",
        );
      return true;
    },
  });
  if (!entries["manifest.json"] || entries["manifest.json"].length > 8_000_000)
    throw Error("Package manifest is missing or too large.");
  const m = JSON.parse(
    strFromU8(entries["manifest.json"]),
  ) as SitePackageManifest;
  if (
    m.format !== "qore-site-package" ||
    m.version !== 1 ||
    !m.site?.id ||
    !m.record?.siteKey ||
    !Array.isArray(m.assets) ||
    m.assets.length > 250 ||
    !Array.isArray(m.record.fields)
  )
    throw Error("Unsupported site package.");
  const record = loadIntake(
    {
      getItem: (key) =>
        key === INTAKE_STORAGE + m.record.siteKey
          ? JSON.stringify(m.record)
          : null,
    },
    m.record.siteKey,
  )!;
  const expectedKey = JSON.stringify([
    m.site.mapPlaceId ?? `workspace:${m.site.id}`,
    m.site.parcelFeatureId ?? null,
  ]);
  if (expectedKey !== record.siteKey)
    throw Error("Site and engineering record identities disagree.");
  const assets: { meta: Asset; file: File }[] = [];
  const seen = new Set<string>();
  for (const a of m.assets) {
    if (seen.has(a.key)) throw Error("Duplicate asset reference.");
    seen.add(a.key);
    if (
      !/^files\/[a-f0-9]{64}$/.test(a.path) ||
      !entries[a.path] ||
      !a.name ||
      a.name.length > 240 ||
      a.size !== entries[a.path].length
    )
      throw Error("Invalid file reference.");
    const restored = new File([entries[a.path]], a.name, { type: a.type });
    if ((await sha256(restored)) !== a.hash)
      throw Error(`Integrity check failed for ${a.name}`);
    if (a.kind === "evidence") {
      if (
        !a.key.startsWith(`input:${record.siteKey}:`) ||
        record.sources[a.key]?.fileHash !== a.hash
      )
        throw Error("Document does not belong to this record.");
    } else if (
      a.kind !== "annotation" ||
      !m.site.annotatedImages?.some((x) => x.id === a.analysisId) ||
      a.key !== `image:${record.siteKey}:${a.analysisId}`
    )
      throw Error("Annotation image does not belong to this site.");
    assets.push({ meta: a, file: restored });
  }
  // Imported review claims are historical, not authenticated reviews in the receiving workspace.
  record.fields = record.fields.map((f) =>
    f.review.status !== "Engineer verified"
      ? f
      : {
          ...f,
          reviewHistory: [
            ...(f.reviewHistory ?? []),
            { observationId: f.selectedId, review: f.review },
          ],
          review: {
            status: "Under review",
            reviewer: null,
            at: null,
            note: "Imported review history retained; receiving workspace must confirm.",
          },
          request: { ...f.request, status: "Under review" },
        },
  );
  return { manifest: { ...m, record }, assets };
}
