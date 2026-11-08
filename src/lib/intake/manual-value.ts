import { FIELD_SCHEMA } from "./schema";
import { equipmentValueComplete } from "./equipment";
import {
  isMeasuredValue,
  mergeCollectedFields,
  observationId,
  reviewField,
  selectedObservation,
} from "./model";
import type { IntakeRecord, JsonValue } from "./types";

export function verifyManualValue(
  record: IntakeRecord,
  input: {
    siteKey: string;
    fieldId: string;
    value: JsonValue;
    unit: string;
    reviewer: string;
    note: string;
    expectedObservationId: string | null;
  },
) {
  if (record.siteKey !== input.siteKey)
    throw Error("The site changed. Reopen this field in the intended record.");
  const definition = FIELD_SCHEMA.find((d) => d.id === input.fieldId);
  const field = record.fields.find((f) => f.id === input.fieldId);
  if (!definition || !field)
    throw Error("This field is not available in this record.");
  if (field.selectedId !== input.expectedObservationId)
    throw Error(
      "This field changed while you were editing. Cancel and reopen it to review the latest value.",
    );
  if (!input.reviewer.trim())
    throw Error("Enter your name to verify this value.");
  if (!isMeasuredValue(input.value))
    throw Error(
      "Enter a value before verifying. Missing or unknown values cannot be verified.",
    );
  if (!equipmentValueComplete(input.fieldId, input.value))
    throw Error("Complete the required equipment values before verifying.");
  const at = new Date().toISOString();
  const method = `Value entered and explicitly verified by ${input.reviewer.trim()}. User attestation; not independently verified against an external document.${input.note.trim() ? " " + input.note.trim() : ""}`;
  const sourceKey = `manual:${record.siteKey}:${input.fieldId}:${at}`;
  const source = {
    key: sourceKey,
    provider: "User supplied",
    dataset: "User-entered value and verification",
    serviceUrl: "",
    featureId: null,
    featureName: definition.label,
    recordDate: at,
    datasetUpdated: null,
    retrievedAt: at,
    documentId: sourceKey,
    matchingMethod: method,
    originalRecord: {
      value: input.value,
      unit: input.unit || null,
      reviewer: input.reviewer.trim(),
      note: input.note.trim(),
    },
  };
  const id = observationId(
    input.fieldId,
    input.value,
    "User supplied",
    [sourceKey],
    method,
    input.unit || null,
  );
  const merged = mergeCollectedFields(
    record,
    [
      {
        fieldId: input.fieldId,
        observation: {
          id,
          value: input.value,
          unit: input.unit || null,
          originalUnits: input.unit || null,
          provider: "User supplied",
          provenance: "User supplied",
          sourceKeys: [sourceKey],
          method,
          confidence: "User supplied",
          observedAt: at,
          condition: definition.condition,
          complete: true,
          autoSelect: false,
        },
      },
    ],
    { [sourceKey]: source },
  );
  const previous = selectedObservation(field);
  const changed = {
    ...merged,
    fields: merged.fields.map((f) =>
      f.id !== input.fieldId
        ? f
        : {
            ...f,
            selectedId: id,
            pinned: true,
            reviewHistory: [
              ...(f.reviewHistory ?? []),
              { observationId: field.selectedId, review: field.review },
            ],
            rejectedObservations: {
              ...f.rejectedObservations,
              ...(previous &&
              JSON.stringify(previous.value) !== JSON.stringify(input.value)
                ? {
                    [previous.id]: {
                      reviewer: input.reviewer.trim(),
                      note: "Superseded by explicitly verified user entry. Original observation retained.",
                      at,
                    },
                  }
                : {}),
            },
            review: {
              status: "Unreviewed" as const,
              reviewer: null,
              at: null,
              note: "",
            },
          },
    ),
  };
  return reviewField(changed, input.fieldId, input.reviewer, method);
}
