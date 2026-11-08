export type EngineeringStage =
  | "Initial site intake"
  | "Sizing and proposal"
  | "Detailed design and permitting"
  | "Utility interconnection"
  | "Commissioning and operation";
export interface EngineeringReference {
  id: string;
  title: string;
  edition: string | null;
  effectiveDate: string | null;
  url: string;
  verification:
    | "Official publication checked"
    | "Official index checked"
    | "Confirmation required";
  checkedAt: string;
  note: string;
}
const checkedAt = "2026-11-08";
export const ENGINEERING_REFERENCES: EngineeringReference[] = [
  {
    id: "ma-building",
    title: "780 CMR — Massachusetts State Building Code",
    edition: "Tenth Edition / 2021 IBC with MA amendments",
    effectiveDate: "2024-10-11",
    url: "https://www.mass.gov/handbook/tenth-edition-of-the-ma-state-building-code-780",
    verification: "Official index checked",
    checkedAt,
    note: "Official Mass.gov indexed preamble identifies the 2021 IBC base; concurrency ended June 30, 2025. Verify project permit date and local applicability.",
  },
  {
    id: "ma-electrical",
    title: "527 CMR 12.00 — Massachusetts Electrical Code",
    edition:
      "2026 NEC with Massachusetts amendments (project-supplied; confirm official text)",
    effectiveDate: null,
    url: "https://www.mass.gov/doc/527-cmr-1200-massachusetts-electrical-code-effective-42426/download",
    verification: "Confirmation required",
    checkedAt,
    note: "Project brief identifies April 24, 2026. Official download returned HTTP 403 during this audit; no code-section rules asserted. See state electrical-code page and confirm adopted text.",
  },
  {
    id: "ma-fire",
    title: "527 CMR 1.00 — Massachusetts Comprehensive Fire Safety Code",
    edition: "2021 NFPA 1 with MA amendments",
    effectiveDate: "2023-05-12",
    url: "https://www.mass.gov/info-details/massachusetts-fire-code",
    verification: "Official index checked",
    checkedAt,
    note: "Official indexed amendment document is effective May 12, 2023; state page describes the base code effective December 9, 2022. Proposed 2026 amendments are not assumed adopted.",
  },
  {
    id: "nfpa-855",
    title: "NFPA 855 — Stationary Energy Storage Systems",
    edition: null,
    effectiveDate: null,
    url: "https://www.nfpa.org/855",
    verification: "Confirmation required",
    checkedAt,
    note: "Reference standard only. Applicable edition, incorporation and project-specific rules require qualified review; full standard not reproduced.",
  },
  {
    id: "icc",
    title: "ICC Digital Codes",
    edition:
      "2021 IBC reference for MA tenth edition; other titles require applicability review",
    effectiveDate: null,
    url: "https://codes.iccsafe.org",
    verification: "Confirmation required",
    checkedAt,
    note: "Do not treat the latest model edition or IFC as automatically adopted in Massachusetts.",
  },
  {
    id: "interconnection",
    title: "Massachusetts utility interconnection resources",
    edition: null,
    effectiveDate: null,
    url: "https://www.mass.gov/info-details/utility-interconnection-in-massachusetts",
    verification: "Confirmation required",
    checkedAt,
    note: "Actual utility, facility account, applicable tariff and interconnection process need confirmation.",
  },
];
export interface EngineeringRequirement {
  id: string;
  title: string;
  category: string;
  stage: EngineeringStage;
  jurisdiction: string;
  standard: string;
  edition: string | null;
  section: string | null;
  sourceUrl: string;
  requiredEvidence: string[];
  fieldIds: string[];
  referenceIds: string[];
  applicability: string;
  verificationStatus: "Information collection checklist; qualified review required";
  planSheets: string[];
}
const requirement = (
  id: string,
  title: string,
  stage: EngineeringStage,
  fieldIds: string[],
  requiredEvidence: string[],
  referenceIds: string[],
  planSheets: string[],
  applicability: string,
): EngineeringRequirement => ({
  id,
  title,
  stage,
  category: referenceIds.includes("ma-electrical")
    ? "Electrical"
    : "Site and permitting",
  jurisdiction: "Massachusetts; exact AHJ requires confirmation",
  standard:
    "ProjectSync engineering intake checklist; referenced standards are guidance, not quoted rules",
  edition: null,
  section: null,
  sourceUrl:
    ENGINEERING_REFERENCES.find((r) => r.id === referenceIds[0])?.url ??
    ENGINEERING_REFERENCES[0].url,
  fieldIds,
  requiredEvidence,
  referenceIds,
  planSheets,
  applicability,
  verificationStatus:
    "Information collection checklist; qualified review required",
});
export const ENGINEERING_REQUIREMENTS: EngineeringRequirement[] = [
  requirement(
    "site-identity",
    "Property identity and access",
    "Initial site intake",
    [
      "address",
      "parcelId",
      "parcelArea",
      "municipalityAhj",
      "roadNames",
      "delivery",
    ],
    [
      "Matched assessor parcel",
      "Site/access plan and qualified access confirmation",
    ],
    ["ma-building"],
    ["G-100", "E-110"],
    "Every site; GIS is preliminary and does not establish legal access.",
  ),
  requirement(
    "existing-service",
    "Existing electrical service",
    "Initial site intake",
    ["voltage", "phase", "serviceAmperage", "singleLine"],
    [
      "Existing single-line diagram",
      "Service nameplate or utility service documentation",
    ],
    ["ma-electrical"],
    ["E-300"],
    "Existing service; grounding and wire configuration must also be checked in the drawing by a qualified engineer.",
  ),
  requirement(
    "main-distribution",
    "Main distribution equipment",
    "Initial site intake",
    ["panelRating", "breaker", "breakerSpace", "room"],
    [
      "Panel/switchboard nameplates",
      "Existing panel schedule",
      "Electrical room location",
    ],
    ["ma-electrical"],
    ["E-120", "E-121", "E-300"],
    "Existing equipment only; do not derive available site capacity from nameplate ratings.",
  ),
  requirement(
    "transformer-meter",
    "Transformer, meter and utility connection",
    "Initial site intake",
    [
      "transformerId",
      "transformerCapacity",
      "meterModel",
      "meterId",
      "utilityPole",
      "poi",
    ],
    [
      "Utility equipment records",
      "Safely obtained nameplates and meter identifiers",
    ],
    ["ma-electrical", "interconnection"],
    ["E-110", "E-300", "E-500 onward"],
    "Confirm actual equipment serving the site; nearby infrastructure is reference only.",
  ),
  requirement(
    "usage-evidence",
    "Facility electricity use",
    "Initial site intake",
    ["utilityBills", "energyUse", "demand", "interval"],
    [
      "Recent utility bills",
      "Timestamped interval data with units and coverage",
    ],
    ["interconnection"],
    ["E-300 (load basis)"],
    "Actual customer data. Modeled examples do not establish facility consumption.",
  ),
  requirement(
    "utility-tariff",
    "Serving utility and applicable tariff",
    "Initial site intake",
    ["utility", "tariff", "demandRate", "tou"],
    [
      "Recent bill identifying account tariff",
      "Current utility tariff and eligibility confirmation",
    ],
    ["interconnection"],
    [],
    "Published rates and municipality utility territories are candidates until customer evidence is reviewed.",
  ),
  requirement(
    "environment-screening",
    "Environmental and permitting context",
    "Initial site intake",
    ["flood", "wetlands", "elevation", "permitting", "permits", "codes"],
    ["Official GIS screening", "Municipal permit history and confirmed AHJ"],
    ["ma-building", "ma-fire"],
    ["G-100", "E-110"],
    "Screening is not a delineation, permit approval or code-compliance finding.",
  ),
  requirement(
    "capacity-basis",
    "Load and connection basis",
    "Sizing and proposal",
    ["availableCapacity", "existingClearances", "existingConduit"],
    [
      "Engineer-reviewed load study",
      "Utility/owner confirmation",
      "Verified existing routing and clearance information",
    ],
    ["ma-electrical", "interconnection"],
    ["E-110", "E-300"],
    "Required before sizing/connection conclusions; not an automatic GIS result.",
  ),
  requirement(
    "battery-placement",
    "Potential BESS location",
    "Detailed design and permitting",
    [
      "placement",
      "placementDistance",
      "footprint",
      "boundaryDistances",
      "clearances",
      "fire",
    ],
    [
      "Proposed layout",
      "Verified doors/windows, separations and obstructions",
      "Manufacturer installation documentation",
    ],
    ["nfpa-855", "ma-fire", "ma-building"],
    ["G-100", "E-110", "E-120", "E-121"],
    "Downstream design information; excluded from initial-intake missing counts.",
  ),
  requirement(
    "fire-safety",
    "Fire protection and building construction",
    "Detailed design and permitting",
    ["construction", "fire", "battery", "foundation"],
    [
      "Construction records",
      "Equipment listing and safety documentation",
      "Fire authority and qualified engineering review",
    ],
    ["ma-fire", "nfpa-855", "ma-building"],
    ["G-100", "E-400", "E-500 onward"],
    "Final equipment/design and AHJ review determine applicability. Not an initial-intake completion requirement.",
  ),
  requirement(
    "utility-application",
    "Utility interconnection application",
    "Utility interconnection",
    ["utility", "poi", "singleLine", "power", "capacity"],
    [
      "Utility application and study requirements",
      "Engineered proposed single-line and equipment data",
    ],
    ["interconnection", "ma-electrical"],
    ["E-300", "E-500 onward"],
    "Actual utility process; initial public research does not establish approval.",
  ),
  requirement(
    "commissioning",
    "Commissioning and operating documentation",
    "Commissioning and operation",
    ["battery", "inverter", "singleLine"],
    [
      "Approved as-built documentation",
      "Manufacturer commissioning records and operating procedures",
    ],
    ["nfpa-855"],
    ["E-400", "E-500 onward"],
    "Downstream only; not counted as missing initial-site data.",
  ),
];
export const PLAN_REFERENCE_FILES = [
  "Full Engineered Plan Set.pdf — Century-Tywood",
  "BESS IFC Sample 1.pdf",
  "BESS IFC Sample 2.pdf",
  "Main Distribution Panel.pdf",
  "Revenue Meter.pdf",
  "Transformer.pdf",
  "Copy of Power Pole.pdf",
];
