import type { JsonValue } from "../intake/types";
export interface PublishedRate {
  label: string;
  utility: string;
  name: string;
  sector: string;
  startDate: string | null;
  endDate: string | null;
  sourceUrl: string;
  retrievedAt: string;
  structure: Record<string, JsonValue>;
  status: "Candidate published tariff";
}
export interface UtilityRateResult {
  siteKey: string;
  address: string;
  status: "available" | "configuration-required" | "unavailable";
  message: string;
  retrievedAt: string;
  sourceUrl: string;
  durationMs: number;
  candidates: PublishedRate[];
  cacheHit?: boolean;
  confirmedLabel?: string;
  confirmationSourceKey?: string;
}
