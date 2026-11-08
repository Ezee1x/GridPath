import type { JsonValue } from "../intake/types";
const object = (v: JsonValue): v is Record<string, JsonValue> =>
  !!v && typeof v === "object" && !Array.isArray(v);
function attributes(
  value: JsonValue,
  allowed: Record<string, "text" | "number" | "nonnegative">,
) {
  if (!object(value) || !Object.keys(value).length) return false;
  return Object.entries(value).every(([key, v]) =>
    v === null
      ? Object.hasOwn(allowed, key)
      : allowed[key] === "text"
        ? typeof v === "string" && v.length <= 1000
        : allowed[key] === "number"
          ? typeof v === "number" && Number.isFinite(v) && v > 0
          : allowed[key] === "nonnegative"
            ? typeof v === "number" && Number.isFinite(v) && v >= 0
            : false,
  );
}
const textFields = {
  manufacturer: "text",
  model: "text",
  evidencePageOrRegion: "text",
} as const;
export function validDocumentValue(id: string, value: JsonValue): boolean {
  if (id === "voltage")
    return (
      (typeof value === "number" && Number.isFinite(value) && value > 0) ||
      (typeof value === "string" && /^\d{2,5}(?:\/\d{2,5})?$/.test(value))
    );
  if (id === "serviceAmperage")
    return typeof value === "number" && Number.isFinite(value) && value > 0;
  if (id === "phase")
    return (
      value === 1 ||
      value === 3 ||
      attributes(value, {
        phase: "number",
        serviceWireCount: "number",
        evidencePageOrRegion: "text",
      })
    );
  if (id === "panelRating")
    return (
      (typeof value === "number" && Number.isFinite(value) && value > 0) ||
      attributes(value, { ...textFields, ratingAmps: "number" })
    );
  if (id === "breaker")
    return attributes(value, {
      equipmentId: "text",
      mainBreakerAmps: "number",
      mainBusAmps: "number",
    });
  if (id === "breakerSpace")
    return attributes(value, {
      panelId: "text",
      availableSpaces: "nonnegative",
      compatibleBreakerType: "text",
    });
  if (id === "transformerId")
    return attributes(value, {
      equipmentId: "text",
      manufacturer: "text",
      modelOrCatalogNumber: "text",
      documentedLocation: "text",
      evidencePageOrRegion: "text",
    });
  if (id === "transformerCapacity")
    return (
      object(value) &&
      Object.keys(value).length === 1 &&
      Array.isArray(value.transformers) &&
      value.transformers.length > 0 &&
      value.transformers.length <= 20 &&
      value.transformers.every((t) =>
        attributes(t, {
          equipmentId: "text",
          manufacturer: "text",
          modelOrCatalogNumber: "text",
          capacityKva: "number",
          primaryVoltageV: "number",
          secondaryVoltageV: "number",
          phase: "number",
          impedancePercent: "nonnegative",
          documentedLocation: "text",
          evidencePageOrRegion: "text",
        }),
      )
    );
  if (id === "meterModel")
    return attributes(value, {
      ...textFields,
      visibleElectricalRating: "text",
    });
  if (id === "meterId")
    return attributes(value, {
      identifier: "text",
      documentedLocation: "text",
      evidencePageOrRegion: "text",
    });
  if (id === "utilityPole")
    return (
      object(value) &&
      Object.keys(value).length === 1 &&
      Array.isArray(value.poles) &&
      value.poles.length > 0 &&
      value.poles.length <= 30 &&
      value.poles.every((p) =>
        attributes(p, {
          identifier: "text",
          utility: "text",
          sourceReference: "text",
        }),
      )
    );
  if (id === "room")
    return (
      typeof value === "string" &&
      value.trim().length > 0 &&
      value.length <= 1000
    );
  if (id === "poi")
    return (
      (typeof value === "string" &&
        value.trim().length > 0 &&
        value.length <= 1000) ||
      attributes(value, { ctCabinet: "text", existingPointReference: "text" })
    );
  if (id === "singleLine")
    return attributes(value, {
      availability: "text",
      revision: "text",
      documentReference: "text",
    });
  return false;
}
