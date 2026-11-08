"use client";
import { useState } from "react";
import type { IntakeRecord } from "@/lib/intake/types";
import { benchmarkSummary } from "@/lib/engineering/benchmark-summary";
import { readiness } from "@/lib/intake/model";
import { ACTIVE_FIELDS } from "@/lib/intake/schema";
export function CollectionBenchmark({
  record,
  update,
}: {
  record: IntakeRecord;
  update: (f: (r: IntakeRecord) => IntakeRecord) => void;
}) {
  const [message, setMessage] = useState("");
  const summary = benchmarkSummary(record);
  const counts = readiness(record),
    benchmark = record.collectionBenchmark;
  return (
    <details className="engineering-reference">
      <summary>Collection benchmark · measured activity</summary>
      <p>
        {benchmark
          ? `Started ${benchmark.startedAt}; ${benchmark.completedAt ? "last completed " + benchmark.completedAt : "collection in progress"}`
          : "Start a measured collection session; previous loaded data is not timed as live retrieval."}
      </p>
      <div className="button-row">
        <button
          className="button secondary"
          onClick={() =>
            update((r) => ({
              ...r,
              collectionBenchmark: {
                ...r.collectionBenchmark,
                startedAt:
                  r.collectionBenchmark?.startedAt ?? new Date().toISOString(),
                completedAt: null,
                requests: r.collectionBenchmark?.requests ?? [],
              },
            }))
          }
        >
          Start / resume measured session
        </button>
        <button
          className="text-link"
          disabled={!benchmark}
          onClick={() =>
            update((r) => ({
              ...r,
              collectionBenchmark: {
                ...r.collectionBenchmark!,
                completedAt: new Date().toISOString(),
              },
            }))
          }
        >
          Finish collection including review
        </button>
      </div>
      <p>
        {counts.populated} collected · {counts.evidence} source-backed ·{" "}
        {summary.missingCritical} critical missing ·{" "}
        {counts.awaitingVerification} need review.{" "}
        {benchmark?.requests.length ?? 0} measured source requests.
      </p>
      <p>
        Measured elapsed including review:{" "}
        {summary.elapsedIncludingReviewSeconds === null
          ? "Session not finished"
          : `${summary.elapsedIncludingReviewSeconds.toFixed(1)} seconds`}
        . No savings estimate is generated.
      </p>
      {benchmark?.requests.length ? (
        <ul>
          {benchmark.requests.map((r, i) => (
            <li key={i}>
              {r.source}: {r.status} · {(r.durationMs / 1000).toFixed(2)} s ·{" "}
              {r.startedAt}
            </li>
          ))}
        </ul>
      ) : null}
      <details>
        <summary>Record a comparable manual baseline</summary>
        <p>
          Select the same field set for both methods. Enter measured elapsed and
          review times; no time savings are assumed.
        </p>
        <form
          className="intake-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget),
              fieldIds = form.getAll("fields").map(String);
            const manualSeconds = Number(form.get("manual")),
              manualReviewSeconds = Number(form.get("manualReview")),
              automatedReviewSeconds = Number(form.get("autoReview"));
            if (
              !fieldIds.length ||
              [manualSeconds, manualReviewSeconds, automatedReviewSeconds].some(
                (n) => !Number.isFinite(n) || n < 0,
              )
            ) {
              setMessage("Select fields and valid measured nonnegative times.");
              return;
            }
            update((r) => ({
              ...r,
              collectionBenchmark: {
                startedAt:
                  r.collectionBenchmark?.startedAt ?? new Date().toISOString(),
                completedAt: r.collectionBenchmark?.completedAt ?? null,
                requests: r.collectionBenchmark?.requests ?? [],
                manualComparison: {
                  fieldIds,
                  manualSeconds,
                  manualReviewSeconds,
                  automatedReviewSeconds,
                  note: String(form.get("note")),
                },
              },
            }));
            setMessage(
              "Measured baseline saved; compare only equivalent outputs and review states.",
            );
          }}
        >
          <div className="benchmark-fields">
            {ACTIVE_FIELDS.map((d) => (
              <label key={d.id}>
                <input
                  name="fields"
                  type="checkbox"
                  value={d.id}
                  defaultChecked={benchmark?.manualComparison?.fieldIds.includes(
                    d.id,
                  )}
                />
                {d.label}
              </label>
            ))}
          </div>
          <label>
            Manual collection seconds
            <input name="manual" type="number" min="0" required />
          </label>
          <label>
            Manual review seconds
            <input name="manualReview" type="number" min="0" required />
          </label>
          <label>
            QoreSites review seconds
            <input name="autoReview" type="number" min="0" required />
          </label>
          <label>
            Method, operator and comparable output notes
            <textarea name="note" required />
          </label>
          <button className="button secondary">Save measured comparison</button>
        </form>
        {benchmark?.manualComparison && (
          <p>
            Baseline: {benchmark.manualComparison.fieldIds.length} identical
            target fields; manual collection{" "}
            {benchmark.manualComparison.manualSeconds}s + review{" "}
            {benchmark.manualComparison.manualReviewSeconds}s; QoreSites
            review {benchmark.manualComparison.automatedReviewSeconds}s.{" "}
            {benchmark.manualComparison.note}
          </p>
        )}
      </details>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
