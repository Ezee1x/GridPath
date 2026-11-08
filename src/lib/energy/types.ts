/** start UTC seconds, actual duration seconds, kWh, interval-average kW, source demand kW (if provided). */
export type EnergyReading = [number, number, number, number, number | null];
export interface EnergyPreview {
  readings: EnergyReading[];
  timezone: string;
  format: "CSV" | "Green Button XML";
  coverageStart: string;
  coverageEnd: string;
  totalKwh: number;
  maximumObservedKw: number;
  demandBasis: string;
  monthlyEstimated?: boolean;
  monthlyKwh: { month: string; kwh: number }[];
  durationsSeconds: number[];
  duplicates: number;
  missingIntervals: number | null;
  gapSeconds: number;
  warnings: string[];
  blocking: boolean;
  meterReference: string | null;
}
export interface EnergyImport extends EnergyPreview {
  id: string;
  siteKey: string;
  sourceKey: string;
  fileHash: string;
  fileName: string;
  acceptedAt: string;
  classification: "Customer supplied" | "Modeled / synthetic";
}
