"use client";
import { useState } from "react";
import type { IntakeRecord } from "@/lib/intake/types";
import type { EnergyPreview } from "@/lib/energy/types";
import { parseEnergy } from "@/lib/energy/parse";
import { acceptEnergy } from "@/lib/energy/record";
import { prepareFieldFiles } from "@/lib/intake/file-evidence";
function EnergyChart({ preview }: { preview: EnergyPreview }) {
  const readings = preview.readings,
    step = Math.max(1, Math.ceil(readings.length / 300)),
    points = readings.filter(
      (_, i) => i % step === 0 || i === readings.length - 1,
    ),
    max = Math.max(1, ...readings.map((r) => r[3])),
    start = readings[0][0],
    span = Math.max(1, readings.at(-1)![0] - start);
  return (
    <figure>
      <svg
        viewBox="0 0 720 160"
        role="img"
        aria-label={`Interval-average demand, maximum ${max.toFixed(1)} kW. ${preview.coverageStart} to ${preview.coverageEnd}. Gaps are not filled.`}
      >
        <line x1="40" y1="130" x2="710" y2="130" stroke="currentColor" />
        <text x="4" y="16" fontSize="12">
          {max.toFixed(1)} kW
        </text>
        {points.map((r, i) => {
          const x = 40 + ((r[0] - start) / span) * 660,
            y = 130 - (r[3] / max) * 105;
          return (
            <circle key={i} cx={x} cy={y} r="2" fill="#326b60">
              <title>
                {new Date(r[0] * 1000).toISOString()}: {r[3].toFixed(2)} kW
              </title>
            </circle>
          );
        })}
      </svg>
      <figcaption>
        Interval-average kW · {points.length} displayed points of{" "}
        {readings.length}; no interpolation across gaps. Full readings remain in
        JSON.
      </figcaption>
    </figure>
  );
}
export function EnergyImportPanel({
  record,
  files,
  update,
}: {
  record: IntakeRecord;
  files: Map<string, File>;
  update: (fn: (r: IntakeRecord) => IntakeRecord) => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [timezone, setTimezone] = useState("America/New_York"),
    [preview, setPreview] = useState<EnergyPreview | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [modeled, setModeled] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function inspect() {
    setBusy(true);
    setPreview(null);
    setConfirmed(false);
    try {
      if (!file || file.size > 8_000_000)
        throw Error("Choose a CSV or Green Button XML file under 8 MB.");
      setPreview(parseEnergy(await file.text(), file.name, timezone));
      setMessage(
        "Review coverage, timezone, units and quality before acceptance.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }
  async function accept() {
    if (!preview || !file || !confirmed) return;
    const key = record.siteKey;
    setBusy(true);
    try {
      const prepared = await prepareFieldFiles(
        record,
        "interval",
        [file],
        `Customer electricity data; ${modeled ? "modeled/synthetic" : "actual customer supplied"}; units and timezone reviewed.`,
      );
      const source = Object.values(prepared.sources)[0];
      for (const [key, bytes] of prepared.bytes) files.set(key, bytes);
      update((r) => {
        if (r.siteKey !== key)
          throw Error("Site changed; select the file again.");
        return acceptEnergy(
          r,
          {
            ...preview,
            id: source.fileHash!,
            siteKey: key,
            sourceKey: source.key,
            fileHash: source.fileHash!,
            fileName: file.name,
            acceptedAt: new Date().toISOString(),
            classification: modeled
              ? "Modeled / synthetic"
              : "Customer supplied",
          },
          source,
        );
      });
      setMessage(
        modeled
          ? "Modeled import retained separately; it does not populate actual facility usage."
          : "Customer import accepted with source file and quality warnings; engineer verification remains pending.",
      );
      setPreview(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Acceptance failed.");
    } finally {
      setBusy(false);
    }
  }
  const shown = preview ?? record.energyImports?.at(-1);
  return (
    <details className="engineering-reference">
      <summary>Import Electricity Data</summary>
      <p>
        CSV: start, duration_seconds (or duration_minutes), energy_kwh (or
        energy_wh); optional demand_kw. ISO timestamps with explicit offsets are
        preferred. XML supports one linked electric-import incremental-energy
        channel, not utility account authorization.
      </p>
      <label>
        Customer energy file
        <input
          type="file"
          accept=".csv,.xml"
          aria-label="Customer energy file"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
            setConfirmed(false);
          }}
        />
      </label>
      <label>
        Display/monthly grouping and timezone for CSV timestamps without offsets
        <select
          value={timezone}
          onChange={(e) => {
            setTimezone(e.target.value);
            setPreview(null);
            setConfirmed(false);
          }}
        >
          <option>America/New_York</option>
          <option>UTC</option>
        </select>
      </label>
      <button
        className="button secondary"
        disabled={!file || busy}
        onClick={() => void inspect()}
      >
        Preview electricity data
      </button>
      {message && <p role="status">{message}</p>}
      {shown && (
        <>
          <p>
            <strong>
              {"classification" in shown
                ? String(shown.classification)
                : "Preview — file not yet accepted"}
            </strong>
          </p>
          <EnergyChart preview={shown} />
          <p>
            {shown.coverageStart} → {shown.coverageEnd} ·{" "}
            {shown.totalKwh.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}{" "}
            kWh · maximum observed {shown.maximumObservedKw.toFixed(2)} kW
          </p>
          <p>
            {shown.demandBasis}. Intervals: {shown.durationsSeconds.join(", ")}{" "}
            seconds; missing intervals{" "}
            {shown.missingIntervals ?? "indeterminate for irregular durations"};
            duplicates {shown.duplicates}.
          </p>
          <ul>
            {shown.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <details>
            <summary>Monthly consumption</summary>
            <ul>
              {shown.monthlyKwh.map((m) => (
                <li key={m.month}>
                  {m.month}: {m.kwh.toFixed(2)} kWh
                </li>
              ))}
            </ul>
            <small>
              Intervals spanning a month boundary are apportioned by duration,
              not assumed billing periods.
            </small>
          </details>
        </>
      )}
      {preview && (
        <>
          <label>
            <input
              type="checkbox"
              checked={modeled}
              onChange={(e) => setModeled(e.target.checked)}
            />{" "}
            This is modeled/synthetic data (including ComStock), not actual
            facility consumption.
          </label>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{" "}
            I confirm this file belongs to {record.identity.address} and
            reviewed the units, timezone and period.
          </label>
          <button
            className="button"
            disabled={busy || !confirmed || preview.blocking}
            onClick={() => void accept()}
          >
            Accept reviewed electricity data
          </button>
        </>
      )}
      <small>
        ComStock is an optional external test-data source only; no modeled data
        is downloaded or assigned to this facility automatically.
      </small>
    </details>
  );
}
