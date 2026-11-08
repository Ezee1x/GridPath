"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type {
  IntakeRecord,
  JsonValue,
  FieldObservation,
} from "@/lib/intake/types";
import { EnvironmentalDetails } from "@/components/environment/EnvironmentalDetails";
import { FIELD_SCHEMA } from "@/lib/intake/schema";
import {
  hasConflict,
  isMeasuredValue,
  mergeCollectedFields,
  observationId,
  reviewField,
  selectedObservation,
} from "@/lib/intake/model";
export function valueText(value: JsonValue): string {
  if (value === null) return "Not retrieved";
  if (typeof value !== "object") return String(value);
  if (!Array.isArray(value) && value.kind === "terrain-elevation") {
    const n = (v: JsonValue) =>
      typeof v === "number"
        ? v.toLocaleString(undefined, { maximumFractionDigits: 1 })
        : "Not retrieved";
    return `≈ ${n(value.medianFeet)} ft ground (median) · sampled ${n(value.minimumFeet)}–${n(value.maximumFeet)} ft · range ${n(value.rangeFeet)} ft`;
  }
  if (!Array.isArray(value) && value.kind === "candidate-jurisdiction")
    return `${String(value.municipality)} · Candidate municipal building jurisdiction; authority verification required. Fire jurisdiction not confirmed.`;
  if (!Array.isArray(value) && typeof value.municipality === "string") {
    const municipality = value.municipality
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
    const jurisdiction = value.authorityHavingJurisdiction;
    return `${municipality} · ${typeof jurisdiction === "string" && jurisdiction.trim() ? jurisdiction : "Jurisdiction not confirmed"}`;
  }
  if (
    !Array.isArray(value) &&
    typeof value.description === "string" &&
    typeof value.useCode === "string"
  )
    return `${value.description} (use code ${value.useCode})`;
  if (!Array.isArray(value) && typeof value.assessorZoning === "string")
    return `${value.assessorZoning} · Municipal confirmation required`;
  if (
    !Array.isArray(value) &&
    typeof value.latitude === "number" &&
    typeof value.longitude === "number"
  ) {
    return `${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}`;
  }
  if (Array.isArray(value)) {
    if (
      value.every(
        (v) =>
          typeof v === "object" && v !== null && "value" in v && "unit" in v,
      )
    )
      return value
        .map((v) => {
          const m = v as { value: number; unit: string };
          return `${m.value.toLocaleString(undefined, { maximumFractionDigits: m.unit === "acres" ? 3 : 1 })} ${m.unit}`;
        })
        .join(" · ");
    return value
      .map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v)))
      .join("; ");
  }
  return JSON.stringify(value);
}
export function FieldEvidence({
  record,
  fieldId,
  update,
  onClose,
  files,
}: {
  record: IntakeRecord;
  fieldId: string;
  update: (f: (r: IntakeRecord) => IntakeRecord) => void;
  onClose: () => void;
  files: Map<string, File>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    definition = FIELD_SCHEMA.find((d) => d.id === fieldId)!,
    field = record.fields.find((f) => f.id === fieldId)!,
    obs = selectedObservation(field);
  const [value, setValue] = useState(
    obs
      ? typeof obs.value === "object"
        ? JSON.stringify(obs.value, null, 2)
        : String(obs.value)
      : "",
  );
  const [unit, setUnit] = useState(obs?.unit ?? "");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceDate, setSourceDate] = useState("");
  const [method, setMethod] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [reviewer, setReviewer] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  async function addValue() {
    setError("");
    if (!value.trim() || !method.trim()) {
      setError("Enter an explicit value and how it was obtained.");
      return;
    }
    let url = "";
    try {
      if (sourceUrl.trim()) {
        const parsed = new URL(sourceUrl);
        if (!["https:", "http:"].includes(parsed.protocol)) throw Error();
        url = parsed.href;
      }
    } catch {
      setError("Use a valid HTTP or HTTPS source URL.");
      return;
    }
    if (file && !/\.(pdf|png|jpe?g|csv|txt|json)$/i.test(file.name)) {
      setError("Use a PDF, PNG, JPEG, CSV, text or JSON supporting file.");
      return;
    }
    setBusy(true);
    try {
      let parsed: JsonValue = value.trim();
      try {
        parsed = JSON.parse(value);
      } catch {
        /* Explicit text value. */
      }
      if (!isMeasuredValue(parsed))
        throw Error("Missing values cannot be saved as measured data.");
      const refs: string[] = [];
      const sources: IntakeRecord["sources"] = {};
      if (url || file) {
        const hash = file
          ? Array.from(
              new Uint8Array(
                await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
              ),
            )
              .map((v) => v.toString(16).padStart(2, "0"))
              .join("")
          : null;
        const key = `input:${record.siteKey}:${fieldId}:${hash ?? url}`;
        refs.push(key);
        sources[key] = {
          key,
          dataset: file?.name ?? "User-referenced evidence",
          provider: file ? "Customer document" : "User supplied",
          serviceUrl: url,
          featureId: null,
          featureName: null,
          recordDate: sourceDate || null,
          datasetUpdated: null,
          retrievedAt: new Date().toISOString(),
          documentId: hash ?? undefined,
          fileName: file?.name,
          fileHash: hash ?? undefined,
        };
        if (file) files.set(key, file);
      }
      const provider = file ? "Customer document" : "User supplied";
      const observation: FieldObservation = {
        id: observationId(
          fieldId,
          parsed,
          provider,
          refs,
          method,
          unit || null,
        ),
        value: parsed,
        unit: unit || null,
        originalUnits: unit || null,
        sourceKeys: refs,
        method,
        provider,
        provenance: provider,
        confidence: file ? "Documented" : "User supplied",
        observedAt: new Date().toISOString(),
      };
      update((r) => {
        const previous = r.fields.find((f) => f.id === fieldId)!;
        const merged = mergeCollectedFields(
          r,
          [{ fieldId, observation }],
          sources,
        );
        return {
          ...merged,
          fields: merged.fields.map((f) =>
            f.id === fieldId && previous.review.status !== "Engineer verified"
              ? {
                  ...f,
                  selectedId: observation.id,
                  pinned: true,
                  review: {
                    status: "Unreviewed",
                    reviewer: null,
                    at: null,
                    note: "",
                  },
                }
              : f,
          ),
        };
      });
      setError(
        field.review.status === "Engineer verified"
          ? "Observation added. The previously verified selection was preserved; select a different observation explicitly to change it."
          : "Observation saved; engineer review is pending.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Evidence could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  function choose(id: string) {
    update((r) => ({
      ...r,
      updatedAt: new Date().toISOString(),
      fields: r.fields.map((f) =>
        f.id === fieldId && f.selectedId !== id
          ? {
              ...f,
              selectedId: id,
              pinned: true,
              review: {
                status: "Unreviewed",
                reviewer: null,
                at: null,
                note: "",
              },
              request: {
                ...f.request,
                status:
                  f.request.status === "Verified"
                    ? "Under review"
                    : f.request.status,
              },
            }
          : f,
      ),
    }));
  }
  return (
    <dialog
      ref={dialog}
      className="evidence-dialog intake-evidence"
      aria-label="Field source and method"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="intake-dialog-heading">
        <h2>{definition.label}</h2>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close field evidence"
        >
          <X size={18} />
        </button>
      </div>
      <p>
        {definition.condition === "proposed"
          ? "Proposed design"
          : "Existing condition"}{" "}
        · {field.review.status}
      </p>
      {hasConflict(field) && (
        <p className="notice">
          Multiple observations disagree. The selected value and all
          alternatives are retained for review.
        </p>
      )}
      {obs ? (
        <>
          <p className="intake-evidence-value">
            {valueText(obs.value)}{" "}
            {typeof obs.value !== "object" ? obs.unit : ""}
          </p>
          <p>
            {obs.provenance} · {obs.confidence} ·{" "}
            {obs.sourceKeys.some((k) => {
              const s = record.sources[k];
              return (
                s &&
                !s.referenceOnly &&
                !!(s.featureId || s.serviceUrl || s.fileHash || s.documentId)
              );
            })
              ? "Source-backed"
              : "No independent source"}
          </p>
          {obs.warnings?.map((w) => (
            <p key={w} className="notice">
              {w}
            </p>
          ))}
          <h3>Source & method</h3>
          <p>{obs.method}</p>
          <p>
            Original units: {obs.originalUnits ?? "Not specified"} · Current
            units: {obs.unit ?? "Not specified"}
          </p>
          <p>Observation time: {obs.observedAt}</p>
          {obs.sourceKeys.map((k) => {
            const s = record.sources[k];
            return s ? (
              <section className="analysis-source" key={k}>
                <strong>
                  {s.provider}: {s.dataset}
                </strong>
                {s.serviceUrl && (
                  <a href={s.serviceUrl} target="_blank" rel="noreferrer">
                    Open source ↗
                  </a>
                )}
                <dl className="location-details">
                  <div>
                    <dt>Source feature/document ID</dt>
                    <dd>{s.featureId ?? s.documentId ?? "Not available"}</dd>
                  </div>
                  <div>
                    <dt>Record/dataset date</dt>
                    <dd>
                      {s.recordDate ?? s.datasetUpdated ?? "Not available"}
                    </dd>
                  </div>
                  {s.fiscalYear && (
                    <div>
                      <dt>Assessor fiscal year</dt>
                      <dd>FY {s.fiscalYear}</dd>
                    </div>
                  )}
                  {s.locId && (
                    <div>
                      <dt>LOC_ID / TOWN_ID</dt>
                      <dd>
                        {s.locId} / {s.townId ?? "Not available"}
                      </dd>
                    </div>
                  )}
                  {s.propertyId && (
                    <div>
                      <dt>Assessor PROP_ID</dt>
                      <dd>{s.propertyId}</dd>
                    </div>
                  )}
                  {s.matchingMethod && (
                    <div>
                      <dt>Matching method</dt>
                      <dd>{s.matchingMethod}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Retrieved</dt>
                    <dd>{s.retrievedAt ?? "Not retrieved"}</dd>
                  </div>
                </dl>
                {s.referenceOnly && (
                  <p>
                    Reference summary only; original evidence is not attached.
                  </p>
                )}
                {s.fileName && (
                  <p>
                    Document: {s.fileName}.{" "}
                    {files.has(k)
                      ? "File available this session."
                      : "Re-add the file to inspect its contents after refresh."}
                  </p>
                )}
                {files.has(k) && (
                  <button
                    className="button"
                    onClick={() => {
                      const attached = files.get(k)!;
                      const extension = attached.name
                        .split(".")
                        .pop()
                        ?.toLowerCase();
                      const mime =
                        extension === "pdf"
                          ? "application/pdf"
                          : extension === "png"
                            ? "image/png"
                            : ["jpg", "jpeg"].includes(extension ?? "")
                              ? "image/jpeg"
                              : "text/plain";
                      const u = URL.createObjectURL(
                        new Blob([attached], { type: mime }),
                      );
                      window.open(u, "_blank", "noopener,noreferrer");
                      setTimeout(() => URL.revokeObjectURL(u), 60000);
                    }}
                  >
                    Inspect uploaded file
                  </button>
                )}
              </section>
            ) : null;
          })}
          {!obs.sourceKeys.length && (
            <p>
              No independent source is attached to this explicit user input.
            </p>
          )}
        </>
      ) : (
        <p>
          Not retrieved.{" "}
          {fieldId === "zoning"
            ? "No usable assessor ZONING attribute was returned for this parcel. Municipal confirmation required. "
            : fieldId === "landUse"
              ? "No unambiguous town/use-code description was returned for this parcel. Numeric codes are not guessed. "
              : ""}
          {definition.suggestedEvidence}
        </p>
      )}
      <EnvironmentalDetails bundle={record.environment} fieldId={fieldId} />
      {definition.category === "property" && record.propertyIdentification && (
        <details>
          <summary>Linked assessor records and matching notes</summary>
          {record.propertyIdentification.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
          {record.propertyIdentification.assessor.error && (
            <p>{record.propertyIdentification.assessor.error}</p>
          )}
          {record.propertyIdentification.assessor.records.map((r) => (
            <section className="analysis-source" key={String(r.OBJECTID)}>
              <a
                href={`https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/MassachusettsPropertyTaxParcels/FeatureServer/4/${String(r.OBJECTID)}`}
                target="_blank"
                rel="noreferrer"
              >
                Open assessor record ↗
              </a>
              <p>
                Record {String(r.OBJECTID)} · PROP_ID{" "}
                {String(r.PROP_ID ?? "Not available")} · FY{" "}
                {String(r.FY ?? "Not available")}
              </p>
              <p>Assessor address: {String(r.SITE_ADDR ?? "Not available")}</p>
              <p>
                LOC_ID {String(r.LOC_ID)} · TOWN_ID {String(r.TOWN_ID)}
              </p>
            </section>
          ))}
        </details>
      )}
      {record.analysis && ["parcelArea", "totalRoofArea"].includes(fieldId) && (
        <section className="analysis-source">
          <h3>Related geographic calculations</h3>
          <p>
            Source-reported areas and mapped geometry can differ because their
            definitions, dates and precision differ.
          </p>
          {(fieldId === "parcelArea"
            ? [record.analysis.metrics.mappedParcelArea]
            : [
                record.analysis.metrics.containedRoofprintUnion,
                record.analysis.metrics.totalRoofprintArea,
                record.analysis.metrics.mappedRoofprintCoverage,
              ]
          )
            .filter((m) => !!m)
            .map((m) => (
              <div key={m.id}>
                <strong>{m.label}</strong>
                <p>
                  {valueText(m.values as unknown as JsonValue)} · {m.quality}
                </p>
                <p>{m.method}</p>
                {m.notes.map((n) => (
                  <p key={n}>{n}</p>
                ))}
              </div>
            ))}
        </section>
      )}
      {field.observations.length > 0 && (
        <label className="input-label">
          Selected observation
          <select
            aria-label="Selected field observation"
            value={field.selectedId ?? ""}
            onChange={(e) => choose(e.target.value)}
          >
            {field.observations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.provider}: {valueText(o.value).slice(0, 90)}
              </option>
            ))}
          </select>
        </label>
      )}
      <details>
        <summary>Add a value / supporting evidence</summary>
        <div className="intake-form">
          <label>
            Value
            <textarea
              aria-label="Field value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <label>
            Units
            <input
              aria-label="Field units"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </label>
          <label>
            Source URL
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
            />
          </label>
          <label>
            Source date (if known)
            <input
              type="date"
              value={sourceDate}
              onChange={(e) => setSourceDate(e.target.value)}
            />
          </label>
          <label>
            Supporting document
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.csv,.txt,.json"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <small>
            Values are explicitly entered by you. Files are referenced, not
            automatically extracted; file bytes remain in this browser session.
          </small>
          <label>
            How this value was obtained
            <textarea
              aria-label="Value method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            />
          </label>
          <button className="button" disabled={busy} onClick={addValue}>
            Save observation
          </button>
        </div>
      </details>
      <details>
        <summary>Engineering review</summary>
        <p>
          Self-attested demo review. Receipt of a document does not verify the
          field.
        </p>
        {field.review.reviewer && (
          <p>
            Reviewed by {field.review.reviewer} · {field.review.at} ·{" "}
            {field.review.note}
          </p>
        )}
        <div className="intake-form">
          <label>
            Reviewer
            <input
              aria-label="Field reviewer"
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
            />
          </label>
          <label>
            Review note
            <textarea
              aria-label="Field review note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button
            className="button"
            onClick={() => {
              try {
                const reviewed = reviewField(record, fieldId, reviewer, note);
                update(() => reviewed);
                setError(
                  "Selected observation marked Engineer verified by explicit review.",
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Verify selected field
          </button>
        </div>
      </details>
      {error && (
        <p role="status" className="notice">
          {error}
        </p>
      )}
    </dialog>
  );
}
