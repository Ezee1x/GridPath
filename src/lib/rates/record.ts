import { mergeCollectedFields, observationId } from "../intake/model";
import type { IntakeRecord, JsonValue } from "../intake/types";
import type { PublishedRate, UtilityRateResult } from "./types";
export function applyRates(record: IntakeRecord, result: UtilityRateResult) {
  if (result.siteKey !== record.siteKey)
    throw Error("Rate results belong to another site.");
  return {
    ...record,
    utilityRates: {
      ...result,
      confirmedLabel: record.utilityRates?.confirmedLabel,
      confirmationSourceKey: record.utilityRates?.confirmationSourceKey,
    },
    collectionBenchmark: {
      startedAt: record.collectionBenchmark?.startedAt ?? result.retrievedAt,
      completedAt: record.collectionBenchmark?.completedAt ?? null,
      requests: [
        ...(record.collectionBenchmark?.requests ?? []),
        {
          source: "OpenEI utility rates",
          startedAt: result.retrievedAt,
          durationMs: result.durationMs,
          status: result.cacheHit ? "cached" : result.status,
        },
      ],
      manualComparison: record.collectionBenchmark?.manualComparison,
    },
  };
}
export function retainRate(
  record: IntakeRecord,
  rate: PublishedRate,
  confirmationSourceKey?: string,
) {
  if (!record.utilityRates?.candidates.some((r) => r.label === rate.label))
    throw Error("Search this site before retaining a tariff.");
  const confirmed = !!confirmationSourceKey;
  const evidence = confirmationSourceKey
    ? record.sources[confirmationSourceKey]
    : null;
  if (
    confirmed &&
    (!evidence?.fileHash ||
      evidence.referenceOnly ||
      !(
        record.fields.find((f) => f.id === "utilityBills")?.evidenceKeys ?? []
      ).includes(confirmationSourceKey))
  )
    throw Error(
      "Attach a customer utility bill to this site before confirming a tariff.",
    );
  const key = `openei:${rate.label}`,
    method = `OpenEI v7 published tariff; ${confirmed ? "user compared utility and tariff against the attached customer bill; engineer review remains required" : "geographic candidate only; customer applicability unconfirmed"}. Original structures preserved, including tiers, schedules, ratchets and eligibility fields.`;
  const sources = {
    [key]: {
      key,
      provider: "OpenEI Utility Rate Database",
      dataset: rate.name,
      serviceUrl: rate.sourceUrl,
      featureId: rate.label,
      featureName: rate.utility,
      recordDate: rate.startDate,
      datasetUpdated: null,
      retrievedAt: rate.retrievedAt,
      matchingMethod: method,
      originalRecord: rate.structure,
    },
  };
  const refs = [key, ...(confirmationSourceKey ? [confirmationSourceKey] : [])];
  const values: [string, JsonValue][] = [
    [
      "tariff",
      {
        name: rate.name,
        utility: rate.utility,
        sector: rate.sector,
        status: confirmed
          ? "Customer-confirmed tariff — engineer review required"
          : "Candidate published tariff",
        rateLabel: rate.label,
      },
    ],
    ["utility", rate.utility],
  ];
  for (const [fieldId, keys] of [
    [
      "demandRate",
      [
        "demandratestructure",
        "flatdemandstructure",
        "flatdemandmonths",
        "demandratchetpercentage",
        "demandwindow",
        "demandunits",
      ],
    ],
    [
      "tou",
      [
        "energyratestructure",
        "energyweekdayschedule",
        "energyweekendschedule",
        "demandweekdayschedule",
        "demandweekendschedule",
      ],
    ],
  ] as [string, string[]][]) {
    const value = Object.fromEntries(
      keys
        .filter((k) => rate.structure[k] != null)
        .map((k) => [k, rate.structure[k]]),
    );
    if (Object.keys(value).length) values.push([fieldId, value]);
  }
  const next = mergeCollectedFields(
    record,
    values.map(([fieldId, value]) => ({
      fieldId,
      observation: {
        id: observationId(
          fieldId,
          value,
          "OpenEI Utility Rate Database",
          refs,
          method,
          null,
        ),
        value,
        unit: null,
        originalUnits: null,
        provenance: "Published tariff record",
        provider: "OpenEI Utility Rate Database",
        sourceKeys: refs,
        method,
        confidence: "Documented",
        observedAt: new Date().toISOString(),
        complete: confirmed,
        autoSelect: confirmed,
        condition: "existing",
        warnings: confirmed
          ? ["Customer confirmation is not engineer verification."]
          : [
              "Candidate only; confirm serving utility, rate name, eligibility and effective dates using the customer bill.",
            ],
      },
    })),
    sources,
  );
  // Explicit customer acceptance may select an alternative; preserve all verified selections.
  return {
    ...next,
    utilityRates: {
      ...record.utilityRates,
      confirmedLabel: confirmed
        ? rate.label
        : record.utilityRates.confirmedLabel,
      confirmationSourceKey: confirmed
        ? confirmationSourceKey
        : record.utilityRates.confirmationSourceKey,
    },
    fields: next.fields.map((f) => {
      const old = record.fields.find((x) => x.id === f.id)!;
      const requestedValue = values.find(([id]) => id === f.id)?.[1];
      const added = f.observations
        .filter(
          (o) =>
            o.provider === "OpenEI Utility Rate Database" &&
            o.method === method &&
            JSON.stringify(o.value) === JSON.stringify(requestedValue),
        )
        .at(-1);
      if (
        !confirmed ||
        !values.some(([id]) => id === f.id) ||
        old.review.status === "Engineer verified" ||
        !added
      )
        return f;
      return {
        ...f,
        request: { ...f.request, status: "Under review" as const },
        selectedId: added.id,
        pinned: true,
        review: {
          status: "Under review" as const,
          reviewer: null,
          at: null,
          note: "Customer tariff confirmation; engineering review required.",
        },
      };
    }),
  };
}
