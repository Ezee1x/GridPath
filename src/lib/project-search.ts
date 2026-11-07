import { SiteRecord } from "./types";
export function findProjects(sites: SiteRecord[], query: string): SiteRecord[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return sites
    .filter((site) => {
      const haystack = [
        site.facilityName,
        site.address,
        site.location.municipality,
        ...site.dataFields
          .filter((field) => field.id === "region")
          .map((field) => field.value),
      ]
        .join(" ")
        .toLocaleLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, 6);
}
