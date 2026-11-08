"use client";
import { SiteFiles, FileAttachmentDialog, fieldFileKeys } from "./SiteFiles";
import Link from "next/link";
import { useState } from "react";
import { PRIORITIES } from "@/lib/intake/schema";
import { verificationItems, type FieldView } from "@/lib/intake/verification";
import { updateRequest } from "@/lib/intake/model";
import type { IntakeRecord, RequestStatus } from "@/lib/intake/types";
export function VerificationQueue({
  record,
  files,
  update,
  onEvidence,
  siteId,
  view = "verification",
}: {
  record: IntakeRecord;
  files: Map<string, File>;
  update: (fn: (r: IntakeRecord) => IntakeRecord) => void;
  onEvidence?: (id: string) => void;
  siteId?: string;
  view?: FieldView;
}) {
  const [uploadField, setUploadField] = useState<string | null>(null);
  const [priority, setPriority] = useState("All priorities"),
    [status, setStatus] = useState("All statuses"),
    [error, setError] = useState("");
  const items = verificationItems(record).filter(
    (item) =>
      (priority === "All priorities" || item.priority === priority) &&
      (status === "All statuses" || item.field.request.status === status) &&
      (view !== "missing" ||
        item.reasons.includes("Missing or incomplete value")) &&
      (view !== "conflicts" ||
        item.reasons.includes("Conflicting source records")),
  );
  return (
    <section className="missing-intake" aria-label="Field verification queue">
      <p>
        These actions come from the Full Site Record. Evidence received is not
        engineering verification.
      </p>
      <SiteFiles record={record} onAdd={setUploadField} />
      <div className="table-controls">
        <label>
          Priority
          <select
            aria-label="Filter requirement priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            {["All priorities", ...PRIORITIES].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Collection status
          <select
            aria-label="Filter collection status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {[
              "All statuses",
              "Missing",
              "Requested",
              "Received",
              "Under review",
              "Verified",
            ].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <span>{items.length} field actions</span>
      </div>
      {error && <p role="alert">{error}</p>}
      {items.map(({ id, definition, field, priority, reasons }) => (
        <details key={id} className="requirement">
          <summary>
            <span>
              {siteId ? (
                <Link href={`/sites/${siteId}?field=${encodeURIComponent(id)}`}>
                  {definition.label}
                </Link>
              ) : (
                <button
                  className="text-link"
                  onClick={(e) => {
                    e.preventDefault();
                    onEvidence?.(id);
                  }}
                >
                  {definition.label}
                </button>
              )}
            </span>
            <span className="queue-file-actions">
              <span>
                {priority} · {field.request.status}
              </span>
              <button
                type="button"
                className="text-link"
                aria-label={`Add file for ${definition.label}`}
                onClick={(e) => {
                  e.preventDefault();
                  setUploadField(id);
                }}
              >
                Add file
                {fieldFileKeys(record, id).length > 0
                  ? ` · ${fieldFileKeys(record, id).length} attached`
                  : ""}
              </button>
            </span>
          </summary>
          <p>{reasons.join(" · ")}</p>
          {record.electricalDiscovery?.fieldResults[id] && (
            <p>
              {record.electricalDiscovery.fieldResults[id].statuses.join(" · ")}
              <br />
              {record.electricalDiscovery.fieldResults[id].reason}
            </p>
          )}
          <p>{definition.reason}</p>
          <p>Suggested evidence: {definition.suggestedEvidence}</p>
          <div className="request-editor">
            <label>
              Responsible party
              <input
                aria-label={`Owner for ${definition.label}`}
                value={field.request.owner}
                onChange={(e) =>
                  update((r) =>
                    updateRequest(
                      r,
                      id,
                      field.request.status,
                      e.target.value,
                      field.request.notes,
                    ),
                  )
                }
              />
            </label>
            <label>
              Request status
              <select
                aria-label={`Request status for ${definition.label}`}
                value={field.request.status}
                onChange={(e) => {
                  try {
                    update((r) =>
                      updateRequest(
                        r,
                        id,
                        e.target.value as RequestStatus,
                        field.request.owner,
                        field.request.notes,
                      ),
                    );
                    setError("");
                  } catch (error) {
                    setError((error as Error).message);
                  }
                }}
              >
                {[
                  "Missing",
                  "Requested",
                  "Received",
                  "Under review",
                  "Verified",
                ].map((s) => (
                  <option
                    key={s}
                    disabled={
                      s === "Verified" &&
                      field.review.status !== "Engineer verified"
                    }
                  >
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select
                aria-label={`Priority for ${definition.label}`}
                value={priority}
                onChange={(e) => {
                  const value = e.target.value as typeof priority;
                  update((r) => ({
                    ...r,
                    updatedAt: new Date().toISOString(),
                    fields: r.fields.map((f) =>
                      f.id === id ? { ...f, priority: value } : f,
                    ),
                  }));
                }}
              >
                {PRIORITIES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              Notes
              <textarea
                aria-label={`Notes for ${definition.label}`}
                value={field.request.notes}
                onChange={(e) =>
                  update((r) =>
                    updateRequest(
                      r,
                      id,
                      field.request.status,
                      field.request.owner,
                      e.target.value,
                    ),
                  )
                }
              />
            </label>
          </div>
          <p>Review: {field.review.status}</p>
          {siteId ? (
            <Link
              className="text-link"
              href={`/sites/${siteId}?field=${encodeURIComponent(id)}`}
            >
              Open field, evidence & review
            </Link>
          ) : (
            <button className="text-link" onClick={() => onEvidence?.(id)}>
              Open field, evidence & review
            </button>
          )}
        </details>
      ))}
      {uploadField && (
        <FileAttachmentDialog
          key={`${record.siteKey}:${uploadField}`}
          record={record}
          fieldId={uploadField}
          files={files}
          update={update}
          onClose={() => setUploadField(null)}
        />
      )}
      {!items.length && <p>No field actions match these filters.</p>}
    </section>
  );
}
