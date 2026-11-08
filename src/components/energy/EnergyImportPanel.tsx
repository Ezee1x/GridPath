"use client";
import { useEffect, useRef, useState } from "react";
import type { IntakeRecord } from "@/lib/intake/types";
import type { EnergyPreview } from "@/lib/energy/types";
import { acceptEnergy } from "@/lib/energy/record";
import { prepareCustomerEnergy } from "@/lib/energy/upload";
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
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  async function analyze() {
    if (!file || busy) return;
    const siteKey = record.siteKey;
    setBusy(true);
    setMessage("");
    try {
      const prepared = await prepareCustomerEnergy(record, file);
      if (!active.current) return;
      for (const [key, bytes] of prepared.bytes) files.set(key, bytes);
      update((current) => {
        if (current.siteKey !== siteKey)
          throw Error("Site changed; upload the file for this site again.");
        return prepared.energy
          ? acceptEnergy(current, prepared.energy, prepared.source)
          : {
              ...current,
              sources: {
                ...current.sources,
                [prepared.source.key]: prepared.source,
              },
              updatedAt: new Date().toISOString(),
            };
      });
      setMessage(
        prepared.error
          ? `File saved in Additional files. ${prepared.error} No values were filled.`
          : prepared.energy?.synthetic
            ? "Sample analyzed. Consumption, demand and interval results appear in empty fields below as Sample data. Original saved in Additional files."
            : "Analysis complete. Consumption, maximum demand and interval data added where possible. Values still need verification. Original saved in Additional files.",
      );
      setFile(null);
      if (input.current) input.current.value = "";
    } catch (error) {
      if (active.current)
        setMessage(error instanceof Error ? error.message : "Analysis failed.");
    } finally {
      if (active.current) setBusy(false);
    }
  }
  const shown = record.energyImports?.at(-1);
  return (
    <details className="engineering-reference">
      <summary>Import Electricity Data</summary>
      <div className="button-row" style={{ marginTop: 12 }}>
        <input
          ref={input}
          type="file"
          accept=".csv,.xml"
          aria-label="Upload customer energy file"
          hidden
          disabled={busy}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setMessage("");
          }}
        />
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          Upload file
        </button>
        {file && <span>{file.name}</span>}
        <button
          type="button"
          className="button"
          disabled={!file || busy}
          onClick={() => void analyze()}
        >
          {busy ? "Analyzing…" : "Analyze file"}
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      {!message && shown?.classification === "Modeled / synthetic" && (
        <p>
          Sample results appear in empty fields below. Real site values are
          preserved.
        </p>
      )}
      {shown && (
        <details>
          <summary>Analysis results · {shown.fileName}</summary>
          <p>
            {shown.classification} ·{" "}
            {shown.totalKwh.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}{" "}
            kWh · maximum observed {shown.maximumObservedKw.toFixed(2)} kW
          </p>
          <p>
            {shown.coverageStart} → {shown.coverageEnd} · {shown.timezone}
          </p>
          <EnergyChart preview={shown} />
          {shown.warnings.length > 0 && (
            <ul>
              {shown.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </details>
      )}
    </details>
  );
}
