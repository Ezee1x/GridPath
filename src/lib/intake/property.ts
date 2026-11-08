import type { SelectedAddress } from "../maps/address";
import type { SiteAnalysis } from "../gis/analysis-types";
import type { GisLayerResult } from "../gis/types";
import type { PropertyData } from "../gis/property";
import { normalizedStreet, parcelSourceMeasurement } from "../gis/geometry";
import { observationId } from "./model";
import type { NormalizedCollection } from "./adapters";
import type { JsonValue } from "./types";
export const ASSESSOR_URL =
  "https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/MassachusettsPropertyTaxParcels/FeatureServer/4";
export const MUNICIPALITY_URL =
  "https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/TownSurveyGenCoast_gdb/FeatureServer/1";
const clean = (v: unknown): string | null => {
  const text = v === null || v === undefined ? "" : String(v).trim();
  return text && !/^(null|unknown|n\/a|none|not available)$/i.test(text)
    ? text
    : null;
};
export function propertyFields(
  analysis: SiteAnalysis,
  address: Omit<SelectedAddress, "source"> & { source: string },
  parcels: GisLayerResult | null,
  data?: PropertyData,
): NormalizedCollection {
  const fields: NormalizedCollection["fields"] = [],
    sources: NormalizedCollection["sources"] = {};
  const parcel = parcels?.features.find(
      (f) => f.properties.id === analysis.parcel.featureId,
    ),
    a = parcel?.properties.attributes;
  const locId = clean(a?.LOC_ID),
    townId = Number(a?.TOWN_ID);
  const usableData =
    data &&
    data.townId === townId &&
    (data.locId === locId || data.locId === "")
      ? data
      : undefined;
  function add(
    id: string,
    value: JsonValue,
    unit: string | null,
    keys: string[],
    method: string,
    complete = true,
    warnings: string[] = [],
    calculated = false,
    originalUnits: string | null = unit,
    provider = "MassGIS",
  ) {
    fields.push({
      fieldId: id,
      observation: {
        id: observationId(id, value, provider, keys, method, unit),
        value,
        unit,
        originalUnits,
        provider,
        sourceKeys: keys,
        method,
        provenance:
          provider === address.source && address.source !== "MassGIS"
            ? "Public GIS record"
            : calculated
              ? "Calculated from GIS geometry"
              : "Public GIS record",
        confidence: calculated ? "Estimated" : "Documented",
        observedAt: new Date().toISOString(),
        complete,
        warnings,
      },
    });
  }
  const addressKey = "address:point";
  sources[addressKey] = {
    key: addressKey,
    provider: address.source,
    dataset: `${address.source} selected address`,
    serviceUrl:
      address.source === "Google Places"
        ? `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(address.placeId)}&query=${encodeURIComponent(address.formattedAddress)}`
        : "https://geocoding.geo.census.gov/geocoder/",
    featureId: address.placeId,
    featureName: address.formattedAddress,
    recordDate: null,
    datasetUpdated: null,
    retrievedAt: address.retrievedAt,
    matchingMethod: "Selected address; not a verified parcel centroid.",
  };
  const addressWarnings: string[] = [];
  const entries: {
    key: string;
    attributes: Record<string, unknown>;
    joined: boolean;
  }[] = [];
  // The hosted service already joins assessor attributes. Do not discard those when the separate table is incomplete.
  if (parcel && a) {
    const key = `parcels:${parcel.properties.id}`;
    sources[key] = {
      key,
      provider: "MassGIS",
      dataset: parcel.properties.source.name,
      serviceUrl: `${parcel.properties.source.url}/${parcel.properties.id}`,
      featureId: parcel.properties.id,
      featureName: parcel.properties.name,
      recordDate: parcel.properties.sourceDate,
      datasetUpdated: parcel.properties.source.datasetUpdated,
      retrievedAt: parcel.properties.source.retrievedAt,
      fiscalYear: Number(a.FY) || null,
      locId,
      townId: Number.isInteger(townId) ? townId : null,
      propertyId: clean(a.PROP_ID),
      matchingMethod:
        "Selected hosted parcel OBJECTID; prejoined L3_TAXPAR_POLY / L3_ASSESS export. No proximity-based assessor join.",
    };
    // Missing LOC_ID/NO_MATCH prevents trusting attributes as linked assessor facts.
    if (
      locId &&
      Number.isInteger(townId) &&
      String(a.NO_MATCH ?? "N").toUpperCase() !== "Y"
    )
      entries.push({ key, attributes: a, joined: true });
    else
      addressWarnings.push(
        "Assessor linkage is missing or flagged NO_MATCH. Assessor attributes are not assigned to this parcel.",
      );
    if (clean(a.MAP_PAR_ID))
      add(
        "parcelId",
        clean(a.MAP_PAR_ID)!,
        null,
        [key],
        `MAP_PAR_ID is the displayed parcel ID. LOC_ID ${locId ?? "not available"} is retained separately as the internal matching key; TOWN_ID ${Number.isInteger(townId) ? townId : "not available"}.`,
        true,
        analysis.parcel.requiresVerification
          ? ["Parcel association needs verification."]
          : [],
      );
    // Retain selected parcel source area and the independent polygon calculation.
    const m = entries.length
      ? analysis.metrics.parcelArea
      : analysis.metrics.mappedParcelArea;
    if (m.values)
      add(
        "parcelArea",
        m.values as unknown as JsonValue,
        m.values[0]?.unit ?? null,
        m.sources,
        m.method,
        true,
        m.notes,
        m.quality !== "source-backed",
        m.quality === "source-backed"
          ? clean(a.LOT_UNITS)
          : "WGS84 geometry; projected meters",
      );
  }
  if (usableData && String(a?.NO_MATCH ?? "N").toUpperCase() !== "Y")
    for (const r of usableData.assessor.records) {
      if (String(r.LOC_ID) !== locId || Number(r.TOWN_ID) !== townId) continue;
      const key = `assessor:${townId}:${String(r.OBJECTID)}`;
      sources[key] = {
        key,
        provider: "MassGIS / municipal assessor",
        dataset: "L3_ASSESS public assessor extract",
        serviceUrl: `${ASSESSOR_URL}/${String(r.OBJECTID)}`,
        featureId: String(r.OBJECTID),
        featureName: clean(r.SITE_ADDR) ?? clean(r.PROP_ID),
        recordDate: null,
        datasetUpdated: null,
        retrievedAt: usableData.retrievedAt,
        fiscalYear: Number(r.FY) || null,
        locId,
        townId,
        propertyId: clean(r.PROP_ID),
        matchingMethod:
          "Exact LOC_ID AND TOWN_ID match; individual tax records retained, not nearest-coordinate matching.",
      };
      entries.push({ key, attributes: r, joined: false });
    }
  for (const entry of entries) {
    const entryFieldStart = fields.length;
    const r = entry.attributes,
      keys = [entry.key],
      fiscalYear = Number(r.FY) || null;
    const method = `${entry.joined ? "Published joined parcel record" : "Exact LOC_ID + TOWN_ID assessor-table join"}; PROP_ID ${clean(r.PROP_ID) ?? "not available"}; FY ${fiscalYear ?? "not available"}.`;
    const street = clean(r.SITE_ADDR);
    if (street)
      add(
        "address",
        [street, clean(r.CITY), "MA", clean(r.ZIP)].filter(Boolean).join(", "),
        null,
        keys,
        `${method} Assessor SITE_ADDR, CITY and ZIP retained separately from the selected Maps address.`,
      );
    if (
      street &&
      normalizedStreet(street) !== normalizedStreet(address.formattedAddress)
    )
      addressWarnings.push(
        `Assessor address differs: ${street} (record ${String(r.OBJECTID)}, FY ${fiscalYear ?? "not available"}). Selected address retained.`,
      );
    if (
      clean(r.ZIP) &&
      address.postalCode &&
      clean(r.ZIP) !== address.postalCode
    )
      addressWarnings.push(
        `Assessor ZIP ${clean(r.ZIP)} differs from selected-address ZIP ${address.postalCode}.`,
      );
    if (
      clean(r.CITY) &&
      address.city &&
      clean(r.CITY)!.toUpperCase() !== address.city.toUpperCase()
    )
      addressWarnings.push(
        `Assessor municipality/postal city ${clean(r.CITY)} differs from the selected address city. Confirm the official town-ID record.`,
      );
    // An assessor record's land area is never summed across tax records or buildings.
    const area = parcelSourceMeasurement(r);
    if (!entry.joined && area)
      add(
        "parcelArea",
        [
          { value: area.squareFeet, unit: "sq ft" },
          { value: area.squareMeters, unit: "m²" },
          { value: area.acres, unit: "acres" },
        ],
        "sq ft",
        keys,
        `${method} ${area.method}. Not summed across assessor records.`,
        true,
        [],
        false,
        clean(r.LOT_UNITS),
      );
    const code = clean(r.USE_CODE);
    const lookup = parcels?.features.filter(
      (f) =>
        clean(f.properties.attributes.LOC_ID) === locId &&
        String(f.properties.attributes.TOWN_ID) === String(townId) &&
        clean(f.properties.attributes.USE_CODE) === code &&
        clean(f.properties.attributes.TOWNID_UC) === `${townId}_${code}` &&
        clean(f.properties.attributes.USE_DESC),
    );
    const descriptions = [
      ...new Set(
        lookup
          ?.map((f) => clean(f.properties.attributes.USE_DESC)!)
          .filter((d) => /[A-Za-z]/.test(d)),
      ),
    ];
    if (code && descriptions.length === 1) {
      const lookupKeys = lookup!.map((f) => `parcels:${f.properties.id}`);
      add(
        "landUse",
        { description: descriptions[0], useCode: code },
        null,
        [...new Set([...keys, ...lookupKeys])],
        `${method} USE_CODE resolved using MassGIS published town/use-code lookup description USE_DESC with exact TOWNID_UC ${townId}_${code}. Municipal custom codes are not truncated or guessed.`,
        true,
      );
    }
    if (clean(r.ZONING))
      add(
        "zoning",
        {
          assessorZoning: clean(r.ZONING),
          confirmation: "Municipal confirmation required",
        },
        null,
        keys,
        `${method} Assessor ZONING attribute; not a current legally authoritative zoning map or interpretation.`,
        true,
        ["Municipal confirmation required"],
      );
    const olderFiscalYear =
      !entry.joined && Number(r.FY) > 0 && Number(a?.FY) > Number(r.FY);
    const selectedTaxRecord =
      entry.joined ||
      (!!clean(a?.PROP_ID) && clean(r.PROP_ID) === clean(a?.PROP_ID));
    for (const item of fields.slice(entryFieldStart)) {
      item.observation.autoSelect = selectedTaxRecord && !olderFiscalYear;
      if (olderFiscalYear)
        item.observation.warnings = [
          ...(item.observation.warnings ?? []),
          "Older assessor fiscal year than the selected joined extract. Retained as an alternative; not automatically selected.",
        ];
      if (!selectedTaxRecord)
        item.observation.warnings = [
          ...(item.observation.warnings ?? []),
          "Additional tax record shares LOC_ID/TOWN_ID but does not match the selected parcel feature's PROP_ID. Retained for review; not automatically selected.",
        ];
    }
  }
  if (usableData?.municipality) {
    const key = `municipality:${townId}`;
    sources[key] = {
      key,
      provider: "MassGIS",
      dataset: "Municipalities (Multi-part with Generalized Coast)",
      serviceUrl: `${MUNICIPALITY_URL}/${usableData.municipality.recordId}`,
      featureId: usableData.municipality.recordId,
      featureName: usableData.municipality.name,
      recordDate: null,
      datasetUpdated: null,
      retrievedAt: usableData.retrievedAt,
      townId,
      locId,
      matchingMethod:
        "Selected parcel TOWN_ID equals municipal boundary record TOWN_ID; not inferred from postal city.",
    };
    add(
      "municipalityAhj",
      {
        municipality: usableData.municipality.name,
        authorityHavingJurisdiction: null,
      },
      null,
      [key],
      "Official MassGIS TOWN name by exact parcel TOWN_ID. Municipality does not confirm the AHJ for electrical, fire, building or other permits.",
      false,
      ["Exact permitting authority remains unconfirmed."],
    );
  }
  // The map's selected address and coordinates stay the primary session observation.
  const assessorKeys = entries.map((e) => e.key);
  add(
    "address",
    address.formattedAddress,
    null,
    [addressKey, ...assessorKeys],
    `${address.source} selected address compared with every available linked assessor SITE_ADDR; street suffixes normalized; disagreements retained in warnings. No silent replacement.`,
    true,
    [...new Set(addressWarnings)],
    false,
    null,
    address.source,
  );
  add(
    "coordinates",
    { latitude: address.latitude, longitude: address.longitude },
    "WGS84 degrees",
    [addressKey],
    `${address.source} address-location coordinates used by the map; not a verified parcel centroid. Google-derived coordinates are session-only and excluded from persistent storage and portable export.`,
    true,
    [],
    false,
    "WGS84 degrees",
    address.source,
  );
  return { fields, sources };
}
