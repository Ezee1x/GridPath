import { mergeCollectedFields, observationId } from "../intake/model";
import type {
  IntakeRecord,
  JsonValue,
  EvidenceReference,
} from "../intake/types";
import type { EnergyImport } from "./types";
export function acceptEnergy(
  record: IntakeRecord,
  energy: EnergyImport,
  source: EvidenceReference,
) {
  if (
    energy.siteKey !== record.siteKey ||
    source.key !== energy.sourceKey ||
    source.fileHash !== energy.fileHash
  )
    throw Error("Energy evidence belongs to another site or file.");
  if (source.referenceOnly)
    throw Error(
      "Reference-only files cannot be accepted as site energy evidence.",
    );
  if (energy.blocking)
    throw Error("Resolve blocking data-quality problems before acceptance.");
  if (energy.synthetic && energy.classification !== "Modeled / synthetic")
    throw Error(
      "Synthetic demo readings cannot be accepted as actual facility consumption.",
    );
  const modeled = energy.classification === "Modeled / synthetic";
  const method = `${energy.classification}; ${energy.format}; timestamps normalized to UTC; display/month totals use ${energy.timezone}. ${energy.demandBasis}. Actual interval durations retained; gaps not filled. Month-crossing intervals, when present, are allocated by duration with a uniform-within-interval assumption. File SHA-256 ${energy.fileHash}.`;
  const values: [string, JsonValue, string | null][] = [
    [
      "energyUse",
      {
        coverageStart: energy.coverageStart,
        coverageEnd: energy.coverageEnd,
        totalKwh: energy.totalKwh,
        monthlyKwh: energy.monthlyKwh,
        classification: energy.classification,
      },
      null,
    ],
    ["demand", energy.maximumObservedKw, "kW"],
    [
      "interval",
      {
        coverageStart: energy.coverageStart,
        coverageEnd: energy.coverageEnd,
        readings: energy.readings.length,
        durationsSeconds: energy.durationsSeconds,
        missingIntervals: energy.missingIntervals,
        sourceKey: energy.sourceKey,
        classification: energy.classification,
      },
      null,
    ],
  ];
  const next = mergeCollectedFields(
    record,
    values.map(([fieldId, value, unit]) => ({
      fieldId,
      observation: {
        id: observationId(
          fieldId,
          value,
          "Customer energy import",
          [source.key],
          method,
          unit,
        ),
        value,
        unit,
        originalUnits: unit,
        provider: "Customer energy import",
        provenance: "Customer document",
        sourceKeys: [source.key],
        method,
        confidence:
          fieldId === "energyUse" && energy.monthlyEstimated
            ? "Estimated"
            : "Documented",
        observedAt: energy.acceptedAt,
        complete:
          !modeled &&
          (fieldId !== "interval" ||
            (energy.durationsSeconds.every((v) => v === 900) &&
              energy.gapSeconds === 0)),
        autoSelect: !modeled,
        condition: modeled ? "unknown" : "existing",
        warnings: [
          ...energy.warnings,
          ...(modeled
            ? [
                "Modeled/synthetic data is not actual facility consumption and does not satisfy intake fields.",
              ]
            : []),
        ],
      },
    })),
    { [source.key]: source },
  );
  return {
    ...next,
    energyImports: [
      ...(record.energyImports ?? []).filter((e) => e.id !== energy.id),
      energy,
    ],
  };
}

/** Preview sample results in empty table cells without selecting them as site evidence. */
export function sampleEnergyObservation(record: IntakeRecord, fieldId: string) {
  if (!["energyUse", "demand", "interval"].includes(fieldId)) return undefined;
  const field = record.fields.find((field) => field.id === fieldId);
  if (!field || field.pinned || field.review.status === "Engineer verified")
    return undefined;
  const sample = record.energyImports?.at(-1);
  if (!sample || sample.classification !== "Modeled / synthetic")
    return undefined;
  const observation = field.observations.find(
    (observation) =>
      observation.provider === "Customer energy import" &&
      observation.condition === "unknown" &&
      observation.sourceKeys.includes(sample.sourceKey) &&
      !field.rejectedObservations?.[observation.id],
  );
  // Older saved packages could select the last retained observation on reload.
  return !field.selectedId || field.selectedId === observation?.id
    ? observation
    : undefined;
}
