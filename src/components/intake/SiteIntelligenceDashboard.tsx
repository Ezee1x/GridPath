"use client";
import { useState } from "react";
import { MetricEvidence } from "@/components/gis/SiteAnalysisPanel";
import type { AnalysisMetric, SiteAnalysis } from "@/lib/gis/analysis-types";
import type { SelectedAddress } from "@/lib/maps/address";
import type { GisLayerResult } from "@/lib/gis/types";
import type { IntakeRecord } from "@/lib/intake/types";
import { CATEGORIES, FIELD_SCHEMA } from "@/lib/intake/schema";
import {
  exportIntake,
  hasConflict,
  readiness,
  selectedObservation,
} from "@/lib/intake/model";
import { FUTURE_ADAPTERS } from "@/lib/intake/adapters";
import { portableIntake } from "@/lib/intake/portable";
import type { EnvironmentBundle } from "@/lib/environment/types";
import { useIntake } from "./useIntake";
import {
  fieldInView,
  verificationItems,
  applicable,
  type FieldView,
} from "@/lib/intake/verification";
import { SiteFiles, FileAttachmentDialog, fieldFileKeys } from "./SiteFiles";
import { ElectricalDiscoveryPanel } from "./ElectricalDiscoveryPanel";
import { FieldEvidence, valueText } from "./FieldEvidence";
export function SiteIntelligenceDashboard({
  analysis,
  address,
  layers,
  environment,
  onViewContours,
  initialFieldId,
}: {
  initialFieldId?: string | null;
  environment?: EnvironmentBundle;
  onViewContours?: () => void;
  analysis: SiteAnalysis;
  address: SelectedAddress;
  layers: { parcels: GisLayerResult | null; roads: GisLayerResult | null };
}) {
  const { record, warning, update, propertyStatus, retryProperty, files } =
    useIntake(analysis, address, layers, environment);
  return (
    <EngineeringRecordDashboard
      record={record}
      warning={warning}
      update={update}
      propertyStatus={propertyStatus}
      retryProperty={retryProperty}
      files={files}
      analysis={analysis}
      address={address}
      onViewContours={onViewContours}
      initialFieldId={initialFieldId}
    />
  );
}
export function EngineeringRecordDashboard({
  record,
  warning,
  update,
  propertyStatus = "Public property sources load in the site map.",
  retryProperty,
  files,
  analysis,
  address,
  onViewContours,
  initialFieldId,
}: {
  record: IntakeRecord;
  warning: string;
  update: (fn: (r: IntakeRecord) => IntakeRecord) => void;
  propertyStatus?: string;
  retryProperty?: () => void;
  files: Map<string, File>;
  analysis?: SiteAnalysis;
  address?: SelectedAddress;
  onViewContours?: () => void;
  initialFieldId?: string | null;
}) {
  const [uploadField, setUploadField] = useState<string | null>(null);
  const [measurement, setMeasurement] = useState<AnalysisMetric | null>(null);
  const [fieldId, setFieldId] = useState<string | null>(
    initialFieldId && FIELD_SCHEMA.some((d) => d.id === initialFieldId)
      ? initialFieldId
      : null,
  );
  const [mode, setMode] = useState<FieldView>("fields");
  const [accordion, setAccordion] = useState({ all: false, version: 0 });
  const counts = readiness(record);
  const dashboardCategories = CATEGORIES.filter((c) => c.id !== "design");
  const dashboardFields = FIELD_SCHEMA.filter((d) => d.category !== "design");
  // Prioritize measured land constraints and public-record screening findings.
  // Electrical capacity and access approval require separate engineering evidence.
  const metrics = [
    ["parcelArea", "Parcel area"],
    ["unbuiltArea", "Approximate unbuilt parcel area"],
    ["zoning", "Zoning district"],
    ["flood", "FEMA flood hazard"],
    ["wetlands", "Wetlands proximity"],
    ["boundarySummary", "Building-to-parcel-boundary distance"],
    ["roadProximity", "Nearest mapped road centerline"],
    ["totalRoofArea", "Total contained roofprint area (union)"],
  ];
  const crossing = (analysis?.buildings ?? []).some((b) =>
    b.association.startsWith("Crosses"),
  );
  const measured = (analysis?.buildings ?? [])
    .filter(
      (b) => b.association.startsWith("Within") && b.boundaryDistance.values,
    )
    .sort(
      (a, b) =>
        a.boundaryDistance.values!.find((v) => v.unit === "ft")!.value -
        b.boundaryDistance.values!.find((v) => v.unit === "ft")!.value,
    );
  const closest = measured[0];
  const missingCritical = verificationItems(record).filter(
    (item) =>
      item.priority === "Critical" &&
      item.reasons.includes("Missing or incomplete value"),
  );
  function download() {
    const payload = {
      ...exportIntake(portableIntake(record)),
      geographicMeasurements: portableIntake(record).analysis,
      contentHandling:
        "Google Places address and coordinates remain in the active Maps session and are excluded from this export. Place IDs and public GIS/assessor evidence are retained.",
      selectedAddressSource: address
        ? {
            provider: address.source,
            placeId: address.placeId,
            retrievedAt: address.retrievedAt,
          }
        : undefined,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "qore-engineering-site-record.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="intelligence-dashboard">
      <section aria-labelledby="site-highlights-title">
        <div className="intelligence-heading">
          <div>
            <h2 id="site-highlights-title">Highlights of Site</h2>
            <p>{address?.formattedAddress ?? record.identity.address}</p>
          </div>
          <span>Preliminary engineering record</span>
        </div>
        {warning && (
          <p className="notice" role="status">
            {warning}
          </p>
        )}
        {Object.entries(analysis?.coverage ?? {})
          .filter(([, v]) => v.error || v.warnings.length)
          .map(([k, v]) => (
            <p className="notice" key={k}>
              {k}: {[v.error, ...v.warnings].filter(Boolean).join(" ")} Previous
              observations remain available with their retrieval dates.
            </p>
          ))}
        <div className="intelligence-metrics">
          {analysis &&
            metrics.map(([id, label]) => {
              const field = record.fields.find((f) => f.id === id),
                obs = field && selectedObservation(field);
              let text = obs ? valueText(obs.value) : "Not retrieved",
                provenance = obs
                  ? field!.review.status === "Engineer verified"
                    ? "Engineer verified"
                    : obs.provenance
                  : "Not available",
                definition = "";
              let target = id;
              if (obs) {
                if (typeof obs.value !== "object" && obs.unit)
                  text = `${text} ${obs.unit}`;
                if (
                  Array.isArray(obs.value) &&
                  ["parcelArea", "totalRoofArea", "unbuiltArea"].includes(id)
                ) {
                  const rows = obs.value.filter(
                    (v) =>
                      v && typeof v === "object" && "unit" in v && "value" in v,
                  ) as { unit: string; value: number }[];
                  const units =
                    id === "parcelArea" ? ["sq ft", "acres"] : ["sq ft"];
                  if (rows.length)
                    text = rows
                      .filter((v) => units.includes(v.unit))
                      .map(
                        (v) =>
                          `${v.value.toLocaleString(undefined, { maximumFractionDigits: v.unit === "acres" ? 3 : 1 })} ${v.unit}`,
                      )
                      .join(" · ");
                }
              }
              if (id === "roadProximity") {
                text =
                  analysis.metrics.roadProximity.values
                    ?.filter((v) => v.unit === "ft")
                    .map(
                      (v) =>
                        `${v.value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ft`,
                    )
                    .join("") ?? "Not retrieved";
                provenance = analysis.metrics.roadProximity.values
                  ? "Calculated from GIS geometry"
                  : "Not available";
                definition = analysis.nearestRoad
                  ? `${analysis.nearestRoad.name} · feature ${analysis.nearestRoad.featureId}; parcel-to-centerline, no access confirmation.`
                  : "Road proximity has not been established.";
                target = "roadNames";
              }
              if (id === "boundarySummary") {
                text = crossing
                  ? "Geometry intersects boundary — needs verification"
                  : closest
                    ? `${closest.boundaryDistance.values!.find((v) => v.unit === "ft")!.value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ft`
                    : "Not retrieved";
                provenance =
                  !crossing && closest
                    ? "Calculated from GIS geometry"
                    : "Not available";
                definition = crossing
                  ? "A crossing roofprint prevents a representative site minimum. Review individual geometry."
                  : closest
                    ? `Roofprint ${closest.name} (feature ${closest.id}); smallest contained roofprint ring-to-parcel-ring minimum, including holes.`
                    : "Requires a selected parcel and associated roofprint.";
                target = "boundaryDistances";
              }
              if (id === "zoning" && obs)
                definition =
                  "Assessor zoning attribute · Municipal confirmation required";
              if (id === "unbuiltArea")
                definition =
                  "Mapped parcel polygon minus union of clipped roofprints. This is not usable battery-installation area.";
              if (id === "totalRoofArea")
                definition =
                  "Overlapping contained roofprints counted once. Crossing coverage and reported area sums are separate in source details.";
              return (
                <button
                  className="intelligence-metric"
                  key={id}
                  type="button"
                  onClick={() => {
                    if (id === "roadProximity")
                      setMeasurement(analysis.metrics.roadProximity);
                    else if (id === "boundarySummary" && !crossing && closest)
                      setMeasurement(closest.boundaryDistance);
                    else setFieldId(target);
                  }}
                >
                  <span>{label}</span>
                  <strong>{text}</strong>
                  <small>{provenance}</small>
                  {definition && <p>{definition}</p>}
                  <small className="intelligence-source-link">
                    Source & method ↗
                  </small>
                </button>
              );
            })}
        </div>
      </section>
      <section
        className="intake-readiness"
        aria-labelledby="engineering-readiness-title"
      >
        <h2 id="engineering-readiness-title">Engineering Data Readiness</h2>
        <div>
          {[
            ["Required intake fields", counts.required],
            ["Fields populated", counts.populated],
            ["With source evidence", counts.evidence],
            ["Fields missing", counts.missing],
            ["Awaiting verification", counts.awaitingVerification],
          ].map(([label, n]) => (
            <span key={label}>
              <strong>{n}</strong>
              {label}
            </span>
          ))}
        </div>
        <p>
          {record.stage === "design"
            ? "Counts include existing conditions and proposed design fields for the design stage."
            : `Counts use required existing-condition fields. ${FIELD_SCHEMA.filter((d) => d.condition === "proposed").length} proposed design/placement fields are not yet applicable and are excluded.`}{" "}
          Partially collected municipality/AHJ information remains incomplete.
        </p>
        <h3>Critical information needed</h3>
        <p>
          {missingCritical.map((item) => item.definition.label).join(" · ") ||
            "No missing Critical-priority fields."}
        </p>
      </section>
      <SiteFiles
        record={record}
        onAdd={setUploadField}
        fields={dashboardFields}
      />
      <details className="full-intake" open>
        <summary className="intelligence-heading">
          <h2>Full Site Record</h2>
          <span>
            {dashboardFields.length} substantive fields across{" "}
            {dashboardCategories.length} categories
          </span>
        </summary>
        <label className="intake-stage">
          Project stage{" "}
          <select
            aria-label="Project stage"
            value={record.stage ?? "intake"}
            onChange={(e) => {
              const stage = e.target.value as "intake" | "design";
              update((r) => ({
                ...r,
                stage,
                updatedAt: new Date().toISOString(),
              }));
            }}
          >
            <option value="intake">Site intake</option>
            <option value="design">Design</option>
          </select>
        </label>
        <div className="intake-toolbar">
          <div role="tablist" aria-label="Engineering record views">
            <button
              role="tab"
              aria-selected={mode === "fields"}
              aria-controls="intake-fields"
              onClick={() => setMode("fields")}
            >
              All fields
            </button>
            <button
              role="tab"
              aria-selected={mode === "missing"}
              aria-controls="intake-fields"
              onClick={() => setMode("missing")}
            >
              Missing information
            </button>
            <button
              role="tab"
              aria-selected={mode === "verification"}
              aria-controls="intake-fields"
              onClick={() => setMode("verification")}
            >
              Needs verification
            </button>
            <button
              role="tab"
              aria-selected={mode === "conflicts"}
              aria-controls="intake-fields"
              onClick={() => setMode("conflicts")}
            >
              Source conflicts
            </button>
          </div>
          {mode === "fields" && (
            <div>
              <button
                className="text-link"
                onClick={() =>
                  setAccordion((s) => ({ all: true, version: s.version + 1 }))
                }
              >
                Expand all
              </button>
              <button
                className="text-link"
                onClick={() =>
                  setAccordion((s) => ({ all: false, version: s.version + 1 }))
                }
              >
                Collapse all
              </button>
            </div>
          )}
        </div>
        <div id="intake-fields" role="tabpanel">
          {!dashboardFields.some((d) => fieldInView(record, d, mode)) && (
            <p className="intake-condition-group">No fields match this view.</p>
          )}
          {dashboardCategories.map((c) => {
            const stats = readiness(record, c.id);
            if (
              !FIELD_SCHEMA.some(
                (d) => d.category === c.id && fieldInView(record, d, mode),
              )
            )
              return null;
            return (
              <details
                className={`intake-category ${c.id === "design" ? "proposed-category" : ""}`}
                key={`${c.id}:${accordion.version}`}
                open={
                  accordion.all ||
                  c.id ===
                    FIELD_SCHEMA.find((d) => d.id === initialFieldId)?.category
                }
              >
                <summary>
                  <span>
                    {c.label}
                    {c.id === "design" ? " — proposed conditions" : ""}
                  </span>
                  <small>
                    {c.id === "design" && record.stage !== "design" ? (
                      "Not yet applicable"
                    ) : (
                      <>
                        {stats.populated} collected · {stats.missing} missing ·{" "}
                        {stats.awaitingVerification} awaiting verification
                      </>
                    )}
                  </small>
                </summary>
                {c.id === "electrical" && (
                  <ElectricalDiscoveryPanel
                    record={record}
                    update={update}
                    files={files}
                    onField={setFieldId}
                  />
                )}
                {c.id === "property" && (
                  <div className="intake-condition-group">
                    <p role="status">{propertyStatus}</p>
                    <button
                      type="button"
                      className="text-link"
                      onClick={retryProperty}
                    >
                      Retry property sources
                    </button>
                    {record.propertyIdentification?.warnings.map((w) => (
                      <p key={w}>{w}</p>
                    ))}
                  </div>
                )}
                {(["existing", "proposed"] as const).map((condition) => {
                  const defs = FIELD_SCHEMA.filter(
                    (d) =>
                      d.category === c.id &&
                      d.condition === condition &&
                      fieldInView(record, d, mode),
                  );
                  return defs.length ? (
                    <div className="intake-condition-group" key={condition}>
                      <h3>
                        {condition === "proposed"
                          ? record.stage === "design"
                            ? "Proposed design / placement"
                            : "Proposed design / placement — not yet applicable"
                          : "Existing site conditions"}
                      </h3>
                      <div className="intake-table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Field</th>
                              <th>Current value</th>
                              <th>Evidence & review</th>
                            </tr>
                          </thead>
                          <tbody>
                            {defs.map((d) => {
                              const f = record.fields.find(
                                  (f) => f.id === d.id,
                                )!,
                                o = selectedObservation(f);
                              return (
                                <tr key={d.id} id={`field-${d.id}`}>
                                  <td>
                                    {d.label}
                                    <small>
                                      {d.condition === "proposed" &&
                                      record.stage !== "design"
                                        ? "Not yet applicable"
                                        : ""}
                                    </small>
                                  </td>
                                  <td>
                                    <div
                                      className={`intake-value${d.id === "codes" ? " intake-code-value" : ""}`}
                                    >
                                      {d.id === "codes" &&
                                      Array.isArray(o?.value) ? (
                                        <ul className="code-reference-list">
                                          {o.value.map((entry, index) => (
                                            <li key={index}>{String(entry)}</li>
                                          ))}
                                        </ul>
                                      ) : o ? (
                                        valueText(o.value)
                                      ) : applicable(record, d) ? (
                                        record.electricalDiscovery
                                          ?.fieldResults[d.id] ? (
                                          "Missing site-specific evidence"
                                        ) : (
                                          "Not retrieved"
                                        )
                                      ) : (
                                        "Not yet applicable"
                                      )}
                                      {o &&
                                      typeof o.value !== "object" &&
                                      o.unit
                                        ? ` ${o.unit}`
                                        : ""}
                                    </div>
                                    {record.electricalDiscovery?.fieldResults[
                                      d.id
                                    ] && (
                                      <div className="electrical-field-status">
                                        <small>
                                          {record.electricalDiscovery.fieldResults[
                                            d.id
                                          ].statuses.join(" · ")}
                                        </small>
                                        <details>
                                          <summary>
                                            Source limits & next step
                                          </summary>
                                          <small>
                                            {
                                              record.electricalDiscovery
                                                .fieldResults[d.id].reason
                                            }
                                          </small>
                                        </details>
                                      </div>
                                    )}
                                    {o?.complete === false && (
                                      <small>
                                        Partially collected — needs verification
                                      </small>
                                    )}
                                    {d.id === "elevation" && onViewContours && (
                                      <button
                                        type="button"
                                        className="text-link"
                                        onClick={onViewContours}
                                      >
                                        View contour map
                                      </button>
                                    )}
                                    {o?.warnings?.map((w) => (
                                      <small key={w}>{w}</small>
                                    ))}
                                    {hasConflict(f) && (
                                      <small>
                                        Conflicting observations retained
                                      </small>
                                    )}
                                  </td>
                                  <td>
                                    <div className="intake-review-summary">
                                      <div className="intake-review-line">
                                        <span>
                                          {o?.provenance ?? "Not available"}
                                        </span>
                                        <small>{f.review.status}</small>
                                      </div>
                                      <div className="intake-review-line intake-review-meta">
                                        <small>
                                          {f.priority ?? d.criticality} priority
                                        </small>
                                        <small>{f.request.status}</small>
                                        <small>{f.request.owner}</small>
                                      </div>
                                      <div className="intake-row-actions">
                                        <button
                                          type="button"
                                          className="text-link"
                                          onClick={() => setFieldId(d.id)}
                                        >
                                          Source & method
                                        </button>
                                        <button
                                          type="button"
                                          className="text-link field-add-file"
                                          aria-label={`Add file for ${d.label}`}
                                          onClick={() => setUploadField(d.id)}
                                        >
                                          Add file
                                          {fieldFileKeys(record, d.id).length >
                                          0
                                            ? ` · ${fieldFileKeys(record, d.id).length} attached`
                                            : ""}
                                        </button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null;
                })}
              </details>
            );
          })}
        </div>
      </details>
      <section className="intake-sources">
        <h2>Source references & export</h2>
        <p>
          Public observations and calculated measurements are not automatically
          engineer verified. Each field retains its provider, units, method,
          retrieval time, confidence and review history.
        </p>
        <details>
          <summary>Original providers and future integrations</summary>
          <ul>
            {[
              ...new Set(Object.values(record.sources).map((s) => s.provider)),
            ].map((p) => (
              <li key={p}>{p} — referenced observations available</li>
            ))}
            {FUTURE_ADAPTERS.map((a) => (
              <li key={a.name}>{a.name}: Not integrated</li>
            ))}
          </ul>
        </details>
        <button type="button" className="button primary" onClick={download}>
          Export Site Record
        </button>
        <p className="muted">
          Environmental source failures preserve other successful results; prior
          observations keep their source dates.
        </p>
        <p className="muted">
          Edits persist for this address and parcel in this browser. Uploaded
          file bytes are available only for the current session. Google Places
          address and coordinates are session-only; portable exports retain
          independently sourced public records.
        </p>
      </section>
      {measurement && analysis && (
        <MetricEvidence
          metric={measurement}
          analysis={analysis}
          onClose={() => setMeasurement(null)}
        />
      )}
      {uploadField && (
        <FileAttachmentDialog
          key={`${record.siteKey}:${uploadField}`}
          record={record}
          fieldId={uploadField}
          update={update}
          files={files}
          onClose={() => setUploadField(null)}
        />
      )}
      {fieldId && (
        <FieldEvidence
          key={fieldId}
          record={record}
          fieldId={fieldId}
          update={update}
          onClose={() => setFieldId(null)}
          files={files}
        />
      )}
    </div>
  );
}
