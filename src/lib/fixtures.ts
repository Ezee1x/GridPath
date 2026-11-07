import { SiteField, SiteRecord, SourceDocument } from "./types";
const date = "2026-11-07T14:00:00.000Z";
const definitions: [string, string, string, boolean][] = [
  ["facility", "Property", "Facility name", true],
  ["address", "Property", "Site address", true],
  ["municipality", "Property", "Municipality", true],
  ["jurisdiction", "Property", "Jurisdiction / AHJ", true],
  ["propertyType", "Property", "Property type", false],
  ["parcel", "Property", "Parcel ID", true],
  ["footprint", "Property", "Building footprint", false],
  ["zoning", "Property", "Zoning", false],
  ["road", "Property", "Road access", false],
  ["flood", "Property", "Flood exposure", false],
  ["permits", "Property", "Public permit information", false],
  ["utility", "Service", "Utility provider", true],
  ["voltage", "Service", "Service voltage", true],
  ["phase", "Service", "Phase configuration", true],
  ["amperage", "Service", "Service amperage", true],
  ["panel", "Service", "Main distribution panel", true],
  ["breaker", "Service", "Main breaker and bus ratings", true],
  ["transformer", "Service", "Existing utility transformer ratings", true],
  ["meter", "Service", "Revenue meter model", true],
  ["singleLine", "Service", "Existing single-line diagram", true],
  ["capacity", "Service", "Available electrical capacity", true],
  ["poles", "Service", "Utility pole references", false],
  ["room", "Connection", "Main electrical room location", true],
  ["poi", "Connection", "Potential point of interconnection", true],
  ["distance", "Connection", "Distance to equipment area", false],
  ["space", "Connection", "Available breaker space", true],
  ["conduit", "Connection", "Field-verified conduit route", true],
  ["access", "Connection", "Site access limitations", false],
  ["clearances", "Connection", "Working clearances", true],
  ["underground", "Connection", "Underground utilities and obstructions", true],
  ["bills", "Usage", "Recent utility bills", true],
  ["load", "Usage", "15-minute electricity load data", true],
  ["tariff", "Usage", "Tariff verification", true],
  ["peak", "Usage", "Peak demand", true],
  ["power", "Design", "Proposed AC system power", false],
  ["energy", "Design", "Proposed storage capacity", false],
  ["battery", "Design", "Proposed battery", false],
  ["inverters", "Design", "Proposed inverters", false],
  ["isolation", "Design", "Proposed isolation transformer", false],
  ["pad", "Design", "Proposed pad dimensions", false],
  ["connection", "Design", "Proposed point of connection", false],
];
export const emptyFields = (): SiteField[] =>
  definitions.map(([id, category, label, required]) => ({
    id,
    category,
    label,
    required,
    value: null,
    unit: null,
    conditionType: category === "Design" ? "proposed" : "unknown",
    status: "Missing",
    confidence: "Unknown",
    sourceIds: [],
    reviewedBy: null,
    reviewedAt: null,
    notes: "",
  }));
const sourceNames = [
  "Full Engineered Plan Set",
  "Revenue Meter.pdf",
  "Main Distribution Panel.pdf",
  "Transformer.pdf",
  "Copy of Power Pole.pdf",
  "79 Lowland Street Map.pdf",
];
const sources: SourceDocument[] = sourceNames.map((title, i) => ({
  id: `source-${i}`,
  title,
  type:
    i === 0
      ? "Electrical drawings"
      : i === 1
        ? "Revenue meter photos"
        : i === 3
          ? "Transformer photos"
          : i === 5
            ? "Site maps"
            : "Permits and supporting documents",
  fileName: title,
  url: null,
  uploadedAt: date,
  retrievedAt: null,
  referencePage:
    i === 0
      ? "ESS-1.0, ESS-4.1, ESS-5.0, ESS-6.1 — exact field-to-sheet mapping requires review"
      : null,
  sourceAuthority:
    "User-supplied EQORE reference summary; original document not bundled",
  size: null,
}));
export function requirements(
  fields: SiteField[],
): SiteRecord["missingRequirements"] {
  return fields
    .filter((f) => f.conditionType !== "proposed")
    .map((f) => ({
      id: `req-${f.id}`,
      fieldId: f.id,
      title: f.label,
      priority: [
        "singleLine",
        "voltage",
        "amperage",
        "breaker",
        "capacity",
        "space",
        "transformer",
        "clearances",
        "underground",
        "poles",
      ].includes(f.id)
        ? "Critical"
        : ["load", "bills", "conduit", "poi", "panel"].includes(f.id)
          ? "High"
          : "Standard",
      explanation:
        f.id === "singleLine"
          ? "An accurate representation of existing service and distribution equipment is needed before evaluating connection options."
          : f.id === "poles" && f.value !== null
            ? "Photo 54/6A and single-line 22/6A may identify different assets. Clarify before associating them."
            : `Engineering review requires reliable ${f.label.toLowerCase()} information supported by traceable evidence.`,
      suggestedAction:
        f.id === "singleLine"
          ? "Request the latest as-built electrical single-line diagram from the facility manager."
          : f.category === "Usage"
            ? "Request the original utility records from the customer."
            : `Obtain ${f.label.toLowerCase()} evidence and request qualified review.`,
      assignedTo: "Unassigned",
      status: f.value === null ? "Missing" : "Received",
      sourceType:
        f.category === "Property"
          ? "Property record / municipal GIS"
          : f.category === "Usage"
            ? "Utility records"
            : "Drawing / nameplate / field confirmation",
      notes: "",
      documentIds: [...f.sourceIds],
    }));
}
const fields = emptyFields();
function set(
  id: string,
  value: string | number,
  source: number,
  unit: string | null = null,
  notes = "",
) {
  const f = fields.find((f) => f.id === id)!;
  Object.assign(f, {
    value,
    unit,
    conditionType: f.category === "Design" ? "proposed" : "existing",
    status: "Source-backed",
    confidence: "Documented",
    sourceIds: [`source-${source}`],
    notes,
  });
}
set("facility", "Century-Tywood J3 Corp", 0);
set("address", "79 Lowland Street, Holliston, Massachusetts 01747", 0);
set("municipality", "Holliston", 0);
set("jurisdiction", "Town of Holliston", 0);
set(
  "panel",
  "Main distribution panel identified",
  2,
  null,
  "Equipment identification does not establish ratings or available capacity.",
);
set(
  "meter",
  "Honeywell A39SM",
  1,
  null,
  "A revenue meter’s nominal rating does not establish service capacity.",
);
set(
  "poi",
  "Main distribution panel — reference connection point",
  0,
  null,
  "Identified in proposed engineering reference; existing suitability is unverified.",
);
set(
  "poles",
  "54/6A (photo) · 22/6A (single-line)",
  4,
  null,
  "These may refer to different assets. No error or asset equivalence has been established.",
);
fields.find((f) => f.id === "poles")!.status = "Conflicting evidence";
fields.find((f) => f.id === "poles")!.sourceIds.push("source-0");
set("power", 250, 0, "kW");
set("energy", 760, 0, "kWh");
set("battery", "Gotion Edge 760", 0);
set("inverters", "2 × Dynapower MPS125", 0);
set(
  "isolation",
  500,
  0,
  "kVA",
  "Proposed isolation transformer. Do not equate with the photographed existing utility transformer.",
);
set("pad", "Approximately 11.5 × 14", 0, "ft");
set("connection", "Main distribution panel", 0);
export const centuryTywoodSite: SiteRecord = {
  id: "century-tywood",
  facilityName: "Century-Tywood J3 Corp",
  address: "79 Lowland Street, Holliston, Massachusetts 01747",
  location: {
    municipality: "Holliston",
    coordinates: null,
    parcelGeometry: null,
  },
  lifecycleStatus: "Needs review",
  dataFields: fields,
  sourceDocuments: sources,
  missingRequirements: requirements(fields),
  createdAt: date,
  updatedAt: date,
  sample: true,
};
export function createSite(address: string): SiteRecord {
  const now = new Date().toISOString();
  const dataFields = emptyFields();
  Object.assign(
    dataFields.find((f) => f.id === "address")!,
    {
      value: address,
      status: "Needs review",
      sourceIds: ["manual-address"],
      notes: "Manually entered; not geocoded or independently verified.",
    },
  );
  return {
    id: crypto.randomUUID(),
    facilityName: "New site assessment",
    address,
    location: { municipality: null, coordinates: null, parcelGeometry: null },
    lifecycleStatus: "Preliminary",
    dataFields,
    sourceDocuments: [
      {
        id: "manual-address",
        title: "Manual address entry",
        type: "User input",
        fileName: "",
        url: null,
        uploadedAt: now,
        retrievedAt: null,
        referencePage: null,
        sourceAuthority: "Workspace user — unverified input",
        size: null,
      },
    ],
    missingRequirements: requirements(dataFields),
    createdAt: now,
    updatedAt: now,
    sample: false,
  };
}
