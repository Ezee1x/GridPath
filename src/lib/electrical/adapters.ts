import { additionalMunicipalPermits } from "./municipal";
import { publicAddressLocation } from "../gis/public-address";
import { normalizedStreet } from "../gis/geometry";
import { observationId } from "../intake/model";
import type {
  ElectricalDiscovery,
  ElectricalSite,
  AdapterResult,
} from "./types";
export const UTILITY_URL =
  "https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/ElectricityProviders/MapServer/0";
export const UTILITY_DOC =
  "https://www.mass.gov/info-details/massgis-data-public-utility-service-providers";
export const BOSTON_RESOURCE = "6ddcd912-32a0-43df-9908-63574f8c7e77";
export const BOSTON_API =
  "https://data.boston.gov/api/3/action/datastore_search";
export const BOSTON_PORTAL =
  "https://data.boston.gov/dataset/approved-building-permits";
export const INTERCONNECTION_URL =
  "https://www.mass.gov/info-details/utility-interconnection-in-massachusetts";
export const MUNICIPAL_PORTALS: Record<string, string> = {
  HOLLISTON:
    "https://www.mapsonline.net/hollistonma/public_permit_reports.html.php",
  WORCESTER: "https://www.worcesterma.gov/building-zoning",
  BOSTON: BOSTON_PORTAL,
  CAMBRIDGE: "https://www.cambridgema.gov/",
  CONCORD: "https://concordma.gov/",
};
async function json(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw Error(`Official source returned HTTP ${response.status}.`);
  const result = await response.json();
  if (result.error || result.success === false)
    throw Error("Official source could not answer this query.");
  return result;
}
export async function UtilityTerritoryAdapter(
  site: ElectricalSite,
  output: ElectricalDiscovery,
) {
  const point = await publicAddressLocation(site.address);
  output.publicAddress = point.address;
  output.municipality =
    point.address.split(",")[1]?.trim().toUpperCase() ?? null;
  const params = new URLSearchParams({
    f: "json",
    geometry: `${point.longitude},${point.latitude}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "OBJECTID,TOWN,TOWN_ID,ELEC,ELEC_LABEL",
    returnGeometry: "false",
  });
  const queryUrl = `${UTILITY_URL}/query?${params}`;
  const result = await json(queryUrl);
  if (!Array.isArray(result.features) || result.exceededTransferLimit)
    throw Error("Utility territory response was incomplete.");
  const rows = result.features.map(
    (f: { attributes: Record<string, unknown> }) => f.attributes,
  );
  const towns = [
    ...new Set(rows.map((a: Record<string, unknown>) => String(a.TOWN))),
  ];
  output.municipality = towns.length === 1 ? String(towns[0]) : null;
  const townMismatch =
    !!site.townId &&
    rows.some(
      (a: Record<string, unknown>) => Number(a.TOWN_ID) !== site.townId,
    );
  for (const a of rows) {
    if (!a.ELEC || !a.OBJECTID || !Number.isInteger(Number(a.TOWN_ID)))
      continue;
    const key = `electric-territory:${a.OBJECTID}`;
    output.sources[key] = {
      key,
      provider: "MassGIS / Massachusetts DPU",
      dataset: "Electricity Providers, by Town (TOWNS_POLY_V_ELEC)",
      serviceUrl: `${UTILITY_URL}/query?${new URLSearchParams({ f: "json", where: `OBJECTID = ${Number(a.OBJECTID)}`, outFields: "*", returnGeometry: "false" })}`,
      featureId: String(a.OBJECTID),
      featureName: String(a.TOWN),
      recordDate: null,
      datasetUpdated: null,
      retrievedAt: output.retrievedAt,
      matchingMethod:
        "Independent Census address point intersected with official MassGIS municipality-level provider polygons; not a meter/service-account match. Dataset vintage is not supplied by the REST feature.",
      townId: Number(a.TOWN_ID),
    };
    // Keep a multi-provider label intact; do not guess which part serves the site.
    output.utilityCandidates.push({
      name: String(a.ELEC),
      townId: Number(a.TOWN_ID),
      recordId: String(a.OBJECTID),
      sourceKey: key,
    });
    const method =
      "Municipality-level territory candidate only. Confirm actual serving utility using a recent utility bill. No tariff, service rating or interconnection approval inferred.";
    output.observations.push({
      fieldId: "utility",
      observation: {
        id: observationId(
          "utility",
          String(a.ELEC),
          "MassGIS / Massachusetts DPU",
          [key],
          method,
          null,
        ),
        value: String(a.ELEC),
        unit: null,
        originalUnits: null,
        sourceKeys: [key],
        method,
        provider: "MassGIS / Massachusetts DPU",
        provenance: "Public GIS record",
        confidence: "Documented",
        observedAt: output.retrievedAt,
        complete: false,
        warnings: [
          "Candidate service provider; municipality coverage does not prove this property's connection.",
          ...(townMismatch
            ? [
                "Municipality disagrees with the selected parcel. Verify address and parcel before using this candidate.",
              ]
            : []),
          ...(rows.length > 1 || /,|;| and |\//i.test(String(a.ELEC))
            ? [
                "Multiple providers may serve this municipality. Confirm with the facility's bill.",
              ]
            : []),
        ],
        autoSelect: !townMismatch && rows.length === 1,
      },
    });
  }
  return {
    adapter: "UtilityTerritoryAdapter",
    status: output.utilityCandidates.length ? "found" : "empty",
    sourceUrl: queryUrl,
    message: townMismatch
      ? "Candidate territory conflicts with the selected parcel municipality; manual verification required."
      : `${output.utilityCandidates.length} municipality-level provider record(s) found. Actual service requires bill confirmation.`,
  } satisfies AdapterResult;
}
const parcelDigits = (value: string) => value.replace(/^0+/, "");
export async function MunicipalPermitAdapter(
  site: ElectricalSite,
  output: ElectricalDiscovery,
): Promise<AdapterResult> {
  const town = output.municipality;
  if (town === "CAMBRIDGE" || town === "WORCESTER")
    return additionalMunicipalPermits(site, output);
  if (town !== "BOSTON")
    return {
      adapter: "MunicipalPermitAdapter",
      status: "unavailable",
      sourceUrl:
        MUNICIPAL_PORTALS[town ?? ""] ??
        "https://www.mass.gov/lists/massachusetts-city-and-town-websites",
      message:
        "No supported public permit API for this municipality. Use the official municipal portal for manual record research; no absence of permits is implied.",
    };
  const street = normalizedStreet(output.publicAddress ?? site.address);
  const params = new URLSearchParams({
    resource_id: BOSTON_RESOURCE,
    q: JSON.stringify({ address: street }),
    filters: JSON.stringify({ worktype: "ELECTRICAL" }),
    limit: "100",
    sort: "issued_date desc",
  });
  const queryUrl = `${BOSTON_API}?${params}`;
  const data = await json(queryUrl);
  if (!Array.isArray(data.result?.records))
    throw Error("Boston permit response is missing records.");
  for (const r of data.result.records) {
    if (
      String(r.city).toUpperCase() !== "BOSTON" ||
      r.state !== "MA" ||
      normalizedStreet(String(r.address)) !== street
    )
      continue;
    if (
      site.parcelId &&
      /^\d+$/.test(site.parcelId) &&
      parcelDigits(String(r.parcel_id)) !== parcelDigits(site.parcelId)
    )
      continue;
    const id = String(r.permitnumber ?? "");
    if (!id || output.permits.some((p) => p.id === id)) continue;
    const sourceUrl = `${BOSTON_API}?${new URLSearchParams({ resource_id: BOSTON_RESOURCE, filters: JSON.stringify({ permitnumber: id }), limit: "10" })}`;
    const key = `boston-electrical-permit:${id}`;
    const matchingMethod = `Exact normalized street address and Boston municipality${site.parcelId && /^\d+$/.test(site.parcelId) ? "; numeric parcel ID also matches (leading-zero normalization)" : "; parcel relationship unconfirmed, address match is a candidate"}. Permit issue/status does not establish installation or current condition.`;
    output.permits.push({
      id,
      category: String(r.permittypedescr),
      issuedDate: r.issued_date ?? null,
      filingDate: null,
      status: String(r.status),
      address: String(r.address),
      parcelId: String(r.parcel_id ?? ""),
      description: String(r.comments || r.description || "").slice(0, 3000),
      sourceUrl,
      documentUrls: [],
      documentAvailability: "Not exposed by this dataset",
      condition: "Historical record; current installation unknown",
      matchingMethod,
    });
    output.sources[key] = {
      key,
      provider: "City of Boston Inspectional Services",
      dataset: "Approved Building Permits — electrical records",
      serviceUrl: sourceUrl,
      featureId: id,
      featureName: String(r.address),
      recordDate: r.issued_date ?? null,
      datasetUpdated: null,
      retrievedAt: output.retrievedAt,
      matchingMethod,
    };
  }
  if (output.permits.length) {
    const keys = output.permits.map((p) => `boston-electrical-permit:${p.id}`);
    const value = `${output.permits.length} public electrical permit records matched. Historical/proposed work; current equipment and drawing availability require confirmation.`;
    const method =
      "City of Boston CKAN query with exact address/municipality and available parcel-ID validation. No equipment ratings extracted from permit descriptions.";
    output.observations.push({
      fieldId: "permits",
      observation: {
        id: observationId(
          "permits",
          value,
          "City of Boston Inspectional Services",
          keys,
          method,
          null,
        ),
        value,
        unit: null,
        originalUnits: null,
        sourceKeys: keys,
        method,
        provider: "City of Boston Inspectional Services",
        provenance: "Public GIS record",
        confidence: "Documented",
        observedAt: output.retrievedAt,
        warnings: [
          "Permit status Open/Closed is not proof of completed work or installed equipment.",
        ],
      },
    });
  }
  return {
    adapter: "MunicipalPermitAdapter",
    status: output.permits.length ? "found" : "empty",
    sourceUrl: queryUrl,
    message: `${output.permits.length} exact-address electrical permit matches. ${data.result.total > 100 ? "Results capped at 100 recent source records; research older records manually. " : ""}Filing dates and drawing URLs are not exposed; no current electrical ratings inferred.`,
  };
}
export function PublicElectricalRecordsAdapter(): AdapterResult {
  return {
    adapter: "PublicElectricalRecordsAdapter",
    status: "unavailable",
    sourceUrl: INTERCONNECTION_URL,
    message:
      "Official DPU interconnection reports and filings are available for manual research. No reliable site-to-account/project identifier is available for automatic joining. Generic engineering requirements do not confirm equipment, tariff or approval.",
  };
}
export async function discoverElectrical(
  site: ElectricalSite,
): Promise<ElectricalDiscovery> {
  const output: ElectricalDiscovery = {
    siteKey: site.siteKey,
    parcelFeatureId: site.parcelFeatureId,
    retrievedAt: new Date().toISOString(),
    queryAddress: site.address,
    publicAddress: null,
    municipality: null,
    adapters: [],
    utilityCandidates: [],
    permits: [],
    observations: [],
    sources: {},
    fieldResults: {},
    customerRequests: [],
    documentEvidence: [],
  };
  let began = Date.now(),
    startedAt = new Date().toISOString();
  try {
    output.adapters.push(await UtilityTerritoryAdapter(site, output));
  } catch (error) {
    output.adapters.push({
      adapter: "UtilityTerritoryAdapter",
      status: "error",
      sourceUrl: UTILITY_URL,
      message:
        error instanceof Error ? error.message : "Utility source unavailable.",
    });
  }
  output.adapters.at(-1)!.startedAt = startedAt;
  output.adapters.at(-1)!.durationMs = Date.now() - began;
  began = Date.now();
  startedAt = new Date().toISOString();
  try {
    output.adapters.push(await MunicipalPermitAdapter(site, output));
  } catch (error) {
    output.adapters.push({
      adapter: "MunicipalPermitAdapter",
      status: "error",
      sourceUrl: BOSTON_PORTAL,
      message:
        error instanceof Error ? error.message : "Permit source unavailable.",
    });
  }
  output.adapters.at(-1)!.startedAt = startedAt;
  output.adapters.at(-1)!.durationMs = Date.now() - began;
  output.adapters.push(PublicElectricalRecordsAdapter());
  return output;
}
