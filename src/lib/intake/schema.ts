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
}
export const CATEGORIES = [
  {
    id: "property",
    label: "Property Identification",
    rows: [
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
      ["phase", "Phase configuration"],
      ["panelRating", "Main distribution panel rating"],
      ["breaker", "Breaker and bus ratings"],
      ["room", "Electrical room location"],
      ["transformerId", "Existing transformer identification"],
      ["transformerCapacity", "Transformer capacity"],
      ["singleLine", "Existing single-line diagram"],
      ["poi", "Potential point of interconnection"],
    ],
  },
  {
    id: "usage",
    label: "Electricity Usage and Rates",
    rows: [
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
      ["fire", "Fire protection/emergency access"],
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
    };
  }),
);
