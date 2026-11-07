"use client";
import { useRef, useState } from "react";
import { UploadCloud, FileText, ChevronDown } from "lucide-react";
import { SiteRecord, SourceDocument } from "@/lib/types";
import { useWorkspace } from "@/lib/store";
import { dateLabel } from "@/lib/calculations";
import { Badge, Empty } from "@/components/ui";
import { SourceCard } from "./Evidence";
export const categories = [
  "Site maps",
  "Property records",
  "Electrical drawings",
  "Equipment nameplates",
  "Revenue meter photos",
  "Transformer photos",
  "Utility bills",
  "Interval load data",
  "Permits and supporting documents",
];
export function Documents({ site }: { site: SiteRecord }) {
  const { save, stage } = useWorkspace();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [category, setCategory] = useState(categories[0]);
  function add(list: FileList | null) {
    if (!list) return;
    const valid: SourceDocument[] = [];
    const errors: string[] = [];
    for (const file of Array.from(list)) {
      if (!/\.(pdf|jpe?g|png|csv)$/i.test(file.name)) {
        errors.push(`${file.name}: use PDF, JPG, PNG or CSV.`);
        continue;
      }
      if (file.size > 25 * 1024 * 1024 || file.size === 0) {
        errors.push(`${file.name}: files must be nonempty and at most 25 MB.`);
        continue;
      }
      const existing = site.sourceDocuments.find(
        (d) => d.localFile && d.fileName === file.name,
      );
      const id = existing?.id ?? crypto.randomUUID();
      stage(id, file);
      valid.push({
        id,
        title: file.name,
        type: category,
        fileName: file.name,
        url: null,
        uploadedAt: new Date().toISOString(),
        retrievedAt: null,
        referencePage: null,
        sourceAuthority:
          "Locally staged customer document; contents not extracted or verified",
        size: file.size,
        localFile: true,
      });
    }
    if (valid.length) {
      save({
        ...site,
        sourceDocuments: [
          ...site.sourceDocuments.filter(
            (d) => !valid.some((v) => v.id === d.id),
          ),
          ...valid,
        ],
      });
      setMessage(
        `${valid.length} document${valid.length === 1 ? "" : "s"} added. Automated extraction is not yet connected.`,
      );
    }
    setError(errors.join(" "));
    if (input.current) input.current.value = "";
  }
  return (
    <>
      <section className="card">
        <div className="card-heading">
          <div>
            <h2>Documents & evidence</h2>
            <p>
              Keep the original source alongside every engineering decision.
            </p>
          </div>
          <Badge>Local staging</Badge>
        </div>
        <div className="upload-options">
          <label>
            Document category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <span>
            File metadata persists. File contents stay in this browser session.
          </span>
        </div>
        <div
          className={`dropzone ${drag ? "dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            add(e.dataTransfer.files);
          }}
        >
          <UploadCloud size={29} />
          <h3>Drop your site documents here</h3>
          <p>PDF, JPG, PNG or CSV · up to 25 MB per file</p>
          <button
            className="button secondary"
            onClick={() => input.current?.click()}
          >
            Browse files
          </button>
          <input
            ref={input}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.csv"
            multiple
            className="sr-only"
            aria-label="Upload site documents"
            onChange={(e) => add(e.target.files)}
          />
        </div>
        {message && (
          <p role="status" className="notice success-notice">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="notice amber-notice">
            {error}
          </p>
        )}
        <div className="document-list">
          {site.sourceDocuments.map((doc) => (
            <div key={doc.id}>
              <div className="document-row">
                <FileText size={20} />
                <button
                  className="document-name"
                  onClick={() =>
                    setSelected(selected === doc.id ? null : doc.id)
                  }
                >
                  <b>{doc.title}</b>
                  <small>
                    {doc.size === null
                      ? "Reference only"
                      : doc.size < 1024
                        ? `${doc.size} bytes`
                        : `${(doc.size / 1024).toFixed(1)} KB`}{" "}
                    · {dateLabel(doc.uploadedAt)}
                  </small>
                </button>
                <select
                  aria-label={`Category for ${doc.title}`}
                  value={doc.type}
                  onChange={(e) =>
                    save({
                      ...site,
                      sourceDocuments: site.sourceDocuments.map((d) =>
                        d.id === doc.id ? { ...d, type: e.target.value } : d,
                      ),
                    })
                  }
                >
                  {[...new Set([...categories, doc.type])].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <button
                  className="icon-button"
                  aria-label={`Inspect ${doc.title}`}
                  onClick={() =>
                    setSelected(selected === doc.id ? null : doc.id)
                  }
                >
                  <ChevronDown size={17} />
                </button>
              </div>
              {selected === doc.id && <SourceCard document={doc} />}
            </div>
          ))}
          {!site.sourceDocuments.length && (
            <Empty title="No documents yet">
              Add the records your engineering team needs.
            </Empty>
          )}
        </div>
      </section>
    </>
  );
}
