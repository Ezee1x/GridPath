import { publicAddressLocation } from "../gis/public-address";
import type { PublishedRate, UtilityRateResult } from "./types";
export const OPENEI_URL = "https://api.openei.org/utility_rates";
const documentation =
  "https://apps.openei.org/services/doc/rest/util_rates/?version=7";
function date(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000).toISOString()
    : null;
}
export function normalizeRate(
  row: Record<string, unknown>,
  at: string,
): PublishedRate | null {
  if (
    typeof row.label !== "string" ||
    !row.label ||
    typeof row.utility !== "string" ||
    !["Commercial", "Industrial"].includes(String(row.sector))
  )
    return null;
  const structure = JSON.parse(JSON.stringify(row));
  delete structure.api_key;
  return {
    label: row.label,
    utility: row.utility,
    name: String(row.name ?? row.label),
    sector: String(row.sector),
    startDate: date(row.startdate),
    endDate: date(row.enddate),
    sourceUrl: `https://apps.openei.org/USURDB/rate/view/${encodeURIComponent(row.label)}`,
    retrievedAt: at,
    structure,
    status: "Candidate published tariff",
  };
}
async function fetchRates(input: {
  siteKey: string;
  address: string;
  label?: string;
  utility?: string;
}): Promise<UtilityRateResult> {
  const started = Date.now(),
    retrievedAt = new Date().toISOString();
  const base = {
    siteKey: input.siteKey,
    address: input.address,
    retrievedAt,
    sourceUrl: documentation,
    durationMs: 0,
    candidates: [],
  };
  if (!process.env.OPENEI_API_KEY)
    return {
      ...base,
      status: "configuration-required",
      message:
        "Configure the server-side OPENEI_API_KEY to search published tariffs. Customer bill intake and other site sources remain available.",
    };
  try {
    let rows: Record<string, unknown>[] = [];
    let partial = false;
    if (input.label) {
      rows = await query({ getpage: input.label, detail: "full", limit: "1" });
    } else {
      const point = await publicAddressLocation(input.address);
      const parameters = {
        lat: String(point.latitude),
        lon: String(point.longitude),
        radius: "0",
        limit: "50",
        detail: "minimal",
        country: "USA",
        ...(input.utility ? { ratesforutility: input.utility } : {}),
      };
      const results = await Promise.allSettled(
        ["Commercial", "Industrial"].map((sector) =>
          query({ ...parameters, sector }),
        ),
      );
      partial = results.some((r) => r.status === "rejected");
      for (const result of results)
        if (result.status === "fulfilled") rows.push(...result.value);
      if (results.every((r) => r.status === "rejected"))
        throw Error("Published rate source unavailable.");
    }
    const candidates = [
      ...new Map(
        rows
          .map((r) => normalizeRate(r, retrievedAt))
          .filter((r): r is PublishedRate => !!r)
          .map((r) => [r.label, r]),
      ).values(),
    ];
    return {
      ...base,
      status: "available",
      durationMs: Date.now() - started,
      candidates,
      message: `${candidates.length} candidate commercial/industrial tariff records. Geographic coverage does not establish actual meter service or eligibility. Results capped at 50 per sector; confirm effective dates and customer bill.${partial ? " One sector request failed; this candidate list is incomplete." : ""}`,
    };
  } catch {
    return {
      ...base,
      status: "unavailable",
      durationMs: Date.now() - started,
      message:
        "OpenEI could not return rates. Check server configuration or retry later; no tariff absence or customer eligibility is inferred.",
    };
  }
}
async function query(parameters: Record<string, string>) {
  const q = new URLSearchParams({
    version: "7",
    format: "json",
    api_key: process.env.OPENEI_API_KEY!,
    ...parameters,
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(`${OPENEI_URL}?${q}`, {
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
    if (!response.ok) {
      if (attempt === 0 && response.status >= 500) continue;
      throw Error("OpenEI request failed.");
    }
    const raw = await response.text();
    if (raw.length > 8_000_000) throw Error("Rate response exceeds limits.");
    const data = JSON.parse(raw);
    if (!Array.isArray(data.items) || data.errors?.length)
      throw Error("OpenEI response incomplete.");
    return data.items as Record<string, unknown>[];
  }
  return [];
}

const rateCache = new Map<
  string,
  { expires: number; result: UtilityRateResult }
>();
const inFlight = new Map<string, Promise<UtilityRateResult>>();
export async function utilityRates(input: {
  siteKey: string;
  address: string;
  label?: string;
  utility?: string;
}): Promise<UtilityRateResult> {
  const key = JSON.stringify(input),
    cached = rateCache.get(key);
  if (process.env.OPENEI_API_KEY && cached && cached.expires > Date.now())
    return {
      ...cached.result,
      cacheHit: true,
      durationMs: 0,
      message: `Cached published response retrieved ${cached.result.retrievedAt}. ${cached.result.message}`,
    };
  const pending = inFlight.get(key);
  if (pending) return pending;
  if (inFlight.size >= 4)
    return {
      siteKey: input.siteKey,
      address: input.address,
      status: "unavailable",
      message: "Published rate searches are busy. Retry shortly.",
      retrievedAt: new Date().toISOString(),
      sourceUrl: documentation,
      durationMs: 0,
      candidates: [],
    };
  const promise = fetchRates(input)
    .then((result) => {
      if (result.status === "available") {
        if (rateCache.size >= 64)
          rateCache.delete(rateCache.keys().next().value!);
        rateCache.set(key, { expires: Date.now() + 300000, result });
      }
      return result;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}
