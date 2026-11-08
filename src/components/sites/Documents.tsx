"use client";
import { useState } from "react";
import type { SiteRecord } from "@/lib/types";
import { FIELD_SCHEMA } from "@/lib/intake/schema";
import { useSavedEngineeringRecord } from "@/components/intake/useEngineeringRecord";
import { FieldEvidence } from "@/components/intake/FieldEvidence";
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
  const { record, update, files, warning } = useSavedEngineeringRecord(site);
  const [selected, setSelected] = useState("singleLine"),
    [open, setOpen] = useState<string | null>(null);
  const documents = Object.values(record.sources).filter(
    (s) => s.fileName || s.documentId,
  );
  return (
    <section className="documents">
      <p>
        Every file and source reference on this site, with the fields it
        supports. Receiving a file never verifies its contents.
      </p>
      {warning && <p role="status">{warning}</p>}
      <div className="button-row">
        <label>
          Site record field
          <select
            aria-label="Document target field"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {FIELD_SCHEMA.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <button className="button" onClick={() => setOpen(selected)}>
          Attach or review field evidence
        </button>
      </div>
      {documents.map((source) => (
        <section className="analysis-source" key={source.key}>
          <strong>{source.dataset}</strong>
          <p>
            {source.provider} · {source.fileName ?? source.documentId}
          </p>
          <p>
            {files.has(source.key)
              ? "File stored in this browser"
              : "Reference saved. Re-add the file to open it here."}
          </p>
          {source.serviceUrl && (
            <a href={source.serviceUrl} target="_blank" rel="noreferrer">
              Open source ↗
            </a>
          )}
          <p>
            Referenced by:{" "}
            {record.fields
              .filter(
                (f) =>
                  f.evidenceKeys?.includes(source.key) ||
                  f.observations.some((o) => o.sourceKeys.includes(source.key)),
              )
              .map((f) => FIELD_SCHEMA.find((d) => d.id === f.id)?.label)
              .join(" · ") ||
              "Legacy site evidence — not yet assigned to a field"}
          </p>
        </section>
      ))}
      {!documents.length && <p>No supporting documents attached yet.</p>}
      {open && (
        <FieldEvidence
          key={open}
          record={record}
          fieldId={open}
          update={update}
          files={files}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
