import { SiteRecord } from "./types";
import { BRAND } from "./brand";
export function readiness(site: SiteRecord) {
  const fields = site.dataFields.filter(
    (f) => f.required && f.conditionType !== "proposed",
  );
  const populated = fields.filter(
    (f) => f.value !== null && f.value !== "",
  ).length;
  return {
    total: fields.length,
    populated,
    percent: Math.round((populated / Math.max(1, fields.length)) * 100),
    missing: fields.length - populated,
    supported: fields.filter(
      (f) => f.sourceIds.length > 0 && f.confidence === "Documented",
    ).length,
    review: fields.filter(
      (f) => f.value !== null && f.status !== "Engineer verified",
    ).length,
    conflicts: site.dataFields.filter(
      (f) => f.status === "Conflicting evidence",
    ).length,
    outstanding: site.missingRequirements.filter((r) => r.status !== "Verified")
      .length,
    critical: site.missingRequirements.filter(
      (r) => r.priority === "Critical" && r.status !== "Verified",
    ).length,
  };
}
export function exportRecord(site: SiteRecord) {
  return JSON.stringify(
    {
      schemaVersion: "1.0",
      application: BRAND.name,
      productDescription: BRAND.subtitle,
      exportedAt: new Date().toISOString(),
      disclaimer:
        "Intake record only. Completeness does not indicate technical feasibility, code compliance, or installation approval. Source files are not embedded. Sample references are based on the supplied brief, not independently inspected documents.",
      readiness: readiness(site),
      ...site,
    },
    null,
    2,
  );
}
export function downloadRecord(site: SiteRecord) {
  const url = URL.createObjectURL(
    new Blob([exportRecord(site)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${BRAND.exportPrefix}-${site.id}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(value));
