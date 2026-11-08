# Phase 2 MassGIS verification

Implemented and tested November 7, 2026 in the existing GridPath / QORE ProjectSync repository. The existing Google Maps loader, Places widget and records are preserved. `.env.local` was not changed.

## API and sources

`GET /api/gis/site?lat=…&lng=…&address=…` returns parcels, buildings, roads and per-layer errors. `layer=parcels|buildings|roads` supports independent loading/retries. Optional numeric `parcelId` must resolve within the 150 m candidate query. Other layer names and malformed inputs are rejected. Coordinates are checked against Census TIGERweb detailed Massachusetts state geometry, after a coarse bounding-box rejection. Census source: https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0 . An unavailable jurisdiction service returns a recoverable error rather than assuming the point is in MA.

All three user-specified MassGIS services were inspected with JSON metadata and successfully queried. Their exact URLs are centralized in `src/lib/gis/config.ts`. `MASSGIS_SERVICES.json` records the observed metadata snapshot. Parcels and roads are native EPSG:3857, buildings EPSG:26986; all query output uses EPSG:4326. All three advertise JSON and GeoJSON. Runtime checks schemas and query support. An ArcGIS JSON fallback is implemented and unit-tested, including holes and multipart paths. Geometry queries are bounded and use explicit output fields. Each upstream request has a 10-second timeout and one retry for transient failures; GeoJSON rejection can then fall back to JSON. Metadata caches for one hour; successful jurisdiction checks cache for five minutes in a bounded 256-entry memory cache. Feature data is not cached in local storage.

## Live service checks

| Test                                            | Observed result                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 79 Lowland Street, Holliston                    | Google point 42.2096727, -71.4137934; one matching fee parcel, OBJECTID 2251987 / MAP_PAR_ID 012.0-0004-0064.2; automatic association still labelled unverified. Three nearby roofprints, one contained, eleven road segments.                                                                                                                                            |
| 77 Massachusetts Avenue, Cambridge              | Census-geocoded point 42.35895759548, -71.093453252047; ten nearby parcel candidates; no confident point/address match; manual selection requested; five nearby roofprints, no site total asserted, 101 road segments.                                                                                                                                                    |
| 50 Foster Street, Worcester (DCU Center)        | Census-geocoded point 42.264891550213, -71.801210146405; 61 candidates, no automatic selection; thirteen nearby roofprints, 72 road segments. Querying candidate OBJECTID 1703996 returned four nearby roofprints, including one crossing the parcel boundary, excluded from totals. This is a candidate association test, not an independently verified parcel identity. |
| 100 Institute Road, Worcester (WPI)             | Census-geocoded point 42.273133336788, -71.81125656808; 28 candidates, no automatic selection. Querying either returned 100 INSTITUTE RD candidate (2217903 or 2495488) returned 83 nearby roofprints, 25 contained. Duplicate assessment records/candidate ambiguity remain for human review.                                                                            |
| Connecticut point within coarse MA bounding box | 41.8, -72.7 rejected with HTTP 400 after live Census boundary check.                                                                                                                                                                                                                                                                                                      |

Cambridge and Worcester geocoding used the Census public current address benchmark for server integration tests; these are not claims of Google autocomplete selection in the browser. The user has confirmed the existing Places workflow works. This automation still cannot type into Google's closed shadow DOM, so switching between those addresses through the live widget and the resulting overlay removal were not browser-verified. The implementation keys GIS state by Google Place ID and coordinates, aborts obsolete requests, and removes Data listeners/layers on replacement/unmount.

## Actual records versus calculations

For Century-Tywood, assessor `LOT_SIZE` is **12.299 acres**; conversion gives **535,744.44 sq ft / 49,772.287 m²**. The separate approximate geodesic polygon area is **50,515.633 m² / 543,745.746 sq ft / 12.482685 acres**. Both are disclosed rather than substituted silently. Assessment lot area and mapped geometry are different source quantities and require review when they disagree.

The contained structure 207131_884364 (OBJECTID 2767213) reports `AREA_SQ_FT = 78,678.66180644`, source ROLTA, source type ROOFPRINT_SHIFTED, source year **2011**. Nearby outside-parcel structures are not summed. Service metadata update dates observed: parcels 2026-10-30, buildings 2026-05-22, roads 2026-10-06. These do not establish per-feature currency. Roofprint areas and assessor lot size are actual public fields; metric/acre conversions, geodesic areas, point/address matching and polygon associations are derived. The building association method intersects polygons and treats coverage of at least 99.9999% as contained to allow a tiny numerical tolerance. Other positive overlap is flagged as crossing.

## Browser checks on localhost:3000

- Real Google overhead satellite imagery remained visible with Google attribution.
- Real amber parcel, blue roofprints and green road geometry were visually aligned over imagery.
- Roofprint toggle was disabled/re-enabled and road toggle enabled; checkbox state and rendered geometry changed.
- Clicking roofprint, road and parcel map features opened the corresponding native modal drawer with source links, original ID, dates, attributes and unverified status.
- The parcel drawer's Use this parcel action changed the panel to User-selected parcel — needs verification.
- Retry roads displayed Loading roads while parcel and roofprint records remained visible.
- Desktop 1440 px and mobile 390 px layouts were checked. Mobile document width equalled viewport width (390 px), with no horizontal overflow. Browser error-log count was zero. The GIS export action was exercised; the downloaded payload was not inspected through browser automation.

## Automated verification

26 tests pass, including the existing record/evidence/export tests. New tests cover geodesic area and holes, unit conversion, multipolygons, ambiguous/ROW/address-mismatched parcel rejection, contained/crossing/outside roofprints, bounded query envelopes, ArcGIS JSON conversion, deduplication, transfer-limit warnings, fallback and retry limits, malformed API inputs, detailed-state rejection, and partial aggregate success during a mocked road outage. Lint, strict TypeScript and production build pass.

## Limits

- Public assessment polygons are not survey boundaries. Buildings are mapped roofprints, not usable floor area. Roads do not establish truck access. No voltage, transformer capacity, interconnection, siting clearances or feasibility score is inferred.
- Strict parcel matching deliberately needs manual review for street-geocoded points, address aliases, campuses, condominiums and duplicated assessment records. It does not select the nearest parcel. The 150 m candidate radius can miss a correct parcel; the interface then asks for manual selection, but parcels outside that bound require a different address/location or future broader map-based search.
- Building context uses a parcel bounding envelope, so nearby unassociated buildings may be visible. Only contained structures contribute to totals. Counts/totals cover retrieved features; response cap 300 and 2 km envelope caps produce explicit warnings rather than claiming statewide completeness.
- Dataset outages, jurisdiction-service availability and geometry topology errors can prevent a particular operation. Per-layer retries leave the Google address intact. The road-outage test uses a mock; no real upstream outage was induced.
- GIS context exports separately as JSON; saved engineering fields/readiness and review state are not overwritten. Refresh recollects GIS. No new engineering verification or automatic file extraction was added.
- No remaining compile/lint failure observed. End-to-end typed address switching remains a browser verification limit, as noted above.

## Changed files

- `src/lib/gis/config.ts`, `types.ts`, `geometry.ts`, `service.ts`: verified service configuration, source models, measurements, matching, normalization, bounded queries and resilience.
- `src/app/api/gis/site/route.ts`: server API.
- `src/components/gis/useSiteGis.ts`, `GisSiteContext.tsx`: collection lifecycle, controls, panel, details and export.
- `src/components/maps/GoogleAddressWorkspace.tsx`, `GoogleSiteMap.tsx`: selected-address integration, click events and cleanup.
- `src/components/WorkspacePage.tsx`, `src/components/sites/Overview.tsx`, `SiteDetail.tsx`, `src/lib/adapters.ts`: accurate live-GIS copy.
- `src/app/globals.css`: neutral GIS interface and responsive layouts.
- `src/lib/gis.test.ts`: meaningful geometry, matching, fallback and API tests.
- `package.json`, `package-lock.json`: Turf area/point-in-polygon/intersection, Terraformer ArcGIS converter and type packages.
- `README.md`, `docs/MASSGIS_QA.md`, `docs/MASSGIS_SERVICES.json`, `docs/massgis-desktop.png`: setup, implementation and observed verification.
