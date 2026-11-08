import type { JsonValue } from "./types";

// ROAD_CLASS coded-value domain from the MassGIS Roads FeatureServer.
export const ROAD_CLASS_LABELS: Record<string, string> = {
  "1": "Major controlled-access road",
  "2": "Major road",
  "3": "Collector road",
  "4": "Neighborhood connector",
  "5": "Local road",
  "6": "Path, bikeway or walkway",
  "7": "Driveway",
  "8": "Common drive",
  "9": "Access road",
  "0": "Ferry",
};
export function roadName(name: string) {
  const cleaned = name.trim().replace(/\s+/g, " ");
  return cleaned === cleaned.toUpperCase()
    ? cleaned
        .toLowerCase()
        .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    : cleaned;
}
export function roadNames(value: JsonValue): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string"))
    return null;
  return [
    ...new Set(value.map((item) => roadName(item as string)).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
}
export function roadClassGroups(value: JsonValue) {
  if (
    !Array.isArray(value) ||
    !value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        typeof item.road === "string" &&
        typeof item.sourceClassificationCode === "string",
    )
  )
    return null;
  const groups = new Map<string, Set<string>>();
  for (const item of value) {
    const road = item as { road: string; sourceClassificationCode: string };
    const code = road.sourceClassificationCode.trim();
    const names = groups.get(code) ?? new Set<string>();
    names.add(roadName(road.road));
    groups.set(code, names);
  }
  return [...groups]
    .map(([code, names]) => ({
      code,
      label:
        ROAD_CLASS_LABELS[code] ??
        `Unrecognized class (${code || "not supplied"})`,
      names: [...names].filter(Boolean).sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}
