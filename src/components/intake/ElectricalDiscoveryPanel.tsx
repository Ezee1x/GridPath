"use client";
import { useEffect, useRef, useState } from "react";
import { selectedObservation } from "@/lib/intake/model";
import { applyElectricalDiscovery } from "@/lib/electrical/record";
import type { IntakeRecord } from "@/lib/intake/types";
import type { ElectricalDiscovery } from "@/lib/electrical/types";
export function ElectricalDiscoveryPanel({
  record,
  update,
  files,
  onField,
}: {
  record: IntakeRecord;
  update: (fn: (r: IntakeRecord) => IntakeRecord) => void;
  files: Map<string, File>;
  onField: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), [record.siteKey]);
  const discovery = record.electricalDiscovery;
  async function find() {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const field = record.fields.find((f) => f.id === "address");
      const address = field && selectedObservation(field);
      // Re-geocode on the server using Census; never send Google coordinates.
      const inputAddress =
        typeof address?.value === "string"
          ? address.value
          : record.identity.address;
      if (
        !inputAddress ||
        inputAddress === "Address available in active Maps session"
      )
        throw Error(
          "Select an address and retrieve its public property record first.",
        );
      const response = await fetch("/api/electrical/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: active.signal,
        body: JSON.stringify({
          siteKey: record.siteKey,
          address: inputAddress,
          parcelFeatureId: record.identity.parcelFeatureId,
          parcelId: record.analysis?.parcel.parcelId,
          townId: record.propertyIdentification?.townId,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(
          result.error ?? "Electrical public sources are unavailable.",
        );
      if (!active.signal.aborted)
        update((r) =>
          applyElectricalDiscovery(r, result as ElectricalDiscovery, files),
        );
    } catch (e) {
      if (!active.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Electrical discovery failed. Retry the search.",
        );
    } finally {
      if (!active.signal.aborted) setBusy(false);
    }
  }
  return (
    <section
      className="electrical-discovery"
      aria-label="Electrical data discovery"
    >
      <div className="electrical-discovery-heading">
        <div>
          <h3>Available electrical data</h3>
          <p>
            Search official territory and supported permit records, and check
            this site’s attached evidence.
          </p>
        </div>
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => void find()}
        >
          {busy
            ? "Searching public sources…"
            : "Find Available Electrical Data"}
        </button>
      </div>
      {busy && (
        <p role="status">
          Looking up municipality-level providers and supported municipal
          records. Existing values and evidence remain available.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {discovery && (
        <>
          <p role="status">
            Public electrical-data search finished. Review candidate findings
            and outstanding customer requests.
          </p>
          <small>
            Retrieved {new Date(discovery.retrievedAt).toLocaleString()} ·{" "}
            {discovery.municipality ?? "Municipality not resolved"}
          </small>
          {discovery.utilityCandidates.map((candidate) => (
            <p key={candidate.sourceKey}>
              <strong>{candidate.name}</strong> · Candidate municipality
              coverage (TOWN_ID {candidate.townId}, record {candidate.recordId}
              ). Confirm with the facility bill.{" "}
              <a
                className="text-link"
                href={record.sources[candidate.sourceKey]?.serviceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Official provider record ↗
              </a>
            </p>
          ))}
          <details>
            <summary>Source coverage & limitations</summary>
            {discovery.adapters.map((a) => (
              <p key={a.adapter}>
                <strong>
                  {a.adapter} · {a.status}
                </strong>
                <br />
                {a.message}{" "}
                {a.sourceUrl && (
                  <a
                    className="text-link"
                    href={a.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Official source ↗
                  </a>
                )}
              </p>
            ))}
          </details>
          {discovery.permits.length > 0 && (
            <details>
              <summary>
                Public electrical permits ({discovery.permits.length}) —
                installation unconfirmed
              </summary>
              {discovery.permits.map((p) => (
                <section className="electrical-permit" key={p.id}>
                  <a
                    className="text-link"
                    href={p.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {p.id} ↗
                  </a>
                  <p>
                    {p.category} · issued{" "}
                    {p.issuedDate?.slice(0, 10) ?? "date unavailable"} · source
                    status {p.status}
                  </p>
                  <p>{p.description}</p>
                  <small>
                    {p.condition}. {p.documentAvailability}. Filing date not
                    exposed. {p.matchingMethod}
                  </small>
                </section>
              ))}
            </details>
          )}
          <details>
            <summary>
              Facility information requests ({discovery.customerRequests.length}
              )
            </summary>
            <p>
              Use existing records and safely accessible exterior labels. Do not
              open energized cabinets, remove covers or approach restricted
              utility equipment. Internal inspection belongs to qualified
              electricians or authorized personnel.
            </p>
            <button
              type="button"
              className="text-link"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    discovery.customerRequests
                      .map((r) => `${r.label} (${r.owner}): ${r.request}`)
                      .join("\n\n"),
                  );
                  setCopied(true);
                } catch {
                  setError(
                    "Copy unavailable. Select the request text below to copy it manually.",
                  );
                }
              }}
            >
              {copied ? "Requests copied" : "Copy customer requests"}
            </button>
            <ul>
              {discovery.customerRequests.map((r) => (
                <li key={r.fieldId}>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => onField(r.fieldId)}
                  >
                    {r.label}
                  </button>{" "}
                  · {r.owner}
                  <p>{r.request}</p>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
