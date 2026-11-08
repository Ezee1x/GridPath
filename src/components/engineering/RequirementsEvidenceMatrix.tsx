"use client";
import {
  MUNICIPAL_SOURCES,
  COMPARATIVE_CHECKLISTS,
} from "@/lib/engineering/municipal-directory";
import { useState } from "react";
import type { IntakeRecord } from "@/lib/intake/types";
import {
  requirementCoverage,
  informationRequest,
} from "@/lib/engineering/coverage";
import {
  ENGINEERING_REFERENCES,
  PLAN_REFERENCE_FILES,
} from "@/lib/engineering/library";
import { FIELD_SCHEMA } from "@/lib/intake/schema";
export function InformationRequest({ record }: { record: IntakeRecord }) {
  const [storedText, setText] = useState(""),
    [generatedFor, setGeneratedFor] = useState(record.siteKey),
    [message, setMessage] = useState("");
  const text = generatedFor === record.siteKey ? storedText : "";
  return (
    <details className="engineering-reference">
      <summary>Customer information request</summary>
      <button
        className="button secondary"
        onClick={() => {
          setGeneratedFor(record.siteKey);
          const request = informationRequest(record);
          setText(
            [
              `Site information request — ${request.address}`,
              `Generated ${request.generatedAt}`,
              ...request.items.map(
                (item, i) =>
                  `${i + 1}. ${item.request}\nReason: ${item.reason}\nOwner: ${item.owner} · ${item.priority}`,
              ),
              request.safety,
            ].join("\n\n"),
          );
        }}
      >
        Generate Information Request
      </button>
      {text && (
        <>
          <textarea
            aria-label="Customer-ready information request"
            value={text}
            readOnly
            rows={9}
          />
          <div className="button-row">
            <button
              className="text-link"
              onClick={() =>
                void navigator.clipboard
                  .writeText(text)
                  .then(() => setMessage("Checklist copied."))
                  .catch(() =>
                    setMessage("Select the checklist text to copy it."),
                  )
              }
            >
              Copy checklist
            </button>
            <button
              className="text-link"
              onClick={() =>
                downloadText(text, "qore-information-request.txt", "text/plain")
              }
            >
              Download checklist
            </button>
          </div>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
export function downloadText(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ApplicableEngineeringReferences({
  record,
}: {
  record: IntakeRecord;
}) {
  return (
    <details className="engineering-reference">
      <summary>Applicable Engineering References</summary>
      <p>
        Applicable requirements must be reviewed against final equipment
        selection and site design. Municipality identification does not confirm
        every AHJ.
      </p>
      <ul>
        {ENGINEERING_REFERENCES.map((r) => (
          <li key={r.id}>
            <a
              href={r.url}
              target="_blank"
              rel="noreferrer"
              className="text-link"
            >
              {r.title} ↗
            </a>
            <p>
              {r.edition ?? "Applicable edition requires confirmation"} ·{" "}
              {r.verification}
              {r.effectiveDate ? ` · effective ${r.effectiveDate}` : ""}
            </p>
            <small>
              {r.note} Checked {r.checkedAt}.
            </small>
          </li>
        ))}
      </ul>
      <details>
        <summary>Municipal permit source directory</summary>
        <ul>
          {MUNICIPAL_SOURCES.map((m) => (
            <li key={m.municipality}>
              <strong>{m.municipality}</strong> · {m.automation}
              <p>
                {m.documents} No matching result does not establish absence of
                permits.
              </p>
              <a
                className="text-link"
                href={m.department}
                target="_blank"
                rel="noreferrer"
              >
                Building department ↗
              </a>{" "}
              ·{" "}
              <a
                className="text-link"
                href={m.portal}
                target="_blank"
                rel="noreferrer"
              >
                Permit search ↗
              </a>
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary>Comparative submittal checklists</summary>
        <p>
          These are outside Massachusetts and do not govern this site&apos;s
          permits.
        </p>
        <ul>
          {COMPARATIVE_CHECKLISTS.map((c) => (
            <li key={c.url}>
              <a
                href={c.url}
                className="text-link"
                target="_blank"
                rel="noreferrer"
              >
                {c.name} ↗
              </a>{" "}
              · {c.jurisdiction}
            </li>
          ))}
        </ul>
      </details>
      <p>
        Site: {record.identity.address}. Local amendments, permit date and
        responsible building/fire/electrical officials require confirmation.
      </p>
    </details>
  );
}
export function RequirementsEvidenceMatrix({
  record,
  onField,
  onUpload,
}: {
  record: IntakeRecord;
  onField: (id: string) => void;
  onUpload: (id: string) => void;
}) {
  const rows = requirementCoverage(record);
  return (
    <details className="engineering-reference">
      <summary>Engineering requirement coverage</summary>
      <p>
        Live coverage from this site&apos;s Full Site Record. Review a linked
        field to update its evidence, owner or engineering review; coverage
        updates automatically.
      </p>
      {rows.map((r) => (
        <details key={r.id}>
          <summary>
            {r.title} · {r.status}
          </summary>
          <p>
            {r.stage} · {r.applicability}
          </p>
          <p>Evidence needed: {r.requiredEvidence.join("; ")}.</p>
          <div className="requirement-field-links">
            {r.fieldIds.map((id) => (
              <button
                className="text-link"
                key={id}
                onClick={() => onField(id)}
              >
                {FIELD_SCHEMA.find((d) => d.id === id)?.label}
                {r.missingFieldIds.includes(id)
                  ? " — missing"
                  : r.conflictingFieldIds.includes(id)
                    ? " — conflicting"
                    : " — collected"}
              </button>
            ))}
          </div>
          {r.missingFieldIds[0] && (
            <button
              className="button secondary"
              onClick={() => onUpload(r.missingFieldIds[0])}
            >
              Add evidence for next missing field
            </button>
          )}
          <p>
            Plan outputs:{" "}
            {r.planSheets.join(", ") || "Utility/customer evidence record"}.
            Sheet references are requested mappings; supplied plan sets have not
            been processed.
          </p>
          <a
            href={r.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-link"
          >
            Official reference ↗
          </a>
          <small>{r.verificationStatus}</small>
        </details>
      ))}
      <details>
        <summary>Import EQORE reference drawings</summary>
        <p>
          These requested files were not found in the repository. Upload
          available drawings using Add files, select their actual site, and
          choose “Generic sample / proposed design / reference only” for sample
          plans. Their original files remain available for review and export,
          without satisfying existing-condition requests.
        </p>
        <ul>
          {PLAN_REFERENCE_FILES.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
        <button
          className="button secondary"
          onClick={() => onUpload("singleLine")}
        >
          Add plan set / drawing evidence
        </button>
        <p>
          Generic sample plans are not evidence of existing Worcester facilities
          or Century-Tywood without an explicit site match.
        </p>
      </details>
    </details>
  );
}
