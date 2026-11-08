import { observationId } from "../intake/model";
import { normalizedStreet } from "../gis/geometry";
import type {
  ElectricalDiscovery,
  ElectricalSite,
  AdapterResult,
} from "./types";
const CAMBRIDGE = "https://data.cambridgema.gov/resource/hvtc-3ab9.json";
const WORCESTER =
  "https://services1.arcgis.com/j8dqo2DJE7mVUBU1/arcgis/rest/services/Building_Permits/FeatureServer/0/query";
const ordinals: Record<string, string> = {
  FIRST: "1ST",
  SECOND: "2ND",
  THIRD: "3RD",
  FOURTH: "4TH",
  FIFTH: "5TH",
  SIXTH: "6TH",
  SEVENTH: "7TH",
  EIGHTH: "8TH",
  NINTH: "9TH",
  TENTH: "10TH",
};
export const municipalStreetKey = (address: string) =>
  normalizedStreet(address)
    .split(" ")
    .map((word) => ordinals[word] ?? word)
    .join(" ");
export async function additionalMunicipalPermits(
  site: ElectricalSite,
  output: ElectricalDiscovery,
): Promise<AdapterResult> {
  const cambridge = output.municipality === "CAMBRIDGE",
    street = normalizedStreet(output.publicAddress ?? site.address),
    safe = street.replace(/'/g, "''");
  const variants = [
    ...new Set([
      street,
      normalizedStreet(site.address),
      street
        .split(" ")
        .map(
          (word) =>
            Object.entries(ordinals).find(([, v]) => v === word)?.[0] ?? word,
        )
        .join(" "),
    ]),
  ];
  const query = cambridge
    ? new URLSearchParams({
        $where: variants
          .map(
            (v) =>
              `starts_with(upper(full_address),'${v.replace(/'/g, "''")}')`,
          )
          .join(" OR "),
        $limit: "100",
        $order: "issue_date DESC",
      })
    : new URLSearchParams({
        f: "json",
        where: `UPPER(Address) LIKE '${safe}%'`,
        outFields: "*",
        returnGeometry: "false",
        resultRecordCount: "100",
      });
  const url = `${cambridge ? CAMBRIDGE : WORCESTER}?${query}`;
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw Error(`Municipal permit source returned ${response.status}.`);
  const data = await response.json();
  if (data.error) throw Error("Municipal permit query failed.");
  const rows: Record<string, unknown>[] = cambridge
    ? data
    : data.features?.map(
        (f: { attributes: Record<string, unknown> }) => f.attributes,
      );
  if (!Array.isArray(rows))
    throw Error("Municipal permit response incomplete.");
  for (const row of rows) {
    const address = String(cambridge ? row.full_address : row.Address),
      stripped = address.replace(/\s+Worcester\s+MA\s+\d{5}.*$/i, "");
    if (municipalStreetKey(stripped) !== municipalStreetKey(street)) continue;
    const id = String(cambridge ? row.id : row.Record__);
    if (!id || id === "undefined") continue;
    if (
      !cambridge &&
      site.parcelId &&
      row.MBL &&
      String(row.MBL)
        .replace(/[^a-z0-9]/gi, "")
        .toUpperCase() !==
        site.parcelId.replace(/[^a-z0-9]/gi, "").toUpperCase()
    )
      continue;
    const key = `${cambridge ? "cambridge" : "worcester"}-permit:${id}`;
    const sourceUrl = cambridge
      ? `${CAMBRIDGE}?${new URLSearchParams({ id })}`
      : `${WORCESTER}?${new URLSearchParams({ f: "json", where: `ObjectId=${Number(row.ObjectId)}`, outFields: "*", returnGeometry: "false" })}`;
    const date =
      String(
        (cambridge ? row.issue_date : row.Permit_License_Issued_Date) || "",
      ) || null;
    const method = `Exact normalized address in ${output.municipality}; ${!cambridge && site.parcelId ? "MBL also matches" : "parcel relationship unconfirmed"}. Historical permit record, not current installed equipment.`;
    output.permits.push({
      id,
      category: String(
        cambridge ? (row.permit_type ?? "Electrical permit") : row.Record_Type,
      ),
      issuedDate: date,
      filingDate: cambridge
        ? String(row.applicant_submit_date || "") || null
        : String(row.Date_Submitted || "") || null,
      status: String(cambridge ? row.status : row.Record_Status),
      address,
      parcelId: String(cambridge ? (row.mbl ?? "") : (row.MBL ?? "")),
      description: String(
        cambridge
          ? (row.proposed_work_description ?? "")
          : (row.Permit_For ?? ""),
      ).slice(0, 3000),
      sourceUrl,
      documentUrls: [],
      documentAvailability: "Not exposed by this dataset",
      condition: "Historical record; current installation unknown",
      matchingMethod: method,
    });
    output.sources[key] = {
      key,
      provider: `City of ${cambridge ? "Cambridge" : "Worcester"}`,
      dataset: cambridge
        ? "Electrical Permits"
        : "Building Permits (historical context; not electrical ratings)",
      serviceUrl: sourceUrl,
      featureId: id,
      featureName: address,
      recordDate: date,
      datasetUpdated: null,
      retrievedAt: output.retrievedAt,
      matchingMethod: method,
    };
  }
  if (output.permits.length) {
    const keys = Object.keys(output.sources).filter((k) =>
      k.startsWith(`${cambridge ? "cambridge" : "worcester"}-permit:`),
    );
    const provider = `City of ${cambridge ? "Cambridge" : "Worcester"}`;
    const value = `${output.permits.length} matched historical ${cambridge ? "electrical" : "building"} permit records; current installation unconfirmed.`;
    const method =
      "Official municipal records matched by normalized address and available parcel relationship. Historical context only; no electrical ratings inferred.";
    output.observations.push({
      fieldId: "permits",
      observation: {
        id: observationId("permits", value, provider, keys, method, null),
        value,
        unit: null,
        originalUnits: null,
        sourceKeys: keys,
        method,
        provider,
        provenance: "Public GIS record",
        confidence: "Documented",
        observedAt: output.retrievedAt,
        warnings: [
          "Permit status does not confirm completed work or current equipment.",
        ],
      },
    });
  }
  return {
    adapter: "MunicipalPermitAdapter",
    status: output.permits.length ? "found" : "empty",
    sourceUrl: url,
    message: `${output.permits.length} exact-address ${cambridge ? "electrical" : "building"} permit matches. Historical context only; current electrical ratings remain unconfirmed.${rows.length >= 100 ? " Source results capped at 100; research older records manually." : ""}`,
  };
}
