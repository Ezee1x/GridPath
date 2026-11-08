"use client";
import { useEffect, useRef, useState } from "react";
import { Download, RotateCw, X } from "lucide-react";
import type { SelectedAddress } from "@/lib/maps/address";
import type { GisFeature } from "@/lib/gis/types";
import type { AnalysisMetric, SiteAnalysis } from "@/lib/gis/analysis-types";
const qualityLabels = {
  "source-backed": "Source-backed",
  estimated: "Estimated",
  missing: "Missing",
  "needs verification": "Needs verification",
};
const valueLabel = (v: { value: number; unit: string }) =>
  `${v.value.toLocaleString(undefined, { maximumFractionDigits: v.unit === "acres" ? 3 : 1 })} ${v.unit}`;
export function MetricEvidence({
  metric,
  analysis,
  onClose,
}: {
  metric: AnalysisMetric;
  analysis: SiteAnalysis;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="evidence-dialog analysis-evidence"
      aria-label="Measurement sources and method"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="gis-section-heading">
        <span className="eyebrow">Measurement evidence</span>
        <button
          type="button"
          className="icon-button"
          aria-label="Close measurement evidence"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <h2>{metric.label}</h2>
      <span className="badge">{qualityLabels[metric.quality]}</span>
      <p>
        {metric.textValue ??
          metric.values?.map(valueLabel).join(" · ") ??
          "Not available"}
      </p>
      <h3>Calculation / retrieval method</h3>
      <p>{metric.method}</p>
      <small>Record projection (geometry-derived values only)</small>
      <code className="analysis-projection">
        {analysis.coordinateMethod.definition}
      </code>
      {metric.notes.map((note) => (
        <p key={note}>{note}</p>
      ))}
      <h3>MassGIS source references</h3>
      {metric.sources.map((key) => {
        const s = analysis.sources[key];
        return s ? (
          <section className="analysis-source" key={key}>
            <a
              href={
                s.featureId
                  ? `${s.serviceUrl}/${encodeURIComponent(s.featureId)}`
                  : s.serviceUrl
              }
              target="_blank"
              rel="noreferrer"
            >
              {s.dataset} ↗
            </a>
            <dl className="location-details">
              <div>
                <dt>Original feature ID</dt>
                <dd>
                  {s.featureId ?? "Not available — dataset reference only"}
                </dd>
              </div>
              <div>
                <dt>Feature name</dt>
                <dd>{s.featureName ?? "Not available"}</dd>
              </div>
              <div>
                <dt>Record data date</dt>
                <dd>{s.recordDate ?? "Not available"}</dd>
              </div>
              <div>
                <dt>Service data update</dt>
                <dd>{s.datasetUpdated?.slice(0, 10) ?? "Not available"}</dd>
              </div>
              <div>
                <dt>Retrieved</dt>
                <dd>{s.retrievedAt ?? "Not retrieved"}</dd>
              </div>
            </dl>
          </section>
        ) : null;
      })}
      <p className="muted">
        Service updates are not observation dates for every feature. Public GIS
        records and calculated values remain subject to engineering review.
      </p>
    </dialog>
  );
}
function MetricRow({
  metric,
  onInspect,
}: {
  metric: AnalysisMetric;
  onInspect: (m: AnalysisMetric) => void;
}) {
  return (
    <button
      className="analysis-metric"
      type="button"
      onClick={() => onInspect(metric)}
      aria-label={`Inspect sources for ${metric.label}`}
    >
      <span className="analysis-metric-heading">
        <span>{metric.label}</span>
        <span className="badge">{qualityLabels[metric.quality]}</span>
      </span>
      <strong>
        {metric.values
          ?.filter((v) => v.unit !== "m²" && v.unit !== "m")
          .map(valueLabel)
          .join(" · ") ?? "Not available"}
      </strong>
      <small>Sources & method ↗</small>
    </button>
  );
}
export function SiteAnalysisPanel({
  address,
  parcelId,
  manual,
  candidates,
  ready,
  onSelectParcel,
}: {
  address: SelectedAddress | null;
  parcelId: string | null;
  manual: boolean;
  candidates: GisFeature[];
  ready: boolean;
  onSelectParcel: (id: string) => void;
}) {
  const [record, setRecord] = useState<SiteAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [inspected, setInspected] = useState<AnalysisMetric | null>(null);
  useEffect(() => {
    if (!address || !ready) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      lat: String(address.latitude),
      lng: String(address.longitude),
      address: address.formattedAddress,
      layer: "analysis",
    });
    if (parcelId) params.set("parcelId", parcelId);
    if (manual) params.set("selection", "manual");
    fetch(`/api/gis/site?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error ?? "Site analysis could not be retrieved.",
          );
        if (!controller.signal.aborted) {
          setRecord(data);
          setError(null);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Site analysis unavailable.",
          );
      });
    return () => controller.abort();
  }, [address, parcelId, manual, ready, attempt]);
  function refresh() {
    setRecord(null);
    setError(null);
    setInspected(null);
    setAttempt((a) => a + 1);
  }
  function exportData() {
    if (!record) return;
    const payload = {
      ...record,
      query: {
        ...record.query,
        addressSource: address
          ? {
              provider: address.source,
              placeId: address.placeId,
              retrievedAt: address.retrievedAt,
            }
          : null,
      },
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "QoreSites_Site_Data.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <details className="site-analysis-panel" open>
      <summary>
        <span>Site Analysis</span>
        <span className="analysis-summary-state">
          {record
            ? "Preliminary site record"
            : error
              ? "Needs attention"
              : "Geographic measurements"}
        </span>
      </summary>
      <div className="site-analysis-content">
        <p className="analysis-address">
          {address?.formattedAddress ??
            "Select a Massachusetts address to analyze public site data."}
        </p>
        {address && (
          <>
            <label className="input-label" htmlFor="analysis-parcel-choice">
              Parcel ID / manual selection
            </label>
            <select
              id="analysis-parcel-choice"
              value={parcelId ?? ""}
              onChange={(e) => {
                if (e.target.value) onSelectParcel(e.target.value);
              }}
            >
              <option value="">Choose the intended parcel</option>
              {candidates.map((f) => (
                <option key={f.properties.id} value={f.properties.id}>
                  {String(
                    f.properties.attributes.MAP_PAR_ID ??
                      f.properties.attributes.LOC_ID ??
                      f.properties.id,
                  )}{" "}
                  · {f.properties.name} · feature {f.properties.id}
                </option>
              ))}
            </select>
          </>
        )}
        {record ? (
          <>
            <div className="analysis-match">
              <span className="badge">Needs verification</span>
              <p>
                {record.parcel.featureId
                  ? `${record.parcel.selection === "manual" ? "Manually selected" : "Suggested"} parcel ${record.parcel.parcelId ?? `feature ${record.parcel.featureId}`} · ${record.parcel.recordAddress}`
                  : "Parcel could not be confidently matched. Manual selection required."}
              </p>
              <small>
                Point inside parcel:{" "}
                {record.parcel.pointContained === null
                  ? "Not available"
                  : record.parcel.pointContained
                    ? "Yes"
                    : "No"}{" "}
                · Street-address agreement:{" "}
                {record.parcel.addressMatches === null
                  ? "Not available"
                  : record.parcel.addressMatches
                    ? "Yes"
                    : "No"}
              </small>
              <button
                type="button"
                className="text-link"
                onClick={() =>
                  setInspected({
                    id: "parcel-match",
                    label: "Parcel identification evidence",
                    textValue:
                      record.parcel.parcelId ??
                      (record.parcel.featureId
                        ? `Original feature ID ${record.parcel.featureId}`
                        : "No parcel selected"),
                    values: null,
                    quality: "needs verification",
                    sources: record.parcel.sources,
                    method: record.parcel.method,
                    notes: [
                      `Original feature ID: ${record.parcel.featureId ?? "Not available"}; parcel identifier field: ${record.parcel.parcelIdentifierField ?? "Not available"}`,
                      `Point containment: ${record.parcel.pointContained ?? "Not available"}; normalized address agreement: ${record.parcel.addressMatches ?? "Not available"}.`,
                      "Manual selection identifies a candidate association; it does not verify it.",
                    ],
                  })
                }
              >
                Parcel source & matching method ↗
              </button>
              <p className="analysis-caution">
                A map/address match supports identification; it does not verify
                legal boundaries or engineering suitability.
              </p>
            </div>
            <div className="analysis-metrics">
              {Object.values(record.metrics).map((m) => (
                <MetricRow metric={m} key={m.id} onInspect={setInspected} />
              ))}
            </div>
            {record.nearestRoad && (
              <p className="analysis-caption">
                Nearest returned road: {record.nearestRoad.name} · feature{" "}
                {record.nearestRoad.featureId}. Inspect proximity above for its
                source.
              </p>
            )}
            <details className="analysis-buildings">
              <summary>
                Individual roofprints ({record.buildings.length})
              </summary>
              <div>
                {record.buildings.map((b) => (
                  <section key={b.id}>
                    <h4>{b.name}</h4>
                    <p>{b.association}</p>
                    <MetricRow metric={b.area} onInspect={setInspected} />
                    <MetricRow
                      metric={b.boundaryDistance}
                      onInspect={setInspected}
                    />
                  </section>
                ))}
              </div>
            </details>
            <section className="analysis-readiness">
              <h3>Engineering data readiness</h3>
              <p>
                Electrical evidence required for this geographic record. GIS
                does not establish electrical capacity.
              </p>
              {record.electricalReadiness.map((r) => (
                <details key={r.id}>
                  <summary>
                    <span>{r.label}</span>
                    <span className="badge">Missing</span>
                  </summary>
                  <p>{r.reason}</p>
                  <p>
                    <strong>Required evidence:</strong> {r.requiredEvidence}
                  </p>
                  <small>
                    Source: customer / utility documentation, not MassGIS. No
                    document or feature ID has been supplied for this
                    requirement.
                  </small>
                </details>
              ))}
            </section>
            <details className="analysis-quality">
              <summary>Data quality, coverage & methods</summary>
              <p>
                Source-backed values come from reported public fields. Estimated
                values use mapped geometry. Missing values have no reliable
                input. Needs verification flags incomplete coverage or uncertain
                associations.
              </p>
              {record.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
              {Object.entries(record.coverage).map(([k, c]) => (
                <section key={k}>
                  <strong>
                    {k}: {c.retrieved ? "Public records retrieved" : "Missing"}
                  </strong>
                  {c.error && <p>{c.error}</p>}
                  {c.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </section>
              ))}
              <p>{record.coordinateMethod.method}</p>
            </details>
            <button
              type="button"
              className="button primary analysis-export"
              onClick={exportData}
            >
              <Download size={15} />
              Export Site Data
            </button>
          </>
        ) : (
          <p role={error ? "alert" : "status"} className="analysis-loading">
            {error ??
              (address
                ? ready
                  ? "Calculating geographic measurements…"
                  : "Waiting for public GIS records…"
                : "No site selected.")}
          </p>
        )}
        {address && (
          <button
            type="button"
            className="text-link"
            onClick={refresh}
            disabled={!ready || (!record && !error)}
          >
            <RotateCw size={12} />
            Refresh analysis
          </button>
        )}
        {inspected && record && (
          <MetricEvidence
            metric={inspected}
            analysis={record}
            onClose={() => setInspected(null)}
          />
        )}
        <p className="analysis-caution">
          Remaining land is unassessed mapped space. Engineering review and
          electrical documentation are required.
        </p>
      </div>
    </details>
  );
}
