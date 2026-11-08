import { validDocumentValue } from "./schema";
import type { DocumentCandidate } from "./candidates";
import type { IntakeRecord, JsonValue } from "../intake/types";
import {
  mergeCollectedFields,
  observationId,
  isMeasuredValue,
  rejectObservation,
} from "../intake/model";
import { equipmentValueComplete } from "../intake/equipment";
export function reviewDocumentCandidate(
  record: IntakeRecord,
  sourceKey: string,
  candidate: DocumentCandidate,
  decision: "Pending" | "Accepted" | "Edited" | "Rejected",
  condition: "existing" | "proposed" | "unknown",
  editedValue: JsonValue = candidate.value,
) {
  if (
    !record.sources[sourceKey]?.fileHash ||
    !sourceKey.startsWith(`input:${record.siteKey}:`)
  )
    throw Error("Document source does not belong to this site.");
  if (record.sources[sourceKey].referenceOnly && condition === "existing")
    throw Error(
      "Reference-only documents cannot establish existing site conditions. Attach independently confirmed site evidence instead.",
    );
  if (
    !record.fields.some((f) => f.id === candidate.fieldId) ||
    !isMeasuredValue(editedValue) ||
    !validDocumentValue(
      candidate.fieldId,
      decision === "Edited" ? editedValue : candidate.value,
    )
  )
    throw Error("Invalid candidate field or value.");
  if (
    (decision === "Accepted" || decision === "Edited") &&
    condition !== "existing"
  )
    throw Error(
      "Only confirmed existing-condition candidates can populate existing site fields. Retain proposed/unknown material as references.",
    );
  const at = new Date().toISOString(),
    method = `${candidate.method} Page/image ${candidate.page}; excerpt: ${candidate.quote}. Classification: ${condition}. Decision: ${decision}.`,
    originalId = observationId(
      candidate.fieldId,
      candidate.value,
      "Document extraction",
      [sourceKey],
      candidate.method + condition,
      candidate.unit,
    );
  const base = {
    id: originalId,
    value: candidate.value,
    unit: candidate.unit,
    originalUnits: candidate.unit,
    provenance: "Customer document" as const,
    provider: "Document extraction",
    sourceKeys: [sourceKey],
    method: `${candidate.method} Page/image ${candidate.page}; excerpt: ${candidate.quote}.`,
    confidence: "Estimated" as const,
    observedAt: at,
    complete: equipmentValueComplete(candidate.fieldId, candidate.value),
    autoSelect: false,
    condition,
    extraction: {
      page: candidate.page,
      quote: candidate.quote,
      originalValue: candidate.value,
      decision: "Pending" as const,
      at,
    },
  };
  let next = mergeCollectedFields(
    record,
    [{ fieldId: candidate.fieldId, observation: base }],
    {},
  );
  if (decision === "Rejected")
    return rejectObservation(
      next,
      candidate.fieldId,
      originalId,
      "Document intake reviewer",
      "Rejected during candidate review; original file and text retained.",
    );
  const accepted = decision === "Accepted" || decision === "Edited";
  const id =
    decision === "Edited"
      ? observationId(
          candidate.fieldId,
          editedValue,
          "Document review",
          [sourceKey],
          method,
          candidate.unit,
        )
      : originalId;
  if (
    accepted &&
    record.fields.find((f) => f.id === candidate.fieldId)
      ?.rejectedObservations?.[originalId]
  )
    throw Error(
      "Previously rejected candidate: review its retained history before using a new observation.",
    );
  if (decision === "Edited")
    next = mergeCollectedFields(
      next,
      [
        {
          fieldId: candidate.fieldId,
          observation: {
            ...base,
            id,
            value: editedValue,
            provider: "Document review",
            method,
            complete: equipmentValueComplete(candidate.fieldId, editedValue),
            extraction: { ...base.extraction, decision: "Edited" },
          },
        },
      ],
      {},
    );
  return {
    ...next,
    fields: next.fields.map((f) => {
      if (f.id !== candidate.fieldId) return f;
      const prior = record.fields.find((x) => x.id === f.id)!;
      const protect = prior.review.status === "Engineer verified";
      return {
        ...f,
        observations: f.observations.map((o) =>
          o.id === id && !(protect && prior.selectedId === id)
            ? {
                ...o,
                condition,
                extraction: { ...base.extraction, decision },
                method,
              }
            : o,
        ),
        selectedId: accepted && !protect ? id : f.selectedId,
        pinned: accepted && !protect ? true : f.pinned,
        review:
          accepted && !protect
            ? {
                status: "Under review" as const,
                reviewer: null,
                at: null,
                note: "Document candidate accepted; engineering verification remains required.",
              }
            : f.review,
        reviewHistory:
          accepted && !protect && prior.selectedId !== id
            ? [
                ...(f.reviewHistory ?? []),
                { observationId: prior.selectedId, review: prior.review },
              ]
            : f.reviewHistory,
        rejectedObservations:
          decision === "Edited"
            ? {
                ...f.rejectedObservations,
                [originalId]: {
                  reviewer: "Document intake reviewer",
                  note: "Superseded by explicit edit; original extraction retained.",
                  at,
                },
              }
            : f.rejectedObservations,
        request:
          accepted && !protect
            ? { ...f.request, status: "Under review" as const }
            : f.request,
      };
    }),
  };
}
