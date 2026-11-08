# Phase 5A — Property Identification

Implemented in the existing Next.js/TypeScript repository. The seven Property Identification rows, source dialog, readiness calculation and export are reused. No new metric cards, field categories, electrical values, FEMA or municipal zoning integrations were added.

## Investigation and source structure

The [official MassGIS parcel documentation](https://www.mass.gov/info-details/massgis-data-property-tax-parcels) describes separate TaxPar polygons, L3_ASSESS records and a UC_LUT lookup. The HTML and linked state use-code booklet were read from Mass.gov; the web browsing fetch returned 403, but the official documents were accessible with a normal HTTP request.

The [currently used hosted service](https://services1.arcgis.com/hGdibHYSPO59RG1h/ArcGIS/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer?f=pjson) explicitly describes a prejoined L3_TAXPAR_POLY/L3_ASSESS export with stacked polygons. It has no separate tables or relationships. Its active layer exposes all investigated fields: OBJECTID, MAP_PAR_ID, LOC_ID, SITE_ADDR, CITY, ZIP, USE_CODE, USE_DESC, TOWNID_UC, ZONING, TOWN_ID, LOT_SIZE, LOT_UNITS and FY. Several were previously omitted from the app's outFields list.

A separate official service **does** expose the assessor table:

- [Four-layer parcel service](https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/MassachusettsPropertyTaxParcels/FeatureServer)
- [TaxPar layer 1](https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/MassachusettsPropertyTaxParcels/FeatureServer/1)
- [L3_ASSESS table 4](https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/MassachusettsPropertyTaxParcels/FeatureServer/4)

The layer/table metadata declares a LOC_ID relationship. The new property endpoint queries the assessor table with exact **LOC_ID AND TOWN_ID**, requests attributes only, checks returned identifiers and retains individual records. It never joins assessor data by nearest coordinates. It retrieves PROP_ID and MA_PROP_ID as well as fiscal year and substantive property fields. Existing spatial parcel queries are reused rather than repeated to populate the dashboard.

[Official municipal names](https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/TownSurveyGenCoast_gdb/FeatureServer/1) are resolved through TOWN_ID. CITY/postal city is not treated as proof of municipal jurisdiction. The AHJ remains null until supported by permitting-specific evidence.

Use descriptions come from the current official MassGIS **published USE_DESC / TOWNID_UC lookup result**, matched to the selected LOC_ID, TOWN_ID and exact USE_CODE. Municipal four-digit codes are preserved rather than truncated to a state three-digit code. The statewide [DOR code booklet](https://www.mass.gov/doc/property-type-classification-codes-booklet/download) was examined for the official code framework; it is not used to guess municipal custom codes. No standalone UC_LUT REST table was found in the investigated services. When the published description is missing or ambiguous, land use stays missing. A viable fallback is the municipality's official UC_LUT in the [MassGIS municipal parcel downloads](https://www.mass.gov/doc/massgis-parcel-data-download-links-table/download), or a municipal assessor explanation, attached through the existing explicit evidence-input workflow. There is no invented lookup API.

## Field report

| Field | Retrieval implementation | Value source | Verification and unresolved limits |
| --- | --- | --- | --- |
| Address | Implemented, with comparisons | Active selected Places address; separate public SITE_ADDR/CITY/ZIP observations | Suffix-normalized street, ZIP and city disagreements are flagged; selected address is not silently replaced. Missing assessor SITE_ADDR stays missing in the source record. |
| Geographic coordinates | Implemented in active Maps session | Existing Google map point | Address-location point, not surveyed centroid. Google details are excluded from persistent records and portable export. Independent public GIS query coordinates are separately identified. |
| Municipality and AHJ | Municipality implemented; AHJ partial | MassGIS municipal TOWN matched on parcel TOWN_ID | Municipality is source-backed. AHJ is null and the compound field remains incomplete. No permit authority is inferred. |
| Parcel ID | Implemented when supplied | Hosted MAP_PAR_ID | LOC_ID, TOWN_ID, PROP_ID and assessor record identifiers retained separately. Missing MAP_PAR_ID is not replaced by LOC_ID in this substantive field. Parcel association remains unverified. |
| Parcel area | Implemented | Valid assessor LOT_SIZE/LOT_UNITS and separate projected polygon measurement | A/S and spelled-out units recognized; unknown units are not guessed. Individual assessor areas are never summed. Geometric area remains a distinct calculation. |
| Assessor land use | Implemented where an exact published description exists | MassGIS USE_CODE + published USE_DESC, matched by TOWNID_UC | Description and original code displayed together. Unresolved codes stay missing; no numeric code is presented as a classification description. |
| Zoning | Assessor field implemented; current legal zoning not integrated | Joined parcel and linked L3_ASSESS ZONING | Explicitly labeled assessor zoning, “Municipal confirmation required.” Null values stay missing. Current municipal zoning map/bylaw confirmation remains outstanding. |

No public observation is automatically Engineer Verified. Evidence stores provider, source record URL/ID, FY when supplied, retrieval time, matching method, original/current units, confidence, review state and original records. A dataset edit date is not substituted for an assessor fiscal year.

## Multiple records, uncertainty and preservation

All linked tax records remain separate observations. A table record can become the default only when its PROP_ID matches the selected hosted feature; older fiscal years remain alternatives. Other tax listings are retained for review and cannot silently take over the selected property record. Existing pinned/verified selections are preserved. Changed source vintages are versioned rather than rewriting evidence attached to an earlier verified observation. Actual disagreements are flagged, while floating-point conversion noise and adding a code to an unchanged legacy description do not create false conflicts.

Missing LOC_ID or NO_MATCH prevents assigning linked assessor facts. Municipality lookup can still use a valid TOWN_ID. Source failures preserve successful parcel results. Truncated responses are flagged. Request cancellation, keyed dashboards and returned-key validation prevent late responses from crossing site/parcel boundaries. Property enrichment uses the latest completed geographic analysis rather than replacing it with an earlier in-flight snapshot.

## Google data handling

[Google's Maps JavaScript policies](https://developers.google.com/maps/documentation/javascript/policies) restrict storage/export and explicitly identify Places-coordinate point-in-polygon analysis as prohibited derived use. The existing map point is preserved for Maps display. GIS requests now obtain one independent U.S. Census address-geocoder result per address (shared across concurrent layer calls for five minutes); parcel matching and the geographic projection use that independent point. If no single Massachusetts match exists, the GIS lookup reports unavailable rather than falling back to Google coordinates. This adds a public-geocoder dependency but does not replace Maps/Places or its marker.

The independent public point may differ from the Google marker. It is not automatically treated as proof of parcel association. All three live test addresses required explicit parcel selection because the public point did not lie within the address-matching parcel polygon. This is visible uncertainty, not a successful automatic match.

The storage/export filter removes Google Places address/coordinate observations and sources while retaining exempt Place IDs, user observations and independently sourced public records. Verified review metadata is never transferred to a different observation during filtering. Active-session counts can therefore exceed portable-export counts by the omitted coordinate field. Legacy valid v2 stored records are sanitized when the intake opens; excluded Google-based review metadata is retained separately without transferring verification to another value. Old saved Google observations are not re-saved; current Places details are refreshed through the existing Place-ID restoration path. This is an implementation safeguard, not a claim of legal certification for every deployment's Google agreement.

## Live tests — November 7, 2026

Run `npx tsx scripts/verify-property-identification.ts` with the dev server running. It does not seed browser records. Deliberately different input map coordinates are ignored by the Google-source API path; independent Census coordinates drive the lookup. Full records are in `PHASE5A_LIVE_RESULTS.json`.

| Address | Hosted OBJECTID / MAP_PAR_ID | LOC_ID | Table OBJECTID / FY | Active property completeness |
| --- | --- | --- | --- | --- |
| 25 Southgate St, Worcester | 588601 / 07-024-01-03 | F_571469_2915601 | 22469114 / 2026 | 6/7; AHJ incomplete |
| 200 Clarendon St, Boston | 2380675 / 0401134000 | F_771022_2952578 | 15000698 / 2023 | 5/7; AHJ and zoning missing |
| 79 Lowland St, Holliston | 2251987 / 012.0-0004-0064.2 | M_207103_884292 | 20334052 / 2025 | 6/7; AHJ incomplete |

Street addresses match the selected hosted features. Identifier joins resolve only the corresponding town/parcel. These are manual QA associations, not surveyed or engineer-verified matches. Boston provides a genuine incomplete-assessor case: ZONING is null. Holliston's separate assessor SITE_ADDR is null while the hosted joined layer supplies it, demonstrating why one response must not erase the other.

## Validation

- 50 automated tests: identifier constraints, wrong-site rejection, missing linkage/NO_MATCH, unresolved use code, multiple tax records, verified-value preservation, source units, portable filtering and independent-geocoder deduplication/failure, plus existing Maps/GIS/intake tests.
- Browser: unchanged Lowland satellite marker; explicit parcel selection; seven property rows; 6 collected/1 incomplete; land-use evidence with exact fiscal year, record ID, LOC_ID and TOWN_ID; assessor zoning confirmation label. No raw JSON in the property value rows.
- Actual button download: 59-field JSON, public Census query point, public parcel/assessor references, zoning I, and no Google Places coordinate observations or Google Places evidence sources. Portable whole-record readiness was 13 populated versus 14 in the active session, because the map-coordinate field was intentionally omitted.
- Type check, lint and production build passed. Production port 3001 still requires an allowed Google referrer; no credential changes were made. Browser QA uses the working localhost:3000 origin.

Existing Phase 2–4 artifacts are historical and preserved; their automatic matching points and export behavior predate the Phase 5A data-handling changes.

Final production API smoke checks returned HTTP 200 for Holliston's exact assessor key and for a Boston municipality-only lookup without LOC_ID. The latter explicitly reported `unmatched`, no assessor records and incomplete assessor coverage. A development hot-refresh dependency-array warning occurred while editing hooks; a full browser reload produced zero new console errors.
