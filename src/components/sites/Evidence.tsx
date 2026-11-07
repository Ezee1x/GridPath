"use client";
import { useEffect, useRef } from "react";
import { FileText, X, ExternalLink, Info } from "lucide-react";
import { SiteField, SiteRecord, SourceDocument } from "@/lib/types";
import { Status, Badge } from "@/components/ui";
import { dateLabel } from "@/lib/calculations";
import { useWorkspace } from "@/lib/store";
export function FieldRows({
  fields,
  onSource,
}: {
  fields: SiteField[];
  onSource: (field: SiteField) => void;
}) {
  return (
    <div>
      {fields.map((field) => (
        <button
          className="field-row"
          key={field.id}
          onClick={() => onSource(field)}
          aria-label={`Inspect evidence for ${field.label}`}
        >
          <span className="field-label">
            {field.label}
            {field.required && <span title="Required field"> *</span>}
          </span>
          <span
            className={`field-value ${field.value === null ? "unknown" : ""}`}
          >
            {field.value ?? "Unknown"}
            {field.unit && ` ${field.unit}`}
          </span>
          <span className="field-source">
            <Status value={field.status} />
            <FileText size={15} />
          </span>
        </button>
      ))}
    </div>
  );
}
export function SourceCard({ document }: { document: SourceDocument }) {
  const { files } = useWorkspace();
  const file = files[document.id];
  function inspect() {
    if (file) {
      const url = URL.createObjectURL(file);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  }
  return (
    <div className="source-card">
      <FileText size={20} />
      <div>
        <b>{document.title}</b>
        <p>{document.sourceAuthority}</p>
        <dl>
          <dt>Category</dt>
          <dd>{document.type}</dd>
          <dt>Reference</dt>
          <dd>{document.referencePage ?? "No page identifier supplied"}</dd>
          <dt>Retrieved</dt>
          <dd>
            {document.retrievedAt
              ? dateLabel(document.retrievedAt)
              : "Not automatically retrieved"}
          </dd>
          <dt>Added to record</dt>
          <dd>{dateLabel(document.uploadedAt)}</dd>
        </dl>
        {file ? (
          <button className="button secondary small" onClick={inspect}>
            Inspect staged file
            <ExternalLink size={14} />
          </button>
        ) : document.url ? (
          <a
            className="text-link"
            href={document.url}
            target="_blank"
            rel="noreferrer"
          >
            Open source
            <ExternalLink size={14} />
          </a>
        ) : (
          <p className="source-unavailable">
            {document.localFile
              ? "File metadata saved. Re-add the file to inspect it after a refresh."
              : document.type === "User input"
                ? "User-entered information; no supporting file."
                : "Original source file is not bundled. Reference supplied in the project brief; not independently inspected."}
          </p>
        )}
      </div>
    </div>
  );
}
export function EvidenceDrawer({
  field,
  site,
  onClose,
}: {
  field: SiteField;
  site: SiteRecord;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    const el = dialog.current;
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="evidence-dialog"
      aria-labelledby="evidence-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="drawer-header">
        <span className="drawer-context">Source evidence</span>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close evidence details"
        >
          <X size={20} />
        </button>
      </div>
      <h2 id="evidence-title">{field.label}</h2>
      <div className="evidence-value">
        {field.value ?? "Unknown"} {field.unit}
      </div>
      <div className="badge-row">
        <Status value={field.status} />
        <Badge>{field.conditionType} condition</Badge>
      </div>
      <dl className="evidence-meta">
        <dt>Field ID</dt>
        <dd>{field.id}</dd>
        <dt>Category</dt>
        <dd>{field.category}</dd>
        <dt>Source confidence</dt>
        <dd>{field.confidence}</dd>
        <dt>Human review</dt>
        <dd>
          {field.reviewedBy
            ? `${field.reviewedBy} · ${dateLabel(field.reviewedAt!)}`
            : "Not engineer verified"}
        </dd>
        <dt>Required</dt>
        <dd>{field.required ? "Yes" : "No"}</dd>
      </dl>
      {field.notes && (
        <div className="notice">
          <Info size={16} />
          <span>{field.notes}</span>
        </div>
      )}
      <h3>Supporting evidence</h3>
      {field.sourceIds.length ? (
        field.sourceIds.map((id) => {
          const doc = site.sourceDocuments.find((d) => d.id === id);
          return doc ? (
            <SourceCard key={id} document={doc} />
          ) : (
            <p key={id}>Source {id} is unavailable.</p>
          );
        })
      ) : (
        <div className="empty">
          No supporting evidence yet.
          <p>
            Obtain an original document or a field confirmation before verifying
            this field.
          </p>
        </div>
      )}
      <p className="muted small-text">
        Source-backed means a reference is cited. It does not mean an engineer
        has verified the value.
      </p>
    </dialog>
  );
}
