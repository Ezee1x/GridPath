# QORE ProjectSync

**Site Data Intelligence for EQORE** — an engineering intake demo for EQORE Track 1, MIT Energy & Climate Hack 2026.

This team-built prototype uses Next.js, React, and strict TypeScript. It is not an official EQORE product. The adjacent Ezee project is unchanged. Saved records and manual intake work without a backend or account. Live address search and satellite maps require a Google Maps browser API key.

## Launch

Use Node.js 22 or newer.

```bash
cd /Users/ez/Documents/Codex/GridPath
npm install
npm run dev -- --port 3000
```

Open http://localhost:3000. The reference site is `/sites/century-tywood`.

For a production demo:

```bash
npm run build
npm run start -- --port 3001
```

Use the same hostname and port throughout a demo: localStorage is origin-specific. For a hosted deployment, set `NEXT_PUBLIC_APP_URL` to its canonical URL before building so social-image metadata resolves to that host. The local default is `http://localhost:3001`.

## Included workflows

- Overview, state-derived metrics, address intake, site search, status filters, and sorting.
- Manual addresses create preliminary records. Live Google address previews do not fabricate or verify engineering fields.
- Five site tabs: Overview, Property & Location, Electrical Infrastructure, Documents & Evidence, Missing Information.
- Evidence drawer for every field, including unknown values. Source confidence and human review are distinct.
- Explicit proposed BESS reference section, utility-pole ambiguity, and existing/proposed transformer separation.
- PDF, JPG, PNG, and CSV staging through drag-and-drop or a file chooser, file validation, category editing, metadata, and source inspection.
- Missing-information queue with critical/high/standard filters, requested/received/verified collection states, owners, notes, and supporting-document attachments.
- Deliberate human review requires a populated value, reviewer, supporting source, and review note. It is a self-attested demo action, not authenticated engineering sign-off. Merely marking a document received never verifies its contents.
- Current-state JSON download with provenance, review details, existing/proposed distinctions, requirements, readiness, and export timestamp.
- Working sidebar pages, global site search, responsive mobile navigation, keyboard tab navigation, native modal focus management, and explicit empty states.

## Data and storage boundaries

`centuryTywoodSite` is seeded from the user's supplied project brief. Original engineering PDFs were **not provided** and are not bundled. References are visible but never open a broken file viewer. Exact field-to-sheet mappings require review of the original plans. The saved engineering fixture has not been independently verified. Google Places address previews are separate from this fixture. `retrievedAt` is null for locally entered and brief-sourced data.

The fixture includes 41 fields: 34 existing/unknown intake fields and seven proposed design fields. Completeness uses 25 required intake fields; seven are populated in the reference sample (28%). Proposed values cannot increase that score. Every existing/unknown intake field has a collection/review requirement, including optional fields. Readiness does not establish technical feasibility, electrical capacity, code compliance, or installation approval.

Existing records are automatically copied from the original storage namespace without deleting it. Records and document metadata persist in localStorage under `qore-projectsync-workspace-v1`. File bytes stay in browser memory for the current page session. Refreshing requires re-adding a file to inspect it; re-adding a same-named staged file retains its source ID. JSON exports include metadata, not file bytes. This demo does not provide multi-user synchronization, authenticated reviews, or a historical audit log.

Reset the workspace from Settings to restore all three reference projects; export any edits first. Reference-only documents are not automatically classified as received original files: the record contains the reference summary, and this distinction is visible in source details.

## Important files

- `src/lib/types.ts` — site, field, document, and requirement schemas.
- `src/lib/fixtures.ts` — dedicated Century-Tywood fixture, field definitions, and blank-site factory.
- `src/lib/store.tsx` — external React store and local persistence.
- `src/lib/calculations.ts` — completeness and current-state JSON export.
- `src/lib/adapters.ts` — future repository, geographic lookup, and document-extraction contracts.
- `src/components/layout/` — sidebar, top navigation, and client-mounted workspace shell.
- `src/components/sites/Overview.tsx`, `SiteTable.tsx` — dashboard and intake.
- `src/components/sites/SiteDetail.tsx` — site tabs and readiness.
- `src/components/sites/Evidence.tsx` — field rows and evidence drawer.
- `src/components/sites/Documents.tsx` — local file staging and source details.
- `src/components/sites/MissingInformation.tsx` — collection and human-review workflow.
- `src/components/WorkspacePage.tsx` — secondary workspace destinations.
- `src/app/globals.css` — design system, responsive layouts, focus and reduced-motion styles.
- `src/app/sites/[id]/page.tsx` — direct dynamic site route.

## Backend integration

`SiteRepository` provides list/get/save contracts for a future FastAPI implementation. `GeographicSourceAdapter` returns source-backed fields and optional verified coordinates/geometry. `ExtractionAdapter` returns proposed extracted fields with evidence references. None are connected or simulated as live services. Add authenticated review authorization, runtime API schema validation, durable file storage, conflict handling, and audit history before production use.

Google Maps provides interactive satellite context in Site Explorer. Google Places provides real address selection, validated for Massachusetts and the United States. Neither verifies engineering evidence. MassGIS parcels, roofprints and roads are queried live in Site Explorer. Municipal GIS, FEMA, OpenStreetMap and engineering-document extraction remain disconnected targets. PDF export is deferred; JSON export works now.

The browser-local workspace is mounted client-side to avoid hydration races between delayed route segments and persisted records. Next.js cache components and partial prefetching are disabled for this local-only milestone.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Tests exercise no-fabrication intake, exclusion of proposed designs from completeness, collection/verification separation, and live JSON export. See `docs/QA.md` for observed browser checks and known limitations.

## Interface refinement

QORE ProjectSync uses shared industrial UI tokens in `src/app/tokens.css`, self-hosted Geist, a compact intake form, and consistent 14px body / 13px table typography. Product copy, exports, browser metadata, and installation icons use the shared `src/lib/brand.ts` constants. See `docs/DESIGN_REFINEMENT.md` for the refinement audit and verification record. Earlier QA records and screenshots remain as development history.

## Project suggestions

The manual intake field and global search suggest existing records by facility name or location. Focus either field to see suggestions; type to filter, use the arrow keys and Enter to open a record, or Escape to dismiss. Entering a new address still creates a preliminary record.

The workspace includes Century-Tywood J3 Corp (Holliston, Massachusetts), ThermoFusion (Hayward, California), and Aalberts Surface Technologies (New Hampshire). The additional names, locations, and reported operating-status notes are transcribed from the user-provided project summary screenshot and remain marked Needs review. No street addresses, coordinates, or engineering ratings were inferred for the two new sites. Missing references are added to existing saved workspaces without replacing custom records or edits.

## Google Maps setup and architecture

Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in root `.env.local` (Git ignored), then restart development or rebuild production. Never commit a key. Enable Maps JavaScript API and Places API (New), with billing enabled. Restrict the browser key to those APIs and your permitted HTTP referrers, including `http://localhost:3000/*` for this demo and the production origin when deployed. Google returns address content and coordinates; Massachusetts bounds only bias suggestions. Selection validates returned state/country and requires a building number and route.

`src/lib/maps/google-maps.ts` loads the official SDK once per browser page and resolves live Places fields. `src/components/maps/GoogleAddressSearch.tsx` hosts Google's modern keyboard-accessible `PlaceAutocompleteElement`. `GoogleSiteMap.tsx` renders satellite imagery at zoom 19 with an address marker and accepts independent GeoJSON layers. `GoogleAddressWorkspace.tsx` composes the map and engineering-status panel. Only the Place ID is retained in sessionStorage; Google address content is fetched afresh on refresh. No Google imagery is downloaded for analysis or computer vision.

The featured Century-Tywood address resolves through Google Places, without seeded coordinates. Google currently returns ZIP 01746, while the supplied reference fixture says 01747. The preview flags this difference and preserves the saved record for review. MassGIS assessment parcels, mapped roofprints and road centerlines now appear as public GIS overlays. Extraction and equipment verification remain unconnected.

## Phase 2: public GIS site context

Selecting a Google address triggers `/api/gis/site`. The UI requests `layer=parcels`, then independently requests `layer=buildings` and `layer=roads`. Optional `parcelId` selects a candidate already within the bounded search. An omitted layer returns an aggregate response with separate errors. `lat`, `lng`, and optional `address` support matching; finite coordinates and detailed Census TIGERweb Massachusetts containment are validated on the server.

Service URLs and allowed fields live in `src/lib/gis/config.ts`. Runtime metadata determines supported output formats. Queries explicitly use WGS84 output; ArcGIS JSON fallback handles multipart geometry and holes through Terraformer. Parcel matching requires point containment, a unique fee parcel and normalized street-address agreement. Otherwise select a candidate manually. Candidates are searched within 150 meters; no nearest parcel is selected automatically. Building searches use the selected parcel envelope plus 20 meters; roads use its envelope plus 250 meters. Without a parcel, only nearby context is returned. Envelopes are capped to 2 km from the address, and each response is capped at 300 features, with incomplete-coverage warnings.

Parcel area prefers assessor `LOT_SIZE` when its units are explicitly recognized. A separate approximate Turf spherical/geodesic polygon area is available for comparison; Web Mercator `Shape__Area` is not used for measurements. Roofprints prefer `AREA_SQ_FT`; missing areas fall back to documented geodesic calculations. Only fully contained retrieved roofprints (within numerical overlay tolerance) enter the total. Crossing structures are flagged and excluded. Every measurement includes units, method and provenance; a service update date does not imply a recent observation of every feature.

Layer toggles, clickable feature drawers, manual parcel selection, per-layer retries and public GIS JSON export are available. GIS findings remain separate from saved engineering review fields and never imply engineer verification. See `docs/MASSGIS_QA.md` for live observations, limits and the changed-file inventory, and `docs/MASSGIS_SERVICES.json` for the inspected schema snapshot. No additional GIS API key is required.

## Phase 3: geographic measurements and site readiness

The collapsible **Site Analysis** panel produces a reusable preliminary site record from live GIS. `/api/gis/site?layer=analysis&lat=…&lng=…&address=…&parcelId=…` re-queries trusted services, validates the selected candidate and returns typed measurements, quality states, a feature-reference catalog and missing electrical requirements. `selection=manual` records an explicit candidate choice. The existing layer queries, map interactions and original GIS export remain available. Original GIS/address details are collapsible below Site Analysis.

Calculations use Proj4 to transform WGS84 geometry into a site-local WGS84 azimuthal equidistant projection in meters. Segment-to-segment distances include edge-interior minima and intersections; parcel holes are included as boundaries. Road proximity measures parcel geometry to returned road centerlines, including zero for an intersection. It does not establish access or legal setbacks. Polygon clipping unions overlapping roofprints, clips boundary-crossing portions to the parcel and subtracts that coverage from mapped parcel area. Remaining land is unassessed mapped space, not usable BESS installation area. Incomplete building coverage suppresses that estimate rather than inflating it.

Reported assessor area and `AREA_SQ_FT` roofprint values retain source-backed status. Derived geometry values are estimated; incomplete/uncertain results are marked needs verification, and unavailable values stay null/missing. The panel separates assessor lot area, projected polygon area, summed contained source roofprint areas and union coverage. The older Phase 2 GIS details retain their documented spherical/geodesic comparison; its approximate area can differ slightly from Phase 3's projected ellipsoidal calculation.

Every measurement opens its method, feature IDs, original MassGIS links, record dates, service updates and retrieval times. Parcel matching shows point containment and normalized street-address agreement independently. MAP_PAR_ID is preferred as the parcel identifier, with LOC_ID used when available; OBJECTID remains the separate original feature ID. Manual associations are never engineer verified.

**Export Site Data** downloads `qore-site-data.json` with schema version, query/address provenance, parcel matching, geographic quantities and units, source references, coverage/errors, coordinate method and six missing electrical requirements: utility bills, 15-minute load data, service voltage, transformer ratings, panel capacity and existing single-line diagram. These requirements describe evidence attached to the geographic record, without overwriting saved engineering reviews or asserting that files elsewhere in the workspace do not exist.

Run the opt-in live three-site check with `npx tsx scripts/verify-site-analysis.ts` while localhost:3000 is running. Set `QORE_QA_ORIGIN` to test a production preview. See `docs/PHASE3_QA.md` for observed results and verification limits.

## Phase 4 — Site Intelligence and engineering intake

Select a Massachusetts address in Site explorer, review the parcel candidate, and choose **Analyze Site**. The full-width dashboard below the map reuses the loaded GIS results and presents measurements, engineering readiness, and the expandable 59-field inventory. Proposed design fields are excluded from existing-site readiness. Each field supports source/method inspection, manual observations, supporting evidence, and explicit engineering review; received documents are not automatically verified.

Request notes and observations persist per address/parcel in this browser. **Export Site Record** downloads current measurements, the complete schema, evidence, review/request state and missing-information list. Existing saved records can be explicitly linked; verified selections and conflicting observations are preserved. FEMA, zoning, tariffs and automated document extraction remain unintegrated.

See [Phase 4 QA](docs/PHASE4_QA.md) and [live measurement results](docs/PHASE4_LIVE_RESULTS.json). Run the optional live check with `npx tsx scripts/verify-site-intake.ts` while the local app is running. It does not seed the UI or modify saved site records.

## Phase 5A — Property Identification

Analyze Site now enriches the seven property fields with identifier-linked MassGIS assessor records and an official municipality lookup. MAP_PAR_ID is the displayed parcel ID; LOC_ID/TOWN_ID remain matching keys. Land use shows the published town/use-code description; assessor zoning requires municipal confirmation. AHJ remains incomplete until supported by permit-specific evidence. Each tax listing retains its record ID and fiscal year, and verified observations are preserved.

The Maps marker stays unchanged. GIS uses an independent Census address point and may require manual parcel selection where that point differs from parcel geometry. Google Places address/coordinate details remain in the active session and are omitted from persistent records and portable JSON; public GIS/assessor evidence and Place IDs are retained.

See [Phase 5A field report and QA](docs/PHASE5A_QA.md), [live results](docs/PHASE5A_LIVE_RESULTS.json), and `scripts/verify-property-identification.ts` for the opt-in three-municipality check.

## Phase 5B — Environmental sources and LiDAR terrain

The explorer now includes independent FEMA flood and official statewide MassDEP wetland queries, a real **Elevation & Contours** map tab, bounded Float32 LiDAR ground statistics, published contour vectors with genuine DEM-isoline fallback, and source-backed candidate permitting geography. Use **View contour map** in Environmental and Permitting to open terrain without resetting the parcel. Default interval is 5 feet; 1/2 feet require the published vector product. Every result keeps source IDs, dates, methods, uncertainty and export references.

The active record now has **58 fields / 47 required existing-condition fields / 11 proposed fields** after removing standalone Slope. Earlier phase documents describe historical counts. Legacy Slope data is retained internally and omitted from the active inventory/export. Wind, snow, permits, local codes and exact permitting authorities remain subject to retrieval/verification.

See [Phase 5B methods, endpoints, QA and limitations](docs/PHASE5B_QA.md) and [live test results](docs/PHASE5B_LIVE_RESULTS.json). Reproduce bounded public-source QA with `npx tsx scripts/verify-environment.ts`; set `QORE_QA_ORIGIN` to the running server origin if necessary.
