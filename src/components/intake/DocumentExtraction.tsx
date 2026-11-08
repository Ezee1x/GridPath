"use client";
import { appendActivities } from "@/lib/engineering/activity";
import { useEffect, useRef, useState } from "react";
import type { DocumentCandidate } from "@/lib/documents/candidates";
import type { IntakeRecord, JsonValue } from "@/lib/intake/types";
import { reviewDocumentCandidate } from "@/lib/documents/review";
import { FIELD_SCHEMA } from "@/lib/intake/schema";
function CandidateReview({
  candidate,
  sourceKey,
  referenceOnly = false,
  update,
}: {
  candidate: DocumentCandidate;
  sourceKey: string;
  referenceOnly?: boolean;
  update: (fn: (r: IntakeRecord) => IntakeRecord) => void;
}) {
  const [value, setValue] = useState(
      typeof candidate.value === "object"
        ? JSON.stringify(candidate.value, null, 2)
        : String(candidate.value),
    ),
    [condition, setCondition] = useState<"existing" | "proposed" | "unknown">(
      referenceOnly ? "proposed" : "unknown",
    ),
    [message, setMessage] = useState("");
  function decide(decision: "Accepted" | "Edited" | "Rejected" | "Pending") {
    try {
      let parsed: JsonValue = value;
      try {
        parsed = JSON.parse(value);
      } catch {
        /* explicit text */
      }
      update((r) =>
        reviewDocumentCandidate(
          r,
          sourceKey,
          candidate,
          decision,
          condition,
          parsed,
        ),
      );
      setMessage(
        decision === "Accepted" || decision === "Edited"
          ? "Accepted for field review; verified selections preserved."
          : decision === "Rejected"
            ? "Rejected; original extraction retained."
            : "Reference retained without selecting a value.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Review failed.");
    }
  }
  return (
    <li>
      <strong>
        {FIELD_SCHEMA.find((d) => d.id === candidate.fieldId)?.label} ·
        Estimated extraction
      </strong>
      <p>
        Page/image {candidate.page}: “{candidate.quote}”
      </p>
      <label>
        Candidate value
        <textarea
          aria-label={`Candidate ${candidate.fieldId} page ${candidate.page}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <label>
        Document conditions
        <select
          value={condition}
          onChange={(e) => setCondition(e.target.value as typeof condition)}
        >
          <option value="unknown">Unknown / not checked</option>
          <option value="existing" disabled={referenceOnly}>
            Confirmed existing equipment for this site
          </option>
          <option value="proposed">Proposed / generic reference sample</option>
        </select>
      </label>
      <div className="button-row">
        <button
          className="text-link"
          disabled={condition !== "existing"}
          onClick={() => decide("Accepted")}
        >
          Accept original
        </button>
        <button
          className="text-link"
          disabled={condition !== "existing"}
          onClick={() => decide("Edited")}
        >
          Accept edited value
        </button>
        <button className="text-link" onClick={() => decide("Rejected")}>
          Reject
        </button>
        <button className="text-link" onClick={() => decide("Pending")}>
          Retain as reference
        </button>
      </div>
      {message && <p role="status">{message}</p>}
    </li>
  );
}
export function DocumentExtraction({
  file,
  sourceKey,
  referenceOnly = false,
  update,
}: {
  file: File;
  sourceKey: string;
  referenceOnly?: boolean;
  update: (fn: (r: IntakeRecord) => IntakeRecord) => void;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [candidates, setCandidates] = useState<DocumentCandidate[]>([]),
    [ocrScanned, setOcrScanned] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), [sourceKey]);
  async function extract() {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    const startedAt = new Date().toISOString(),
      began = performance.now();
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("ocrScanned", String(ocrScanned));
      const response = await fetch("/api/documents/extract", {
        method: "POST",
        body,
        signal: active.signal,
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      if (active.signal.aborted) return;
      update((r) =>
        appendActivities(r, [
          {
            source: "Local document text/OCR extraction",
            startedAt,
            durationMs: performance.now() - began,
            status: "ready",
          },
        ]),
      );
      setCandidates(result.candidates);
      setMessage(result.message);
    } catch (e) {
      if (!active.signal.aborted)
        setMessage(e instanceof Error ? e.message : "Extraction failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="document-extraction">
      <summary>Extract and review electrical evidence</summary>
      <p>
        {file.name} is processed locally on this application server. No private
        document is sent to a cloud vision provider. Generic/proposed plan
        samples cannot populate existing facility conditions.
      </p>
      {/\.pdf$/i.test(file.name) && (
        <label>
          <input
            type="checkbox"
            checked={ocrScanned}
            onChange={(e) => setOcrScanned(e.target.checked)}
          />{" "}
          Use local OCR for scanned/low-text PDF pages (up to three pages per
          run). Unprocessed pages require manual review.
        </label>
      )}
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={() => void extract()}
      >
        {busy ? "Extracting…" : "Extract candidates"}
      </button>
      {busy && (
        <button
          type="button"
          className="text-link"
          onClick={() => {
            controller.current?.abort();
            setBusy(false);
            setMessage("Extraction cancelled. Original file remains attached.");
          }}
        >
          Cancel extraction
        </button>
      )}
      <p role="status">{message}</p>
      <ul>
        {candidates.map((candidate, i) => (
          <CandidateReview
            key={`${sourceKey}:${i}:${JSON.stringify(candidate.value)}`}
            candidate={candidate}
            sourceKey={sourceKey}
            referenceOnly={referenceOnly}
            update={update}
          />
        ))}
      </ul>
      <p>
        Machine-readable PDF text and local image OCR are supported. Unlabelled
        or unreadable equipment ratings require manual transcription in Source
        &amp; method. OCR can misread labels.
      </p>
    </details>
  );
}
