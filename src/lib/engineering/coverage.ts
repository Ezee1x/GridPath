import { benchmarkSummary } from "./benchmark-summary";
import { ENGINEERING_REQUIREMENTS, ENGINEERING_REFERENCES } from "./library";
import { isPopulated, hasConflict } from "../intake/model";
import { ACTIVE_FIELDS } from "../intake/schema";
import type { IntakeRecord } from "../intake/types";
export function requirementCoverage(record: IntakeRecord) {
  return ENGINEERING_REQUIREMENTS.map((requirement) => {
    const fields = requirement.fieldIds
      .map((id) => record.fields.find((f) => f.id === id)!)
      .filter(Boolean);
    const missing = fields.filter((f) => !isPopulated(f)).map((f) => f.id),
      conflicting = fields.filter(hasConflict).map((f) => f.id);
    const received = fields.some(
      (f) =>
        f.evidenceKeys?.some((key) => !record.sources[key]?.referenceOnly) ||
        f.observations.some(
          (o) =>
            o.condition !== "proposed" &&
            o.sourceKeys.some(
              (key) =>
                !!record.sources[key] && !record.sources[key].referenceOnly,
            ),
        ),
    );
    const verified =
      fields.length > 0 &&
      fields.every(
        (f) => isPopulated(f) && f.review.status === "Engineer verified",
      );
    return {
      ...requirement,
      missingFieldIds: missing,
      collectedFieldIds: fields.filter(isPopulated).map((f) => f.id),
      sourceKeys: [
        ...new Set(
          fields.flatMap((f) => [
            ...(f.evidenceKeys ?? []),
            ...f.observations.flatMap((o) => o.sourceKeys),
          ]),
        ),
      ],
      status:
        requirement.stage !== "Initial site intake"
          ? "Downstream — applicability review required"
          : conflicting.length
            ? "Conflicting"
            : verified
              ? "Verified"
              : missing.length
                ? received
                  ? "Evidence received — incomplete"
                  : "Missing"
                : "Needs review",
      conflictingFieldIds: conflicting,
    };
  });
}
export function informationRequest(record: IntakeRecord) {
  const items = ACTIVE_FIELDS.flatMap((d) => {
    const f = record.fields.find((f) => f.id === d.id)!;
    return isPopulated(f)
      ? []
      : [
          {
            fieldId: d.id,
            label: d.label,
            reason: d.reason,
            owner: f.request.owner,
            priority: f.priority ?? d.criticality,
            request:
              d.id === "utilityBills" || d.id === "tariff" || d.id === "utility"
                ? "Please provide a recent electricity bill identifying the utility and applicable rate schedule."
                : d.id === "singleLine"
                  ? "Please upload the latest existing electrical single-line diagram."
                  : d.id === "interval"
                    ? "Please provide available interval electricity data with timestamp offsets, interval durations and units."
                    : d.category === "electrical"
                      ? `Please provide existing documentation for ${d.label.toLowerCase()}. Use existing records or photographs obtained by authorized qualified personnel.`
                      : `Please provide available records confirming ${d.label.toLowerCase()}.`,
          },
        ];
  });
  return {
    siteKey: record.siteKey,
    address: record.identity.address,
    generatedAt: new Date().toISOString(),
    items,
    safety:
      "Use existing documents where possible. Do not open energized panels, access restricted utility equipment, or take unsafe measurements.",
  };
}
export function engineeringExport(record: IntakeRecord) {
  return {
    requirements: requirementCoverage(record),
    engineeringReferences: ENGINEERING_REFERENCES,
    informationRequest: informationRequest(record),
    benchmark: benchmarkSummary(record),
  };
}
