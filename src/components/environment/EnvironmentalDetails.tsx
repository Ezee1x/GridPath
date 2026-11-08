import type { EnvironmentBundle } from "@/lib/environment/types";
export function EnvironmentalDetails({
  bundle,
  fieldId,
}: {
  bundle: EnvironmentBundle | undefined;
  fieldId: string;
}) {
  const data =
    fieldId === "flood"
      ? bundle?.flood
      : fieldId === "wetlands"
        ? bundle?.wetlands
        : fieldId === "elevation"
          ? bundle?.elevation
          : null;
  if (!data) return null;
  return (
    <section className="analysis-source">
      <h3>Current environmental source result</h3>
      <p>
        {data.status === "error"
          ? "Current request failed. Any earlier observations remain separately dated."
          : data.status === "no-data"
            ? "Source coverage unavailable or unconfirmed; this is not an absence finding."
            : "Public source retrieved; engineering verification pending."}
      </p>
      {data.error && <p>{data.error}</p>}
      <p>{data.method}</p>
      {data.kind === "flood" && (
        <>
          <p>
            Coverage: {data.coverage} · source response{" "}
            {data.complete ? "complete" : "incomplete"}.
          </p>
          <p>
            Mapped special flood-hazard overlap:{" "}
            {data.specialHazardOverlapSquareFeet === null
              ? "Not retrieved"
              : `${data.specialHazardOverlapSquareFeet.toFixed(1)} sq ft`}
            .
          </p>
          {data.effectivePanels.map((p) => (
            <p key={String(p.OBJECTID)}>
              FIRM panel {String(p.FIRM_PAN ?? p.DFIRM_ID)} · effective{" "}
              {typeof p.EFF_DATE === "number"
                ? new Date(p.EFF_DATE).toISOString().slice(0, 10)
                : "Not available"}
            </p>
          ))}
        </>
      )}
      {data.kind === "wetlands" && (
        <p>
          Query buffer: {data.radiusMeters} m · {data.features.length} returned
          mapped resource features · source response{" "}
          {data.complete ? "complete" : "incomplete"}.
        </p>
      )}
      {data.kind === "elevation" && (
        <>
          <p>
            Contour method: {data.contours.method ?? "Not retrieved"} ·{" "}
            {data.contours.intervalFeet} ft interval ·{" "}
            {data.contours.features.length} line features.
          </p>
          {data.raster && (
            <p>
              Raster: {data.raster.width} × {data.raster.height} · EPSG:
              {data.raster.epsg} ·{" "}
              {data.raster.pixelSizeMeters.map((v) => v.toFixed(2)).join(" × ")}{" "}
              m cells · {data.raster.pixelType} · NoData{" "}
              {data.raster.noData ?? "not specified"} ·{" "}
              {data.raster.verticalDatum}.
            </p>
          )}
          {data.summary && (
            <p>
              {data.summary.validSamples.toLocaleString()} valid pixel centers
              of {data.summary.parcelSamples.toLocaleString()} sampled in the
              parcel; {(data.summary.validCoverageFraction * 100).toFixed(1)}%
              valid coverage in{" "}
              {data.summary.completeParcelExtent
                ? "the parcel extent"
                : "a partial parcel extent"}
              .
            </p>
          )}
          {data.contours.error && <p>{data.contours.error}</p>}
        </>
      )}
      {data.warnings.map((w) => (
        <p key={w}>{w}</p>
      ))}
      <details>
        <summary>Current source records and retrieval</summary>
        {Object.values(data.sources).map((s) => (
          <p key={s.key}>
            <a href={s.serviceUrl} target="_blank" rel="noreferrer">
              {s.dataset} · {s.featureId ?? "dataset"} ↗
            </a>
            <br />
            Data date: {s.recordDate ?? s.datasetUpdated ?? "Not available"} ·
            retrieved {s.retrievedAt ?? "Not available"}
          </p>
        ))}
      </details>
    </section>
  );
}
