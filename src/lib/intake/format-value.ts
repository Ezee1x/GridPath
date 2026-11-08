import type { JsonValue } from "./types";
export function valueText(value: JsonValue): string {
  if (value === null) return "Not retrieved";
  if (typeof value !== "object") return String(value);
  if (!Array.isArray(value)) {
    if (
      typeof value.totalKwh === "number" &&
      typeof value.coverageStart === "string"
    )
      return `${value.totalKwh.toLocaleString(undefined, { maximumFractionDigits: 2 })} kWh · ${value.coverageStart.slice(0, 10)}–${String(value.coverageEnd).slice(0, 10)}`;
    if (
      Array.isArray(value.durationsSeconds) &&
      typeof value.readings === "number"
    )
      return `${value.readings.toLocaleString()} readings · ${value.durationsSeconds.join(" / ")} s intervals · ${String(value.coverageStart).slice(0, 10)}–${String(value.coverageEnd).slice(0, 10)}`;
    if (typeof value.rateLabel === "string")
      return `${value.name} · ${value.utility} · ${value.status}`;
    if ("demandratestructure" in value || "flatdemandstructure" in value)
      return "Published tiered / seasonal demand-charge structure — see Source & method";
    if (
      "energyweekdayschedule" in value ||
      "energyweekendschedule" in value ||
      "energyratestructure" in value
    )
      return "Published energy / time-of-use structure — see Source & method";

    if ("mainBreakerAmps" in value || "mainBusAmps" in value)
      return `Main breaker: ${value.mainBreakerAmps ?? "Not retrieved"} A · Main bus: ${value.mainBusAmps ?? "Not retrieved"} A`;
    if (Array.isArray(value.transformers))
      return value.transformers
        .map((t) =>
          t && typeof t === "object" && !Array.isArray(t)
            ? `${t.equipmentId || "Transformer"}: ${t.capacityKva ?? "Not retrieved"} kVA · ${t.primaryVoltageV ?? "?"}/${t.secondaryVoltageV ?? "?"} V · ${t.phase ?? "?"} phase`
            : String(t),
        )
        .join("; ");
    if ("capacityKw" in value)
      return `${value.capacityKw ?? "Not retrieved"} kW available · ${value.basis || "Basis requires verification"}`;
    if (Array.isArray(value.poles))
      return value.poles
        .map((p) =>
          p && typeof p === "object" && !Array.isArray(p)
            ? `${p.identifier || "Identifier not retrieved"}${p.utility ? ` · ${p.utility}` : ""}`
            : String(p),
        )
        .join("; ");
    if ("availableSpaces" in value)
      return `${value.panelId || "Panel"}: ${value.availableSpaces ?? "Not retrieved"} available breaker spaces · ${value.compatibleBreakerType || "Compatibility not verified"}`;
    if ("availability" in value)
      return `${value.availability}${value.revision ? ` · revision ${value.revision}` : ""}${value.documentReference ? ` · ${value.documentReference}` : ""}`;
  }
  if (!Array.isArray(value) && value.kind === "terrain-elevation") {
    const n = (v: JsonValue) =>
      typeof v === "number"
        ? v.toLocaleString(undefined, { maximumFractionDigits: 1 })
        : "Not retrieved";
    return `≈ ${n(value.medianFeet)} ft ground (median) · sampled ${n(value.minimumFeet)}–${n(value.maximumFeet)} ft · range ${n(value.rangeFeet)} ft`;
  }
  if (!Array.isArray(value) && value.kind === "candidate-jurisdiction")
    return `${String(value.municipality)} · Candidate municipal building jurisdiction; authority verification required. Fire jurisdiction not confirmed.`;
  if (!Array.isArray(value) && typeof value.municipality === "string") {
    const municipality = value.municipality
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
    const jurisdiction = value.authorityHavingJurisdiction;
    return `${municipality} · ${typeof jurisdiction === "string" && jurisdiction.trim() ? jurisdiction : "Jurisdiction not confirmed"}`;
  }
  if (
    !Array.isArray(value) &&
    typeof value.description === "string" &&
    typeof value.useCode === "string"
  )
    return `${value.description} (use code ${value.useCode})`;
  if (!Array.isArray(value) && typeof value.assessorZoning === "string")
    return `${value.assessorZoning} · Municipal confirmation required`;
  if (
    !Array.isArray(value) &&
    typeof value.latitude === "number" &&
    typeof value.longitude === "number"
  ) {
    return `${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}`;
  }
  if (Array.isArray(value)) {
    if (
      value.every(
        (v) =>
          typeof v === "object" && v !== null && "value" in v && "unit" in v,
      )
    )
      return value
        .map((v) => {
          const m = v as { value: number; unit: string };
          return `${m.value.toLocaleString(undefined, { maximumFractionDigits: m.unit === "acres" ? 3 : 1 })} ${m.unit}`;
        })
        .join(" · ");
    return value.map((v) => valueText(v)).join("; ");
  }
  return Object.entries(value)
    .map(
      ([key, item]) =>
        `${key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ")}: ${valueText(item)}`,
    )
    .join(" · ");
}
