export const PRIORITIES = ["Critical", "High", "Medium", "Low"] as const;
export type Priority = (typeof PRIORITIES)[number];
export type Condition = "existing" | "proposed";
export interface FieldDefinition {
  id: string;
  category: string;
  label: string;
  condition: Condition;
  required: boolean;
  reason: string;
  suggestedEvidence: string;
  owner: string;
  priority: number;
  criticality: Priority;
  structuredExample?: string;
}
export const CATEGORIES = [
  {
    id: "property",
    label: "Property Identification",
    rows: [
      ["facilityName", "Facility name"],
      ["propertyType", "Property type / occupancy description"],
      ["address", "Address"],
      ["coordinates", "Coordinates"],
      ["municipalityAhj", "Municipality and authority having jurisdiction"],
      ["parcelId", "Parcel ID"],
      ["parcelArea", "Parcel area"],
      ["landUse", "Assessor land use"],
      ["zoning", "Zoning district"],
    ],
  },
  {
    id: "buildings",
    label: "Buildings and Geometry",
    rows: [
      ["buildingCount", "Mapped building count"],
      ["individualRoofAreas", "Individual roofprint areas"],
      ["totalRoofArea", "Total roofprint area"],
      ["construction", "Building construction type"],
      ["height", "Building height/stories"],
      ["unbuiltArea", "Approximate unbuilt parcel area"],
      ["boundaryDistances", "Building-to-parcel-boundary distances"],
      ["placement", "Candidate BESS placement area"],
      ["placementDistance", "Candidate placement-to-building distance"],
    ],
  },
  {
    id: "roads",
    label: "Roads and Logistics",
    rows: [
      ["roadNames", "Nearby road names"],
      ["roadClass", "Road classification"],
      ["frontage", "Road frontage"],
      ["driveways", "Mapped driveway locations"],
      ["roadBuildingDistance", "Road-to-building distance"],
      ["delivery", "Delivery vehicle access constraints"],
      ["staging", "Equipment staging/unloading area"],
      ["fire", "Fire protection/emergency access"],
    ],
  },
  {
    id: "environment",
    label: "Environmental and Permitting",
    rows: [
      ["flood", "Flood hazard designation"],
      ["wetlands", "Wetlands intersection/proximity"],
      ["elevation", "Elevation"],
      ["wind", "Wind criteria"],
      ["snow", "Snow criteria"],
      ["permitting", "Permitting jurisdiction"],
      ["permits", "Public permit records"],
      ["codes", "Applicable local codes and amendments"],
    ],
  },
  {
    id: "electrical",
    label: "Electrical Infrastructure",
    rows: [
      ["utility", "Serving utility"],
      ["meterModel", "Revenue meter model"],
      ["meterId", "Revenue meter identifier"],
      ["voltage", "Service voltage"],
      ["serviceAmperage", "Service amperage"],
      ["availableCapacity", "Available electrical capacity"],
      ["utilityPole", "Utility pole identifiers"],
      ["breakerSpace", "Available breaker space"],
      ["phase", "Phase configuration"],
      ["panelRating", "Main distribution panel rating"],
      ["breaker", "Main breaker and main bus ratings"],
      ["room", "Electrical room location"],
      ["transformerId", "Existing transformer identification"],
      [
        "transformerCapacity",
        "Existing utility transformer electrical ratings",
      ],
      ["singleLine", "Existing electrical single-line diagram availability"],
      ["undergroundUtilities", "Underground utilities and obstructions"],
      [
        "equipmentDistance",
        "Existing electrical equipment separation distances",
      ],
      ["existingConduit", "Existing field-verified conduit route"],
      ["existingClearances", "Existing equipment working clearances"],
      ["poi", "Potential point of interconnection"],
    ],
  },
  {
    id: "usage",
    label: "Electricity Usage and Rates",
    rows: [
      ["utilityBills", "Utility bills"],
      ["tariff", "Utility rate schedule"],
      ["energyUse", "Historical energy consumption"],
      ["demand", "Maximum demand"],
      ["interval", "15-minute interval load profile"],
      ["demandRate", "Demand-charge rate"],
      ["tou", "Time-of-use rates"],
    ],
  },
  {
    id: "design",
    label: "Proposed BESS Design",
    rows: [
      ["power", "Proposed power rating"],
      ["capacity", "Proposed energy capacity"],
      ["battery", "Battery model"],
      ["inverter", "Inverter model"],
      ["footprint", "Equipment footprint"],
      ["clearances", "Working clearances"],
      ["conduit", "Conduit pathway"],
      ["foundation", "Foundation/anchorage"],
    ],
  },
];
const advice: Record<string, [string, string, string, number]> = {
  singleLine: [
    "Establish existing electrical topology and connection points.",
    "Current existing-condition single-line diagram.",
    "Electrical engineer",
    1,
  ],
  voltage: [
    "Confirm existing equipment and connection compatibility.",
    "Utility service documentation or verified existing diagram.",
    "Customer / utility",
    2,
  ],
  panelRating: [
    "Establish the actual panel rating before evaluating capacity.",
    "Panel nameplate and existing panel schedule.",
    "Customer / electrical engineer",
    3,
  ],
  breaker: [
    "Establish existing breaker and bus specifications.",
    "Nameplates, panel schedules and engineer-reviewed drawings.",
    "Electrical engineer",
    4,
  ],
  transformerCapacity: [
    "Establish existing transformer ratings without inferring them from imagery.",
    "Transformer nameplate and utility equipment records.",
    "Customer / utility",
    5,
  ],
  interval: [
    "Characterize time-varying customer load.",
    "Timestamped 15-minute utility interval export with units and coverage dates.",
    "Customer / utility",
    7,
  ],
  placement: [
    "Identify a candidate location for subsequent engineering review.",
    "Customer-marked site plan and reviewed constraints.",
    "Customer / engineer",
    8,
  ],
  conduit: [
    "Establish a proposed connection pathway and route constraints.",
    "Proposed conduit plan with field verification of obstructions.",
    "Electrical engineer",
    9,
  ],
  fire: [
    "Establish fire access and clearance requirements.",
    "Fire official and engineer review, equipment drawings and access plan.",
    "Engineer / fire authority",
    10,
  ],
  municipalityAhj: [
    "Distinguish municipality from the responsible permitting authority.",
    "Municipal records and confirmed authority contacts.",
    "Property owner",
    20,
  ],
};
const criticality: Record<string, Priority> = {
  voltage: "Critical",
  serviceAmperage: "Critical",
  singleLine: "Critical",
  availableCapacity: "Critical",
  transformerCapacity: "Critical",
  breaker: "Critical",
  panelRating: "High",
  breakerSpace: "High",
  utilityPole: "Medium",
  undergroundUtilities: "High",
  equipmentDistance: "Medium",
  facilityName: "Low",
  propertyType: "Medium",
};
const structuredExamples: Record<string, string> = {
  meterModel: '{"manufacturer":"","model":"","evidencePageOrRegion":""}',
  meterId:
    '{"identifier":"","documentedLocation":"","evidencePageOrRegion":""}',
  phase: '{"phase":null,"serviceWireCount":null,"evidencePageOrRegion":""}',
  panelRating:
    '{"manufacturer":"","model":"","ratingAmps":null,"evidencePageOrRegion":""}',
  transformerId:
    '{"equipmentId":"","manufacturer":"","modelOrCatalogNumber":"","documentedLocation":"","evidencePageOrRegion":""}',

  breaker: '{"equipmentId":"","mainBreakerAmps":null,"mainBusAmps":null}',
  transformerCapacity:
    '{"transformers":[{"equipmentId":"","manufacturer":"","modelOrCatalogNumber":"","capacityKva":null,"primaryVoltageV":null,"secondaryVoltageV":null,"phase":null,"impedancePercent":null,"documentedLocation":"","evidencePageOrRegion":""}]}',
  singleLine:
    '{"availability":"Not received","revision":null,"documentReference":null}',
  availableCapacity: '{"capacityKw":null,"basis":"","assessedAt":null}',
  utilityPole:
    '{"poles":[{"identifier":"","utility":"","sourceReference":""}]}',
  breakerSpace:
    '{"panelId":"","availableSpaces":null,"compatibleBreakerType":null}',
};
/** IDs present before the unified-record extension; used for lossless saved-record migration. */
export const ADDED_FIELD_IDS = [
  "facilityName",
  "propertyType",
  "serviceAmperage",
  "availableCapacity",
  "utilityPole",
  "breakerSpace",
  "undergroundUtilities",
  "equipmentDistance",
  "existingConduit",
  "existingClearances",
  "utilityBills",
];
export const FIELD_SCHEMA: FieldDefinition[] = CATEGORIES.flatMap((c) =>
  c.rows.map(([id, label]) => {
    const condition: Condition =
      c.id === "design" || ["placement", "placementDistance"].includes(id)
        ? "proposed"
        : "existing";
    const defaults: [string, string, string, number] = [
      `${label} supports a complete, traceable ${condition}-condition engineering record.`,
      c.id === "electrical"
        ? "Existing drawings, equipment nameplates or utility documentation."
        : c.id === "usage"
          ? "Customer utility bills and interval/rate records."
          : c.id === "design"
            ? "Proposed design drawings with engineering review."
            : "Public records, customer evidence or a documented site inspection.",
      c.id === "electrical"
        ? "Electrical engineer"
        : c.id === "usage"
          ? "Customer / utility"
          : "Property owner / engineer",
      c.id === "electrical" ? 15 : 30,
    ];
    const [reason, suggestedEvidence, owner, priority] = advice[id] ?? defaults;
    return {
      id,
      category: c.id,
      label,
      condition,
      required: condition === "existing",
      reason,
      suggestedEvidence,
      owner,
      priority,
      criticality:
        criticality[id] ??
        (c.id === "electrical" || c.id === "usage"
          ? "High"
          : c.id === "design"
            ? "Low"
            : "Medium"),
      structuredExample: structuredExamples[id],
    };
  }),
);

/** Current intake inventory. Hidden legacy/geometry fields remain stored for maps and compatibility. */
export const ACTIVE_CATEGORIES = CATEGORIES.filter(
  (c) => !["buildings", "design"].includes(c.id),
);
export const ACTIVE_FIELDS = FIELD_SCHEMA.filter((d) =>
  ACTIVE_CATEGORIES.some((c) => c.id === d.category),
);
