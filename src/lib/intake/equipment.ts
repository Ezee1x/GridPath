import type { JsonValue } from "./types";
/** Structured equipment evidence stays partial until its necessary ratings are supplied. Legacy text is retained unchanged. */
export function equipmentValueComplete(id: string, value: JsonValue): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return true;
  const number = (v: JsonValue | undefined) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0;
  if (id === "breaker")
    return number(value.mainBreakerAmps) && number(value.mainBusAmps);
  if (id === "availableCapacity")
    return (
      number(value.capacityKw) &&
      typeof value.basis === "string" &&
      !!value.basis.trim()
    );
  if (id === "breakerSpace")
    return (
      number(value.availableSpaces) &&
      typeof value.panelId === "string" &&
      !!value.panelId.trim()
    );
  if (id === "utilityPole")
    return (
      Array.isArray(value.poles) &&
      value.poles.length > 0 &&
      value.poles.every(
        (p) =>
          p &&
          typeof p === "object" &&
          !Array.isArray(p) &&
          typeof p.identifier === "string" &&
          !!p.identifier.trim(),
      )
    );
  if (id === "transformerCapacity")
    return (
      Array.isArray(value.transformers) &&
      value.transformers.length > 0 &&
      value.transformers.every(
        (t) =>
          t &&
          typeof t === "object" &&
          !Array.isArray(t) &&
          number(t.capacityKva) &&
          number(t.primaryVoltageV) &&
          number(t.secondaryVoltageV),
      )
    );
  if (id === "singleLine")
    return (
      typeof value.availability === "string" &&
      !!value.availability.trim() &&
      !/not received|unknown/i.test(value.availability)
    );
  if (id === "panelRating")
    return number(value.ratingAmps) && Number(value.ratingAmps) > 0;
  if (id === "meterModel")
    return typeof value.model === "string" && !!value.model.trim();
  if (id === "transformerId")
    return typeof value.equipmentId === "string" && !!value.equipmentId.trim();
  if (id === "meterId")
    return typeof value.identifier === "string" && !!value.identifier.trim();
  if (id === "poi")
    return (
      typeof value.existingPointReference === "string" &&
      !!value.existingPointReference.trim()
    );
  if (id === "phase") return value.phase === 1 || value.phase === 3;
  return Object.values(value).some((v) => v !== null && v !== "");
}
