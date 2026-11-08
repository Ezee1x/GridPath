"use client";
import { useEffect, useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import {
  CATEGORIES,
  FIELD_SCHEMA,
  type FieldDefinition,
} from "@/lib/intake/schema";
import { attachFieldEvidence } from "@/lib/intake/model";
import { FILE_ACCEPT, prepareFieldFiles } from "@/lib/intake/file-evidence";
import type { IntakeRecord } from "@/lib/intake/types";

export function fieldFileKeys(record: IntakeRecord, fieldId: string) {
  const field = record.fields.find((f) => f.id === fieldId);
  return [
    ...new Set([
      ...(field?.evidenceKeys ?? []),
      ...(field?.observations.flatMap((o) => o.sourceKeys) ?? []),
    ]),
  ].filter((key) => !!record.sources[key]?.fileName);
}

export function SiteFiles({
  record,
  onAdd,
  fields = FIELD_SCHEMA,
}: {
  record: IntakeRecord;
  onAdd: (fieldId: string) => void;
  fields?: FieldDefinition[];
}) {
  const [fieldId, setFieldId] = useState("singleLine");
  const count = Object.values(record.sources).filter((s) => s.fileName).length;
  return (
    <section className="site-files" aria-label="Site files">
      <div>
        <h2>
          <Paperclip size={18} aria-hidden="true" /> Add files
        </h2>
        <p>
          Attach drawings, utility bills, photos and supporting documents to a
          field in this site record.
        </p>
      </div>
      <div className="site-files-controls">
        <label>
          Site record field
          <select
            aria-label="File target field"
            value={fieldId}
            onChange={(e) => setFieldId(e.target.value)}
          >
            {CATEGORIES.filter((category) =>
              fields.some((d) => d.category === category.id),
            ).map((category) => (
              <optgroup key={category.id} label={category.label}>
                {FIELD_SCHEMA.filter((d) => d.category === category.id).map(
                  (d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ),
                )}
              </optgroup>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button secondary"
          onClick={() => onAdd(fieldId)}
        >
          <Paperclip size={15} aria-hidden="true" /> Add files
        </button>
      </div>
      <small>
        {count} attached {count === 1 ? "file reference" : "file references"} ·
        Evidence received requires review.
      </small>
    </section>
  );
}

export function FileAttachmentDialog({
  record,
  fieldId,
  files,
  update,
  onClose,
}: {
  record: IntakeRecord;
  fieldId: string;
  files: Map<string, File>;
  update: (fn: (r: IntakeRecord) => IntakeRecord) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const definition = FIELD_SCHEMA.find((d) => d.id === fieldId)!;
  const keys = fieldFileKeys(record, fieldId);
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  async function attach() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const prepared = await prepareFieldFiles(record, fieldId, chosen, note);
      for (const [key, file] of prepared.bytes) files.set(key, file);
      update((current) => {
        const existing = current.fields.find((f) => f.id === fieldId)!;
        const added = Object.fromEntries(
          Object.entries(prepared.sources).filter(
            ([key]) => !existing.evidenceKeys?.includes(key),
          ),
        );
        return Object.keys(added).length
          ? attachFieldEvidence(current, fieldId, added)
          : current;
      });
      setMessage(
        `${prepared.bytes.size} ${prepared.bytes.size === 1 ? "file attached" : "files attached"} to ${definition.label}. Ready for review.`,
      );
      setChosen([]);
      setNote("");
      if (input.current) input.current.value = "";
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Files could not be attached. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="evidence-dialog intake-evidence file-attachment-dialog"
      aria-label={`Add files for ${definition.label}`}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
      onClick={(e) => {
        if (!busy && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="intake-dialog-heading">
        <h2>Add files</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close file attachments"
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <p>
        <strong>{definition.label}</strong>
        <br />
        {record.identity.address}
      </p>
      <p>Suggested evidence: {definition.suggestedEvidence}</p>
      <form
        className="intake-form"
        onSubmit={(e) => {
          e.preventDefault();
          void attach();
        }}
      >
        <label>
          Choose files
          <input
            ref={input}
            type="file"
            aria-label="Choose supporting files"
            accept={FILE_ACCEPT}
            multiple
            disabled={busy}
            onChange={(e) => {
              setChosen(Array.from(e.target.files ?? []));
              setError("");
              setMessage("");
            }}
          />
        </label>
        <small>
          PDF, images, CSV, Excel, Word, text, JSON, DWG or DXF. Up to 10 files,
          25 MB each.
        </small>
        {chosen.length > 0 && (
          <ul>
            {chosen.map((f, i) => (
              <li key={`${f.name}:${i}`}>
                {f.name} · {(f.size / 1024).toFixed(1)} KB
              </li>
            ))}
          </ul>
        )}
        <label>
          File notes (optional)
          <textarea
            aria-label="File notes"
            value={note}
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Document context or what the reviewer should check"
          />
        </label>
        <button
          type="submit"
          className="button"
          disabled={busy || !chosen.length}
        >
          {busy ? "Attaching…" : "Attach files"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <p className="muted">
        File references and notes are saved with this site. File contents remain
        available in this browser session; re-add the same files after refresh.
        No values are extracted or automatically verified.
      </p>
      <section aria-label="Attached files">
        <h3>Attached files ({keys.length})</h3>
        {!keys.length && <p>No files attached to this field yet.</p>}
        {keys.map((key) => {
          const source = record.sources[key];
          const file = files.get(key);
          return (
            <div className="field-file" key={key}>
              <strong>{source.fileName}</strong>
              <small>
                Added{" "}
                {source.retrievedAt
                  ? new Date(source.retrievedAt).toLocaleDateString()
                  : "date unavailable"}{" "}
                · {source.provider}
              </small>
              <small>{source.matchingMethod}</small>
              {file ? (
                <button
                  type="button"
                  className="text-link"
                  onClick={() => {
                    const url = URL.createObjectURL(file);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = file.name;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  Download {source.fileName}
                </button>
              ) : (
                <small>
                  Reference saved. Re-add this file to access its contents.
                </small>
              )}
            </div>
          );
        })}
      </section>
    </dialog>
  );
}
