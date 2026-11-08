import { requestJson } from "./service";
export const ASSESSOR_URL =
  "https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/MassachusettsPropertyTaxParcels/FeatureServer/4";
export const MUNICIPALITY_URL =
  "https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/TownSurveyGenCoast_gdb/FeatureServer/1";
export const PARCEL_DOCUMENTATION =
  "https://www.mass.gov/info-details/massgis-data-property-tax-parcels";
export const USE_CODE_DOCUMENTATION =
  "https://www.mass.gov/doc/property-type-classification-codes-booklet/download";
export interface PropertyData {
  locId: string;
  townId: number;
  retrievedAt: string;
  assessor: {
    status: "ready" | "error" | "unmatched";
    records: Record<string, unknown>[];
    complete: boolean;
    error: string | null;
  };
  municipality: { name: string; recordId: string } | null;
  warnings: string[];
}
export const ASSESSOR_FIELDS = [
  "OBJECTID",
  "MA_PROP_ID",
  "PROP_ID",
  "LOC_ID",
  "TOWN_ID",
  "SITE_ADDR",
  "ADDR_NUM",
  "FULL_STR",
  "CITY",
  "ZIP",
  "FY",
  "USE_CODE",
  "ZONING",
  "LOT_SIZE",
  "LOT_UNITS",
];
interface ResponseRows {
  features?: { attributes: Record<string, unknown> }[];
  exceededTransferLimit?: boolean;
}
export async function collectProperty(
  locId: string,
  townId: number,
): Promise<PropertyData> {
  if (
    (locId !== "" && !/^[MF]_\d+_\d+$/.test(locId)) ||
    locId.length > 30 ||
    !Number.isInteger(townId) ||
    townId < 1 ||
    townId > 352
  )
    throw new Error("A valid MassGIS LOC_ID and TOWN_ID are required.");
  const [assessor, municipality] = await Promise.allSettled([
    locId
      ? requestJson(ASSESSOR_URL + "/query", {
          f: "json",
          where: `LOC_ID = '${locId}' AND TOWN_ID = ${townId}`,
          outFields: ASSESSOR_FIELDS.join(","),
          returnGeometry: "false",
          orderByFields: "OBJECTID",
          resultRecordCount: "300",
        })
      : Promise.resolve({ features: [] }),
    requestJson(MUNICIPALITY_URL + "/query", {
      f: "json",
      where: `TOWN_ID = ${townId}`,
      outFields: "OBJECTID,TOWN,TOWN_ID",
      returnGeometry: "false",
      resultRecordCount: "2",
    }),
  ]);
  const warnings: string[] = locId
    ? []
    : [
        "Missing or unavailable assessor linkage; only the official municipality is queried.",
      ];
  const a =
    assessor.status === "fulfilled" ? (assessor.value as ResponseRows) : null;
  const raw = a?.features?.map((f) => f.attributes) ?? [];
  const records = raw.filter(
    (r) => String(r.LOC_ID) === locId && Number(r.TOWN_ID) === townId,
  );
  const complete =
    !!locId &&
    !!a &&
    !a.exceededTransferLimit &&
    raw.length < 300 &&
    raw.length === records.length;
  if (locId && !complete && a)
    warnings.push(
      "Assessor response is incomplete or contains mismatched identifiers; missing values must not be inferred.",
    );
  if (locId && !records.length && a)
    warnings.push(
      "No assessor records were returned for this exact LOC_ID and TOWN_ID.",
    );
  if (records.length > 1)
    warnings.push(
      `${records.length} assessor records share this parcel key. Individual tax records are retained separately; values are not summed or silently collapsed.`,
    );
  const rows =
    municipality.status === "fulfilled"
      ? ((municipality.value as ResponseRows).features
          ?.map((f) => f.attributes)
          .filter(
            (r) => Number(r.TOWN_ID) === townId && typeof r.TOWN === "string",
          ) ?? [])
      : [];
  if (rows.length !== 1)
    warnings.push(
      "Official municipality lookup did not return one unambiguous TOWN_ID record.",
    );
  return {
    locId,
    townId,
    retrievedAt: new Date().toISOString(),
    assessor: {
      status: !locId ? "unmatched" : a ? "ready" : "error",
      records,
      complete,
      error: !locId
        ? "No LOC_ID linkage; assessor table was not queried."
        : assessor.status === "rejected"
          ? "Public assessor lookup failed. Existing parcel results remain available."
          : null,
    },
    municipality:
      rows.length === 1
        ? { name: String(rows[0].TOWN), recordId: String(rows[0].OBJECTID) }
        : null,
    warnings,
  };
}
