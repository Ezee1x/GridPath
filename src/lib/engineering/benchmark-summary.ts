import { readiness, isPopulated, selectedObservation } from "../intake/model";
import { ACTIVE_FIELDS } from "../intake/schema";
import type { IntakeRecord } from "../intake/types";
export function benchmarkSummary(record: IntakeRecord) {
  const b = record.collectionBenchmark,
    counts = readiness(record);
  const fields = b?.manualComparison?.fieldIds ?? [];
  const comparison = fields.map((id) => {
    const f = record.fields.find((f) => f.id === id);
    return {
      fieldId: id,
      populated: !!f && isPopulated(f),
      reviewStatus: f?.review.status ?? "Missing",
      hasSource: !!f && !!selectedObservation(f)?.sourceKeys.length,
    };
  });
  const start = b ? Date.parse(b.startedAt) : NaN,
    end = b?.completedAt ? Date.parse(b.completedAt) : NaN;
  return {
    ...b,
    counts,
    attemptedSources:
      b?.requests.filter(
        (r) =>
          (r.status !== "configuration-required" &&
            r.status !== "unavailable" &&
            r.status !== "cached") ||
          r.durationMs > 0,
      ).length ?? 0,
    successfulSourceOperations:
      b?.requests.filter((r) =>
        ["ready", "available", "found"].includes(r.status),
      ).length ?? 0,
    missingCritical: ACTIVE_FIELDS.filter(
      (d) =>
        d.criticality === "Critical" &&
        !isPopulated(record.fields.find((f) => f.id === d.id)!),
    ).length,
    elapsedIncludingReviewSeconds:
      Number.isFinite(start) && Number.isFinite(end) && end >= start
        ? (end - start) / 1000
        : null,
    fixedComparisonFields: comparison,
    comparisonComplete:
      comparison.length > 0 &&
      comparison.every(
        (f) => f.populated && f.reviewStatus === "Engineer verified",
      ),
    timeSavingsClaim: null,
    note: "Elapsed time is measured only for tracked activity. Cached/pre-existing data is not reported as newly retrieved. Compare identical outputs and review states; no savings are inferred automatically.",
  };
}
