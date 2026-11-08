import { ENGINEERING_REFERENCES } from "../engineering/library";
import type { NormalizedCollection } from "./adapters";
import { observationId } from "./model";

/** Requested project reference baseline, not a determination of adopted editions. */
export const MA_CODE_REFERENCES = [
  "2020 NFPA 1 — Fire Code",
  "2020 NFPA 855 — Standard for the Installation of Stationary Energy Storage Systems",
  "2020 NFPA 70 — National Electrical Code",
  "2021 International Fire Code",
  "2021 International Building Code",
  "527 CMR 12.00 — Massachusetts Electrical Code",
  "780 CMR Tenth Edition — Massachusetts State Building Code",
] as const;

export function MassachusettsCodeReferenceAdapter(): NormalizedCollection {
  const at = new Date().toISOString();
  const key = "ma:project-code-reference-baseline";
  const value = ENGINEERING_REFERENCES.map(
    (r) =>
      `${r.title} — ${r.edition ?? "Edition requires confirmation"} · ${r.verification}`,
  );
  const method =
    "Engineering reference library checked 2026-11-08. Massachusetts building/fire adoption references were checked through official indexed publications; electrical download returned HTTP 403 and requires official confirmation. Applicable NFPA 855 edition, local amendments and project permit date remain unconfirmed. Previous project-supplied editions remain in observation history and are not an adopted-code determination.";
  return {
    fields: [
      {
        fieldId: "codes",
        observation: {
          id: observationId(
            "codes",
            value,
            "Project reference baseline",
            [key],
            method,
            null,
          ),
          value,
          unit: null,
          originalUnits: null,
          provenance: "User supplied",
          provider: "Project reference baseline",
          sourceKeys: [
            key,
            "ma:electrical-code-adoption",
            "ma:building-code-adoption",
            "ma:fire-code-adoption",
          ],
          method,
          confidence: "User supplied",
          observedAt: at,
          complete: false,
          warnings: [
            "Massachusetts reference list — adopted editions and local amendments require verification.",
          ],
        },
      },
    ],
    sources: Object.fromEntries(
      [
        [
          key,
          "Project owner",
          "Massachusetts project code reference list",
          "https://www.mass.gov/law-library/massachusetts-law-about-building-codes",
        ],
        [
          "ma:electrical-code-adoption",
          "Massachusetts Department of Fire Services",
          "Massachusetts Electrical Code — 2026 NEC adoption",
          "https://www.mass.gov/info-details/massachusetts-electrical-code",
        ],
        [
          "ma:building-code-adoption",
          "Massachusetts Board of Building Regulations and Standards",
          "780 CMR Tenth Edition — 2021 IBC with Massachusetts amendments",
          "https://www.mass.gov/handbook/tenth-edition-of-the-ma-state-building-code-780",
        ],
        [
          "ma:fire-code-adoption",
          "Massachusetts Department of Fire Services",
          "Massachusetts Comprehensive Fire Safety Code — NFPA 1 with Massachusetts amendments",
          "https://www.mass.gov/info-details/massachusetts-fire-code",
        ],
      ].map(([sourceKey, provider, dataset, serviceUrl]) => [
        sourceKey,
        {
          key: sourceKey,
          provider,
          dataset,
          serviceUrl,
          featureId: sourceKey === key ? "MA-reference-baseline-v1" : null,
          featureName: null,
          recordDate: null,
          datasetUpdated: null,
          retrievedAt: at,
          referenceOnly: true,
          matchingMethod:
            sourceKey === key
              ? "Project owner instruction; linked state page is context, not the source of supplied editions."
              : "State adoption reference; does not verify the supplied baseline editions or local applicability.",
        },
      ]),
    ),
  };
}
