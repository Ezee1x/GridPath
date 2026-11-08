# Phase 3: Geographic Measurements and Site Data Readiness

Implemented in the existing GridPath / QORE ProjectSync application on November 7, 2026. Phase 2 changes were already present in the working tree and were preserved. Google address search, satellite imagery, GIS overlays, feature drawers, per-layer retries, saved records and original GIS JSON export remain available. No API key or `.env.local` change was made.

## Measurement methods

- Proj4 converts WGS84 coordinates to a **site-local WGS84 azimuthal equidistant** projection centered on the supplied address point, in meters. Geographic degrees are not used as linear or areal units. Calculations are approximate public-mapping measurements, not surveys. Definition and origin are exported for reproducibility. Reference: https://proj.org/en/stable/operations/projections/aeqd.html and https://proj4js.org/ .
- Parcel area prefers recognized assessor lot units. Without a reported area, projected geometry is the fallback. Mapped parcel polygon area is shown independently, with interior rings removed.
- Individual roofprint areas prefer MassGIS `AREA_SQ_FT`; projected geometry provides a documented fallback. Total contained roofprint area sums contained features only. Boundary-crossing and outside roofprints are excluded from that total. Source-area summation and geometric union coverage are explicitly different quantities.
- Coverage uses polygon-clipping intersection/union on projected polygons. It includes the parcel-clipped parts of boundary-crossing roofprints, removes overlap/double counting and respects holes. Remaining mapped land is the area of the polygon difference. It does not establish usable installation area. An incomplete/failed building query suppresses coverage and remaining-land estimates. Reference: https://github.com/mfogel/polygon-clipping .
- Building-to-boundary distance is the minimum segment-to-segment distance across roofprint and parcel rings, including parcel holes. Intersections/touches return zero; crossing associations require review.
- Road proximity is the minimum from the filled selected parcel to each returned centerline. A crossing or centerline inside the parcel returns zero. A centerline in an excluded parcel hole has a positive separation unless it touches the boundary. This is bounded mapped proximity, not travel distance or access confirmation.
- Zero is retained as a meaningful result; missing values are null, not fabricated zeros. Existing query caps, warnings and source-date distinctions are preserved. The older Phase 2 GIS-details spherical area comparison can differ slightly from the new projection-based area.

## API and parcel identity

The existing GET route accepts `layer=analysis`. It retains coordinate/state validation and numeric parcel-ID checks. It re-queries MassGIS, validates any requested OBJECTID against bounded candidates, and generates the report server-side. Clients cannot submit arbitrary geometry and label it a MassGIS measurement. `MAP_PAR_ID`, or `LOC_ID` when MAP_PAR_ID is unavailable, is exported separately from the original OBJECTID. The record includes the identifier field name.

Point containment and normalized address agreement are independent checks. A unique matching fee parcel may be suggested; uncertain matches require candidate selection. Manual selection never changes the verification state to engineer verified. Upstream layer outages yield a partial missing-data record and the electrical checklist where jurisdiction validation succeeds; errors are preserved. The existing Census jurisdiction check can itself fail, in which case the UI reports an error and allows retry.

## Live integration tests: three geographically different sites

The reproducible script `scripts/verify-site-analysis.ts` called the live localhost:3000 API and real public services. It did not modify or seed app records. Detailed observations are in `PHASE3_LIVE_RESULTS.json`.

| Site                          | Matching and geometry                                                                                                                                                                                  | Observed measurements                                                                                                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 79 Lowland Street, Holliston  | Observed live Google Places point; automatic unique fee-parcel match, MAP_PAR_ID 012.0-0004-0064.2 / OBJECTID 2251987; one contained roofprint                                                         | Reported parcel 12.299 acres; projected polygon about 12.5023 acres; contained source roofprint 78,678.7 sq ft; remaining mapped land about 465,916.7 sq ft (10.6960 acres); roofprint-to-boundary about 59.6 ft; nearest returned road about 21.7 ft |
| 100 Institute Road, Worcester | Census current-address point is outside parcel. Candidate OBJECTID 2217903 / MAP_PAR_ID 02-044-01+02 explicitly supplied for the test; manual/unverified; 25 contained roofprints                      | Projected parcel about 45.9853 acres; contained source roofprints about 425,207.4 sq ft; remaining mapped land about 1,577,881.4 sq ft (36.2232 acres); individual boundary distances returned; road intersection gives 0 ft                          |
| 1500 Main Street, Springfield | Census current-address point is outside parcel. Candidate OBJECTID 2475347 explicitly supplied; LOC_ID F_359644_2864182 is the available parcel identifier; manual/unverified; one contained roofprint | Remaining mapped land about 6,863.1 sq ft (0.1576 acres); nearest returned road about 14.0 ft; individual area and boundary-distance results returned                                                                                                 |

The Worcester and Springfield candidate identities remain subject to human confirmation; these tests do not claim the address points uniquely establish those properties. The script validates finite nonnegative values, source-reference resolution, area partition closure (mapped parcel = union coverage + remaining land within rounding tolerance), the six missing requirements and JSON serialization. Census geocoding is used only to obtain test inputs; the app continues to use Google Places.

## Browser verification

On localhost:3000 with the live Century-Tywood selection:

- Google satellite imagery and all three existing MassGIS overlays stayed visible. Refresh restored the selected Google place and recollected the analysis.
- The Site Analysis panel rendered beside the map at desktop width and collapsed/reopened correctly.
- Parcel source/method control and candidate selector are available. Each measurement is a button opening a native evidence dialog.
- Remaining-land evidence showed the projected difference method and parcel/building references, IDs, record dates, service updates and retrieval times.
- Expanding the individual roofprint showed the source area and approximately 59.6 ft boundary distance. Its evidence dialog showed both participating features and the segment-distance method.
- Utility bills expanded to show missing status, reason and specific customer evidence required.
- Mobile page and evidence dialog both fit a 390 px viewport without horizontal overflow. Desktop QA used 1440 px.
- Export Site Data downloaded successfully and the actual JSON was parsed from Downloads. Verified schema version 1.0, all six geographic summary metrics, individual building metrics, source-reference resolution, Google address provenance and all six electrical requirements. The latest tested download was `qore-site-data (1).json`.

Live Google typing/suggestion switching remains outside this automation's coverage because of the existing closed shadow DOM. The user's working Places implementation was preserved. The three-site tests above validate real server collection/analysis, not browser typing for all three addresses. GIS/analysis state is replaced when the Google Place ID/coordinates or selected parcel changes; obsolete requests are aborted.

## Checks

34 unit tests pass. New tests use explicitly synthetic, non-rendered meter-space fixtures to cover polygon holes, overlapping roofs, clipped crossing roofs, edge-interior distance minima, intersections, road containment/parcel holes, source references, missing selection, incomplete coverage and public-service outages. The existing record/evidence/export tests remain passing. Type checking, lint and production build pass. The restarted production preview on localhost:3001 returned HTTP 200 for the analysis operation with six geographic metrics and six missing electrical requirements.

## Electrical readiness and export

The report carries utility bills, 15-minute load data, service voltage, transformer ratings, panel capacity and existing single-line diagram as missing evidence for this geographic record. Each item specifies the required document/data and why GIS cannot establish it. This does not overwrite the existing saved workspace, or assume an independently uploaded document elsewhere has been reviewed or linked to the geographic report. No numerical battery feasibility score is introduced.

Structured JSON contains schema version, generation/export times, address-query provenance, parcel matching and identifier field, measurements/units/quality/method/source keys, individual buildings, nearest road, source catalog, coverage/errors, coordinate definition and missing-information checklist. No fake feature IDs, measured clearances, load data or electrical ratings are generated.

## Files added or changed for Phase 3

- `src/lib/gis/analysis-types.ts`: reusable preliminary engineering site record and electrical-requirement models.
- `src/lib/gis/projected.ts`: local projection, polygon arithmetic and segment-distance calculations.
- `src/lib/gis/analysis.ts`: traceable measurements, quality states, associations and readiness record.
- `src/lib/gis/collect-analysis.ts`: trusted live collection and partial-failure handling.
- `src/app/api/gis/site/route.ts`: analysis operation alongside existing layer queries.
- `src/components/gis/SiteAnalysisPanel.tsx`: collapsible panel, evidence dialogs and Export Site Data.
- `src/components/gis/GisSiteContext.tsx`: panel integration, manual selection and preserved original records.
- `src/app/globals.css`: restrained responsive analysis styling.
- `src/lib/site-analysis.test.ts`: meaningful geometry, traceability, missing-data and outage tests.
- `scripts/verify-site-analysis.ts`: opt-in reproducible live three-site check.
- `package.json`, `package-lock.json`: `proj4` and `polygon-clipping` dependencies.
- `README.md`, `docs/PHASE3_QA.md`, `docs/PHASE3_LIVE_RESULTS.json`, `docs/phase3-site-analysis.png`: methods, evidence and usage.
