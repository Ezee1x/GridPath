# QORE ProjectSync

Preliminary engineering site intelligence for EQORE Track 1: *Site Data Without a Site Visit*. A team-built prototype from MIT Energy & Climate Hack 2026, not an official EQORE product.

ProjectSync cuts the time engineers and project managers spend gathering property, geographic, environmental and electrical information before a site visit. Reliable evidence, traceability and clear missing-information requests matter more than filled-in fields.

## Run it

Node.js 22 or newer.

```bash
npm ci
npm run dev -- --port 3000
```

Open http://localhost:3000. The workspace starts empty; no demo records are seeded.

Google Maps and Places need a browser API key in `.env.local` (Git-ignored, see `.env.example`):

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=…
```

Get the key through an authorized channel and never commit it. Enable Maps JavaScript API and Places API (New), and allow the referrer you use (for example `http://localhost:3000/*`). Without a key, manual address intake and saved records still work.

Storage is per browser origin, so keep the same host and port during a demo. For a hosted build, set `NEXT_PUBLIC_APP_URL` before `npm run build`.

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Opt-in live source checks (with the dev server running): `npx tsx scripts/verify-electrical-discovery.ts`, plus `verify-site-analysis.ts`, `verify-site-intake.ts`, `verify-property-identification.ts` and `verify-environment.ts` in `scripts/`.

## What works

- **Address search and maps.** Google Places suggestions, Massachusetts validation, satellite map, saved site records and restored parcel selections. An independent Census geocode drives public GIS queries.
- **Public GIS and environment.** MassGIS parcels, roofprints and road centerlines; parcel matching and manual selection; areas and approximate distances; FEMA flood and MassDEP wetlands screening; LiDAR elevation and contours where coverage exists. All five layers start enabled.
- **Property identification.** Coordinates, municipality (AHJ uncertainty kept), parcel IDs, source and calculated areas, assessor land use and zoning, with source references.
- **One engineering record.** The site dashboard, Full Site Record and Verification Queue share one record: values, observations, sources, review state, requests, owners, notes, conflicts and evidence. Public or uploaded data is never marked Engineer Verified automatically, and verified values are protected.
- **Files.** Add files from the dashboard, the Verification Queue or any field. Hashes, notes, duplicates and downloads are handled. File contents now survive refresh in this browser (see [docs/PERSISTENCE.md](docs/PERSISTENCE.md)).
- **Electrical discovery.** *Find Available Electrical Data* in Electrical Infrastructure checks the MassGIS/DPU utility territory layer, Boston electrical permits (Analyze Boston CKAN), DPU interconnection research links, and documents already linked to the record. Results are candidates, not confirmed service relationships. Field statuses and customer requests stay in sync as evidence, values and reviews change, with earlier searches and resolved requests kept as history. See [docs/electrical/SOURCE_DISCOVERY_REPORT.md](docs/electrical/SOURCE_DISCOVERY_REPORT.md).
- **Site annotations.** The *Site annotations* tab on each site locates the property (US Census geocoder), shows its MassGIS parcel outline and OpenStreetMap power lines and substations over public MassGIS/USGS aerial imagery, and runs open-vocabulary detection (Grounding DINO, with Florence-2 reading visible markings) on aerial images, your own site photos, or licensed Street View captures. Results appear as callouts on a drawing sheet with zone references and an editable detection schedule. Annotations are machine-detected and never engineer verified; linking one to a record field adds it as a reference only, without setting a value, changing the request status or affecting readiness. Models (~1.7 GB) download to `.cache/cv-models` on the first run, then run locally with no API key.
- **Export.** JSON export of the current record, evidence metadata and missing-information requests.

## Record shape

69 internal schema fields. The dashboard shows 61 fields in six categories; eight legacy design fields remain for compatibility. 59 fields are required for intake. Don't delete stored fields or change counts without reading the migration and applicability rules in `src/lib/intake/model.ts` and `src/lib/intake/verification.ts`.

## Where to start in the code

| Area | Files |
| --- | --- |
| Engineering record | `src/lib/intake/model.ts`, `schema.ts`, `types.ts`, `portable.ts`, `equipment.ts` |
| Storage | `src/lib/intake/record-store.ts`, `file-vault.ts`, `src/lib/store.tsx` |
| Files and evidence | `src/lib/intake/file-evidence.ts`, `src/components/intake/SiteFiles.tsx`, `FieldEvidence.tsx` |
| Dashboard and queue | `src/components/intake/SiteIntelligenceDashboard.tsx`, `VerificationQueue.tsx` |
| Electrical discovery | `src/lib/electrical/`, `src/app/api/electrical/discover/route.ts`, `src/components/intake/ElectricalDiscoveryPanel.tsx` |
| GIS and environment | `src/lib/gis/`, `src/lib/environment/`, `src/app/api/gis/`, `src/app/api/environment/` |
| Site annotations | `src/lib/annotations/`, `src/app/api/annotations/`, `src/components/annotations/` |
| Interface | `src/app/tokens.css`, `src/app/globals.css`, `src/components/layout/` |

This project uses Next.js 16. Read `AGENTS.md` and the docs in `node_modules/next/dist/docs/` before relying on older Next.js behavior.

## Data-integrity rules

- Missing information stays missing when evidence is inadequate.
- Never manufacture measurements or feasibility scores, infer unused capacity from a rating, or infer transformer service from proximity.
- Never overwrite engineer-verified values automatically, or move observations or files between sites or parcels.
- Keep source-backed, estimated, candidate, missing and verified states distinct.
- Never instruct customers to open energized equipment or approach restricted utility equipment.

## Not production-ready

Records and files live in one browser. There is no shared storage, sign-in, authenticated review attribution, backup or monitoring. Engineer Verified is a self-attested application review, not professional sign-off. [docs/PERSISTENCE.md](docs/PERSISTENCE.md) describes the team-storage design.

## History

Earlier phase reports in `docs/` (`PHASE3_QA.md` through `UNIFIED_RECORD_QA.md`, `QA.md`, `DESIGN_REFINEMENT.md`) record how the app evolved. Their field counts, seeded samples and screenshots are historical; the code and this README describe the current app.

## How the app is organized

The original handoff layout: a left sidebar with Overview, Site explorer, Verification queue, Documents, Data sources and Settings. Each saved site has two tabs, *Site record* (map, Highlights of Site, readiness, files and the Full Site Record) and *Site annotations*. Colors, type and icons are the original green-grey design in `src/app/tokens.css`.
