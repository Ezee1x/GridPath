import {
  ACTIVE_FIELDS,
  PRIORITIES,
  type Priority,
  type FieldDefinition,
} from "./schema";
import { hasConflict, isPopulated, selectedObservation } from "./model";
import type { IntakeField, IntakeRecord } from "./types";
export type FieldView = "fields" | "missing" | "verification" | "conflicts";
export const effectivePriority = (
  definition: FieldDefinition,
  field: IntakeField,
): Priority => field.priority ?? definition.criticality;
export const applicable = (record: IntakeRecord, definition: FieldDefinition) =>
  ACTIVE_FIELDS.some((d) => d.id === definition.id) &&
  (definition.condition !== "proposed" || record.stage === "design");
export function actionReasons(
  record: IntakeRecord,
  definition: FieldDefinition,
  field: IntakeField,
): string[] {
  if (!applicable(record, definition)) return [];
  const reasons: string[] = [];
  if (!isPopulated(field)) reasons.push("Missing or incomplete value");
  if (field.request.status === "Requested")
    reasons.push("Information requested");
  if (field.request.status === "Received")
    reasons.push("Evidence received — review pending");
  if (
    field.request.status === "Under review" ||
    field.review.status === "Under review"
  )
    reasons.push("Under review");
  if (hasConflict(field)) reasons.push("Conflicting source records");
  if (
    Object.keys(field.rejectedObservations ?? {}).length &&
    !isPopulated(field)
  )
    reasons.push("Extracted value rejected");
  if (selectedObservation(field) && field.review.status !== "Engineer verified")
    reasons.push("Engineering verification required");
  return reasons;
}
export function verificationItems(record: IntakeRecord) {
  return ACTIVE_FIELDS.flatMap((definition) => {
    const field = record.fields.find((f) => f.id === definition.id)!;
    const reasons = actionReasons(record, definition, field);
    return reasons.length
      ? [
          {
            id: field.id,
            definition,
            field,
            priority: effectivePriority(definition, field),
            reasons,
          },
        ]
      : [];
  }).sort(
    (a, b) =>
      PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) ||
      a.definition.priority - b.definition.priority,
  );
}
export function fieldInView(
  record: IntakeRecord,
  definition: FieldDefinition,
  view: FieldView,
) {
  const field = record.fields.find((f) => f.id === definition.id)!;
  return (
    view === "fields" ||
    (view === "missing"
      ? applicable(record, definition) && !isPopulated(field)
      : view === "conflicts"
        ? applicable(record, definition) && hasConflict(field)
        : actionReasons(record, definition, field).length > 0)
  );
}
