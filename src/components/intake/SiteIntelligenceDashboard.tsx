"use client";
import { useState } from "react";
import { MetricEvidence } from "@/components/gis/SiteAnalysisPanel";
import type { AnalysisMetric, SiteAnalysis } from "@/lib/gis/analysis-types";
import type { SelectedAddress } from "@/lib/maps/address";
import type { GisLayerResult } from "@/lib/gis/types";
import type { IntakeRecord, RequestStatus } from "@/lib/intake/types";
import { CATEGORIES, FIELD_SCHEMA } from "@/lib/intake/schema";
import {
  exportIntake,
  hasConflict,
  isPopulated,
  readiness,
  selectedObservation,
  updateRequest,
} from "@/lib/intake/model";
import { mergeLegacyRecord, FUTURE_ADAPTERS } from "@/lib/intake/adapters";
import { useWorkspace } from "@/lib/store";
import { portableIntake } from "@/lib/intake/portable";
import type { EnvironmentBundle } from "@/lib/environment/types";
import { useIntake } from "./useIntake";
import { FieldEvidence, valueText } from "./FieldEvidence";
const statuses: RequestStatus[] = [
  "Missing",
  "Requested",
  "Received",
  "Under review",
  "Verified",
];
function MissingWorkflow({
  record,
  update,
  onEvidence,
}: {
  record: IntakeRecord;
  update: (fn: (r: IntakeRecord) => IntakeRecord) => void;
  onEvidence: (id: string) => void;
}) {
  const [error, setError] = useState("");
  const tasks = FIELD_SCHEMA.filter(
    (d) => !isPopulated(record.fields.find((f) => f.id === d.id)!),
  )
    .sort((a, b) => a.priority - b.priority)
    .map((d) => ({
      id: d.id,
      priority: d.priority,
      label: d.label,
      reason: d.reason,
      suggested: d.suggestedEvidence,
      condition: d.condition,
      request: record.fields.find((f) => f.id === d.id)!.request,
      verified:
        record.fields.find((f) => f.id === d.id)!.review.status ===
        "Engineer verified",
    }));
  const extra = [
    {
      id: "bills",
      priority: 6,
      label: "Utility bills",
      reason: "Establish rate, demand and historical customer usage.",
      suggested:
        "Customer utility bills with service account and billing dates.",
      condition: "existing",
      request: record.extraRequests.bills,
      verified: false,
    },
    {
      id: "underground",
      priority: 11,
      label: "Underground utility verification",
      reason:
        "Locate buried services and obstructions before excavation or pathway design.",
      suggested:
        "Utility locate records, customer drawings and documented field verification.",
      condition: "existing",
      request: record.extraRequests.underground,
      verified: false,
    },
  ];
  function save(
    id: string,
    status: RequestStatus,
    owner: string,
    notes: string,
  ) {
    try {
      const next = updateRequest(record, id, status, owner, notes);
      update(() => next);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="missing-intake">
      <p>
        Request status tracks collection. Received documents remain unverified
        until a populated field is explicitly reviewed.
      </p>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {[...tasks, ...extra]
        .sort((a, b) => a.priority - b.priority)
        .map((t) => (
          <details key={t.id}>
            <summary>
              <span>
                {t.label} {t.condition === "proposed" ? "(proposed)" : ""}
              </span>
              <span>{t.request.status}</span>
            </summary>
            <p>{t.reason}</p>
            <p>
              <strong>Suggested evidence:</strong> {t.suggested}
            </p>
            <div className="request-editor">
              <label>
                Responsible party
                <input
                  aria-label={`Owner for ${t.label}`}
                  value={t.request.owner}
                  onChange={(e) =>
                    save(
                      t.id,
                      t.request.status,
                      e.target.value,
                      t.request.notes,
                    )
                  }
                />
              </label>
              <label>
                Request status
                <select
                  aria-label={`Request status for ${t.label}`}
                  value={t.request.status}
                  onChange={(e) =>
                    save(
                      t.id,
                      e.target.value as RequestStatus,
                      t.request.owner,
                      t.request.notes,
                    )
                  }
                >
                  {statuses.map((s) => (
                    <option key={s} disabled={s === "Verified" && !t.verified}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Notes
                <textarea
                  aria-label={`Notes for ${t.label}`}
                  value={t.request.notes}
                  onChange={(e) =>
                    save(
                      t.id,
                      t.request.status,
                      t.request.owner,
                      e.target.value,
                    )
                  }
                />
              </label>
              <p>
                Review status:{" "}
                {t.verified
                  ? "Engineer verified"
                  : "Pending engineering verification"}
              </p>
              {FIELD_SCHEMA.some((d) => d.id === t.id) && (
                <button
                  type="button"
                  className="text-link"
                  onClick={() => onEvidence(t.id)}
                >
                  Add value, inspect sources & review
                </button>
              )}
            </div>
          </details>
        ))}
    </div>
  );
}
export function SiteIntelligenceDashboard({
  analysis,
  address,
  layers,
  environment,
  onViewContours,
}: {
  environment?: EnvironmentBundle;
  onViewContours?: () => void;
  analysis: SiteAnalysis;
  address: SelectedAddress;
  layers: { parcels: GisLayerResult | null; roads: GisLayerResult | null };
}) {
  const { record, warning, update, propertyStatus, retryProperty } = useIntake(
    analysis,
    address,
    layers,
    environment,
  );
  const { sites } = useWorkspace();
  const [measurement, setMeasurement] = useState<AnalysisMetric | null>(null);
  const [fieldId, setFieldId] = useState<string | null>(null);
  const [mode, setMode] = useState<"fields" | "missing">("fields");
  const [accordion, setAccordion] = useState({ all: false, version: 0 });
  const [legacyId, setLegacyId] = useState("");
  const [files] = useState(() => new Map<string, File>());
  const counts = readiness(record);
  const metrics = [
    ["parcelArea", "Parcel area"],
    ["totalRoofArea", "Total contained roofprint area (union)"],
    ["buildingCount", "Associated contained roofprints"],
    ["unbuiltArea", "Approximate unbuilt parcel area"],
    ["roadProximity", "Nearest mapped road centerline"],
    ["boundarySummary", "Building-to-parcel-boundary distance"],
    ["zoning", "Zoning district"],
    ["flood", "FEMA flood hazard"],
    ["wetlands", "Wetlands proximity"],
    ["utility", "Serving utility"],
  ];
  const crossing = analysis.buildings.some((b) =>
    b.association.startsWith("Crosses"),
  );
  const measured = analysis.buildings
    .filter(
      (b) => b.association.startsWith("Within") && b.boundaryDistance.values,
    )
    .sort(
      (a, b) =>
        a.boundaryDistance.values!.find((v) => v.unit === "ft")!.value -
        b.boundaryDistance.values!.find((v) => v.unit === "ft")!.value,
    );
  const closest = measured[0];
  const missingCritical = FIELD_SCHEMA.filter(
    (d) =>
      d.required && !isPopulated(record.fields.find((f) => f.id === d.id)!),
  )
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5);
  function download() {
    const payload = {
      ...exportIntake(portableIntake(record)),
      geographicMeasurements: portableIntake(record).analysis,
      contentHandling:
        "Google Places address and coordinates remain in the active Maps session and are excluded from this export. Place IDs and public GIS/assessor evidence are retained.",
      selectedAddressSource: {
        provider: address.source,
        placeId: address.placeId,
        retrievedAt: address.retrievedAt,
      },
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
      <section aria-labelledby="site-intelligence-title">
        <div className="intelligence-heading">
          <div>
            <h2 id="site-intelligence-title">Site Intelligence</h2>
            <p>{address.formattedAddress}</p>
          </div>
          <span>Preliminary engineering record</span>
        </div>
        {warning && (
          <p className="notice" role="status">
            {warning}
          </p>
        )}
        {Object.entries(analysis.coverage)
          .filter(([, v]) => v.error || v.warnings.length)
          .map(([k, v]) => (
            <p className="notice" key={k}>
              {k}: {[v.error, ...v.warnings].filter(Boolean).join(" ")} Previous
              observations remain available with their retrieval dates.
            </p>
          ))}
        <div className="intelligence-metrics">
          {metrics.map(([id, label]) => {
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
          Counts use required existing-condition fields.{" "}
          {FIELD_SCHEMA.filter((d) => d.condition === "proposed").length}{" "}
          proposed design/placement fields are excluded. Partially collected
          municipality/AHJ information remains incomplete.
        </p>
        <h3>Critical information needed</h3>
        <p>
          {missingCritical.map((d) => d.label).join(" · ")}
          {record.extraRequests.bills.status !== "Verified"
            ? " · Utility bills"
            : ""}
          {record.extraRequests.underground.status !== "Verified"
            ? " · Underground utility verification"
            : ""}
        </p>
      </section>
      <details className="full-intake" open>
        <summary className="intelligence-heading">
          <h2>Full Site Record</h2>
          <span>
            {FIELD_SCHEMA.length} substantive fields across {CATEGORIES.length}{" "}
            categories
          </span>
        </summary>
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
              aria-controls="intake-missing"
              onClick={() => setMode("missing")}
            >
              Missing information
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
        {mode === "fields" ? (
          <div id="intake-fields" role="tabpanel">
            {CATEGORIES.map((c) => {
              const stats = readiness(record, c.id);
              return (
                <details
                  className={`intake-category ${c.id === "design" ? "proposed-category" : ""}`}
                  key={`${c.id}:${accordion.version}`}
                  open={accordion.all}
                >
                  <summary>
                    <span>
                      {c.label}
                      {c.id === "design" ? " — proposed conditions" : ""}
                    </span>
                    <small>
                      {stats.populated} collected · {stats.missing} missing ·{" "}
                      {stats.awaitingVerification} awaiting verification
                    </small>
                  </summary>
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
                      (d) => d.category === c.id && d.condition === condition,
                    );
                    return defs.length ? (
                      <div className="intake-condition-group" key={condition}>
                        <h3>
                          {condition === "proposed"
                            ? "Proposed design / placement — excluded from existing-site readiness"
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
                                  <tr key={d.id}>
                                    <td>{d.label}</td>
                                    <td>
                                      <div
                                        className={`intake-value${d.id === "codes" ? " intake-code-value" : ""}`}
                                      >
                                        {d.id === "codes" &&
                                        Array.isArray(o?.value) ? (
                                          <ul className="code-reference-list">
                                            {o.value.map((entry, index) => (
                                              <li key={index}>
                                                {String(entry)}
                                              </li>
                                            ))}
                                          </ul>
                                        ) : o ? (
                                          valueText(o.value)
                                        ) : (
                                          "Not retrieved"
                                        )}
                                        {o &&
                                        typeof o.value !== "object" &&
                                        o.unit
                                          ? ` ${o.unit}`
                                          : ""}
                                      </div>
                                      {o?.complete === false && (
                                        <small>
                                          Partially collected — needs
                                          verification
                                        </small>
                                      )}
                                      {d.id === "elevation" &&
                                        onViewContours && (
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
                                      <span>
                                        {o?.provenance ?? "Not available"}
                                      </span>
                                      <small>{f.review.status}</small>
                                      <button
                                        type="button"
                                        className="text-link"
                                        onClick={() => setFieldId(d.id)}
                                      >
                                        Source & method
                                      </button>
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
        ) : (
          <div id="intake-missing" role="tabpanel">
            <MissingWorkflow
              record={record}
              update={update}
              onEvidence={setFieldId}
            />
          </div>
        )}
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
        <div className="legacy-intake-link">
          <label>
            Import observations from an existing saved record
            <select
              aria-label="Saved record to link"
              value={legacyId}
              onChange={(e) => setLegacyId(e.target.value)}
            >
              <option value="">Select the corresponding property</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.facilityName} · {s.address}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button"
            disabled={!legacyId}
            onClick={() => {
              const legacy = sites.find((s) => s.id === legacyId);
              if (legacy) update((r) => mergeLegacyRecord(r, legacy));
            }}
          >
            Link selected record
          </button>
        </div>
        <p>
          Confirm the saved record refers to this property before linking.
          Existing verified values are preserved; conflicting observations are
          retained.
        </p>
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
      {measurement && (
        <MetricEvidence
          metric={measurement}
          analysis={analysis}
          onClose={() => setMeasurement(null)}
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
