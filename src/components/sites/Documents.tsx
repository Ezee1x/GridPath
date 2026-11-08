"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Folder,
  ArrowLeft,
  Upload,
  Image as ImageIcon,
  FileText,
  Download,
} from "lucide-react";
import type { SiteRecord } from "@/lib/types";
import type { EvidenceReference } from "@/lib/intake/types";
import { useSavedEngineeringRecord } from "@/components/intake/useEngineeringRecord";
import { prepareFieldFiles, FILE_ACCEPT } from "@/lib/intake/file-evidence";
import { folderSources, type DocumentFolder } from "@/lib/documents/folders";
import { saveAnnotatedImage } from "@/lib/documents/map-images";
import { loadAnalysisImage } from "@/lib/annotations/images";
import type { SiteAnalysis } from "@/lib/annotations/types";
const folders = [
  {
    id: "map-images",
    name: "Map images",
    description: "GIS layer, contour and annotated layer",
    icon: ImageIcon,
  },
  {
    id: "additional-files",
    name: "Additional files",
    description: "Customer data, utility bills and supporting documents",
    icon: FileText,
  },
  {
    id: "site-photos",
    name: "Site photos",
    description: "Site, equipment and field photos",
    icon: ImageIcon,
  },
] as const;
export const categories = folders.map((folder) => folder.name);
function FileTile({
  source,
  file,
  analysis,
}: {
  source?: EvidenceReference;
  file?: File;
  analysis?: SiteAnalysis;
}) {
  const [url, setUrl] = useState("");
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let created = "";
    (async () => {
      const blob =
        file ?? (analysis ? await loadAnalysisImage(analysis.id) : undefined);
      if (cancelled) return;
      if (!blob) {
        setMissing(true);
        return;
      }
      created = URL.createObjectURL(blob);
      setUrl(created);
      setMissing(false);
    })().catch(() => !cancelled && setMissing(true));
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [file, analysis?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const name = source?.fileName ?? analysis?.image.fileName ?? "Saved file";
  const photo =
    /\.(png|jpe?g|webp)$/i.test(name) || file?.type.startsWith("image/");
  return (
    <article className="document-file">
      {url && photo ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${name}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- persisted local file preview */}
          <img src={url} alt={name} />
        </a>
      ) : (
        <FileText size={28} aria-hidden="true" />
      )}
      <strong>{name}</strong>
      <small>
        {source?.retrievedAt?.slice(0, 10) ?? analysis?.createdAt.slice(0, 10)}
      </small>
      {url ? (
        <a href={url} download={name} className="text-link">
          <Download size={15} /> Download
        </a>
      ) : (
        <small>
          {missing
            ? "File reference saved; original bytes unavailable in this browser."
            : "Restoring file…"}
        </small>
      )}
      {source?.matchingMethod && (
        <details>
          <summary>Source & method</summary>
          <p>{source.matchingMethod}</p>
        </details>
      )}
    </article>
  );
}
export function Documents({ site }: { site: SiteRecord }) {
  const { record, update, files, warning } = useSavedEngineeringRecord(site);
  const [folder, setFolder] = useState<DocumentFolder | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const additionalInput = useRef<HTMLInputElement>(null);
  const mapFiles = folderSources(record.sources, "map-images");
  const photos = (site.annotatedImages ?? []).filter(
    (a) => a.image.source === "upload",
  );
  const aerial = (site.annotatedImages ?? []).find(
    (a) => a.image.source === "aerial" && a.image.aerial,
  );
  const activeFolder = folders.find((f) => f.id === folder);
  const list = folder ? folderSources(record.sources, folder) : [];
  async function upload(
    selected: FileList | null,
    target: DocumentFolder | null = folder,
  ) {
    if (!selected?.length || !target || target === "map-images") return;
    const chosen = Array.from(selected);
    setBusy(true);
    setMessage("");
    try {
      const prepared = await prepareFieldFiles(
        record,
        "facilityName",
        chosen,
        `User uploaded to ${target === "site-photos" ? "Site photos" : "Additional files"}; not assigned to an engineering field or verified.`,
      );
      for (const [key, file] of prepared.bytes) files.set(key, file);
      const sources = Object.fromEntries(
        Object.entries(prepared.sources).map(([key, source]) => [
          key,
          { ...source, documentFolder: target },
        ]),
      );
      update((latest) => ({
        ...latest,
        updatedAt: new Date().toISOString(),
        sources: { ...latest.sources, ...sources },
      }));
      setMessage(
        `${chosen.length} file${chosen.length === 1 ? "" : "s"} saved to this site.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Files could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="site-document-library" aria-label="Site documents">
      {warning && <p role="status">{warning}</p>}
      {!folder && (
        <div className="document-library-actions">
          <button
            type="button"
            className="button secondary small"
            disabled={busy}
            onClick={() => additionalInput.current?.click()}
          >
            <Upload size={15} aria-hidden="true" /> Attach additional documents
          </button>
          <input
            ref={additionalInput}
            type="file"
            hidden
            multiple
            accept={FILE_ACCEPT}
            aria-label="Attach additional documents"
            onChange={(event) => {
              void upload(event.target.files, "additional-files");
              event.currentTarget.value = "";
            }}
          />
        </div>
      )}
      {!folder && message && <p role="status">{message}</p>}
      {!folder ? (
        <div className="document-folders">
          {folders.map(({ id, name, description, icon: Icon }) => {
            const count =
              folderSources(record.sources, id).length +
              (id === "site-photos" ? photos.length : 0);
            return (
              <button
                className="document-folder"
                key={id}
                onClick={() => {
                  setFolder(id);
                  setMessage("");
                }}
              >
                <Folder size={42} aria-hidden="true" />
                <strong>{name}</strong>
                <span>{description}</span>
                <small>
                  <Icon size={14} aria-hidden="true" /> {count} saved{" "}
                  {count === 1 ? "file" : "files"}
                </small>
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <div className="document-folder-header">
            <button
              className="text-link"
              onClick={() => {
                setFolder(null);
                setMessage("");
              }}
            >
              <ArrowLeft size={16} /> All folders
            </button>
            <h2>{activeFolder?.name}</h2>
          </div>
          {folder !== "map-images" && (
            <label className="document-upload">
              <Upload size={18} />
              {folder === "site-photos" ? "Add site photos" : "Add files"}
              <input
                aria-label={
                  folder === "site-photos"
                    ? "Upload site photos"
                    : "Upload additional files"
                }
                type="file"
                multiple
                disabled={busy}
                accept={
                  folder === "site-photos"
                    ? ".png,.jpg,.jpeg,.webp"
                    : FILE_ACCEPT
                }
                onChange={(event) => {
                  void upload(event.target.files);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          )}
          {folder === "map-images" && (
            <>
              <p>
                Saved views for this site. Open the site map to refresh GIS and
                contour images.
              </p>
              <Link className="text-link" href={`/sites/${site.id}`}>
                Open site map ↗
              </Link>
              <div className="document-missing-views">
                {(
                  [
                    ["gis", "GIS layer"],
                    ["contour", "Contour"],
                    ["annotated", "Annotated layer"],
                  ] as const
                )
                  .filter(
                    ([kind]) => !mapFiles.some((s) => s.mapImageKind === kind),
                  )
                  .map(([kind, label]) => (
                    <div key={kind}>
                      <strong>{label}</strong>
                      <small>
                        {kind === "annotated"
                          ? "Not saved yet — open the Annotated Layer to generate it."
                          : "Not saved yet — load this view on the site map."}
                      </small>
                    </div>
                  ))}
              </div>
              {aerial && (
                <button
                  className="text-link"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await saveAnnotatedImage(site, aerial);
                      setMessage("Annotated layer image saved.");
                    } catch (error) {
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : "Image could not be saved.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Save latest annotated image
                </button>
              )}
            </>
          )}
          {message && <p role="status">{message}</p>}
          <div className="document-file-grid">
            {list.map((source) => (
              <FileTile
                key={source.key}
                source={source}
                file={files.get(source.key)}
              />
            ))}
            {folder === "site-photos" &&
              photos.map((analysis) => (
                <FileTile key={analysis.id} analysis={analysis} />
              ))}
          </div>
          {!list.length &&
            !(folder === "site-photos" && photos.length) &&
            folder !== "map-images" && <p>No files in this folder yet.</p>}
        </>
      )}
    </section>
  );
}
