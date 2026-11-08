"use client";
import { RateStructure } from "./RateStructure";
import { useEffect, useRef, useState } from "react";
import type { IntakeRecord } from "@/lib/intake/types";
import { discoveryAddress } from "@/lib/electrical/record";
import { applyRates, retainRate } from "@/lib/rates/record";
import type { PublishedRate } from "@/lib/rates/types";
export function UtilityRatesPanel({
  record,
  update,
  onField,
}: {
  record: IntakeRecord;
  update: (fn: (r: IntakeRecord) => IntakeRecord) => void;
  onField: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [detail, setDetail] = useState<PublishedRate | null>(null),
    [bill, setBill] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const ran = useRef(""),
    latest = useRef(record);
  useEffect(() => {
    latest.current = record;
  }, [record]);
  const address = discoveryAddress(record);
  const rates = record.utilityRates;
  async function search(label?: string) {
    if (!address) return;
    const key = record.siteKey;
    setBusy(true);
    try {
      const response = await fetch("/api/rates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteKey: key, address, label }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      if (latest.current.siteKey !== key) return;
      if (label) {
        setDetail(result.candidates[0] ?? null);
        if (result.candidates[0])
          update((r) =>
            r.utilityRates
              ? {
                  ...r,
                  utilityRates: {
                    ...r.utilityRates,
                    candidates: r.utilityRates.candidates.map((c) =>
                      c.label === label ? result.candidates[0] : c,
                    ),
                  },
                }
              : r,
          );
        setMessage(result.message);
      } else update((r) => applyRates(r, result));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Rate lookup failed.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (address && !rates && ran.current !== record.siteKey) {
      ran.current = record.siteKey;
      void search();
    }
  }, [address, record.siteKey, rates]); // eslint-disable-line react-hooks/exhaustive-deps
  const bills = (
    record.fields.find((f) => f.id === "utilityBills")?.evidenceKeys ?? []
  ).filter(
    (k) => record.sources[k]?.fileHash && !record.sources[k].referenceOnly,
  );
  return (
    <details className="engineering-reference">
      <summary>Utility and published tariff candidates</summary>
      <p>
        {rates?.message ??
          "Select and analyze a Massachusetts address to search published commercial/industrial tariffs."}
      </p>
      <button
        className="button secondary"
        disabled={busy || !address}
        onClick={() => void search()}
      >
        {busy ? "Searching…" : "Search / retry published rates"}
      </button>
      {message && <p role="status">{message}</p>}
      <ul>
        {rates?.candidates.map((rate) => (
          <li key={rate.label}>
            <strong>{rate.name}</strong>
            <p>
              {rate.utility} · {rate.sector} · Candidate published tariff ·{" "}
              {rate.startDate?.slice(0, 10) ?? "Start date not supplied"} to{" "}
              {rate.endDate?.slice(0, 10) ?? "No end date supplied"}
            </p>
            <button
              className="text-link"
              onClick={() => {
                setDetail(null);
                setBill("");
                setConfirmed(false);
                void search(rate.label);
              }}
            >
              Rate details and eligibility
            </button>
          </li>
        ))}
      </ul>
      {detail && (
        <section className="tariff-details">
          <h3>{detail.name}</h3>
          <a
            className="text-link"
            href={detail.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            Published source ↗
          </a>
          <p>
            Confirm utility, tariff code, service voltage, demand tier, dates
            and eligibility against the customer&apos;s bill and current utility
            publication. Charges, periods and ratchets are retained together.
          </p>
          <RateStructure structure={detail.structure} />
          <details>
            <summary>Full published rate structure</summary>
            <pre>{JSON.stringify(detail.structure, null, 2)}</pre>
          </details>
          <button
            className="button secondary"
            onClick={() => {
              try {
                update((r) => retainRate(r, detail));
                setMessage(
                  "Candidate retained in Source & method; customer tariff remains unconfirmed.",
                );
              } catch (e) {
                setMessage(String(e));
              }
            }}
          >
            Retain unconfirmed candidate
          </button>
          <label>
            Customer bill evidence
            <select
              value={bill}
              onChange={(e) => {
                setBill(e.target.value);
                setConfirmed(false);
              }}
            >
              <option value="">Attach/select a utility bill first</option>
              {bills.map((key) => (
                <option key={key} value={key}>
                  {record.sources[key].fileName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{" "}
            I compared the utility and rate code with this bill and checked
            eligibility and effective dates.
          </label>
          <button
            className="button"
            disabled={!bill || !confirmed}
            onClick={() => {
              try {
                update((r) => retainRate(r, detail, bill));
                setMessage(
                  "Customer-confirmed tariff recorded; engineering review remains required.",
                );
              } catch (e) {
                setMessage(String(e));
              }
            }}
          >
            Record customer tariff confirmation
          </button>
          <button className="text-link" onClick={() => onField("tariff")}>
            Review field and provenance
          </button>
        </section>
      )}
    </details>
  );
}
