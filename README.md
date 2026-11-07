# QORE ProjectSync

**Site Data Intelligence for EQORE** — an engineering intake demo for EQORE Track 1, MIT Energy & Climate Hack 2026.

This team-built prototype uses Next.js, React, and strict TypeScript. It is not an official EQORE product. The adjacent Ezee project is unchanged. No API keys, backend, or account are needed.

## Launch

Use Node.js 22 or newer.

```bash
cd /Users/ez/Documents/Codex/GridPath
npm install
npm run dev -- --port 3001
```

Open http://localhost:3001. The reference site is `/sites/century-tywood`.

For a production demo:

```bash
npm run build
npm run start -- --port 3001
```

Use the same hostname and port throughout a demo: localStorage is origin-specific. For a hosted deployment, set `NEXT_PUBLIC_APP_URL` to its canonical URL before building so social-image metadata resolves to that host. The local default is `http://localhost:3001`.

## Included workflows

- Overview, state-derived metrics, address intake, site search, status filters, and sorting.
- New addresses create preliminary records; no geocoding, parcel lookup, utility inference, or fabricated enrichment.
- Five site tabs: Overview, Property & Location, Electrical Infrastructure, Documents & Evidence, Missing Information.
- Evidence drawer for every field, including unknown values. Source confidence and human review are distinct.
- Explicit proposed BESS reference section, utility-pole ambiguity, and existing/proposed transformer separation.
- PDF, JPG, PNG, and CSV staging through drag-and-drop or a file chooser, file validation, category editing, metadata, and source inspection.
- Missing-information queue with critical/high/standard filters, requested/received/verified collection states, owners, notes, and supporting-document attachments.
- Deliberate human review requires a populated value, reviewer, supporting source, and review note. It is a self-attested demo action, not authenticated engineering sign-off. Merely marking a document received never verifies its contents.
- Current-state JSON download with provenance, review details, existing/proposed distinctions, requirements, readiness, and export timestamp.
- Working sidebar pages, global site search, responsive mobile navigation, keyboard tab navigation, native modal focus management, and explicit empty states.

## Data and storage boundaries

`centuryTywoodSite` is seeded from the user's supplied project brief. Original engineering PDFs were **not provided** and are not bundled. References are visible but never open a broken file viewer. Exact field-to-sheet mappings require review of the original plans. No external source has been fetched or independently verified. `retrievedAt` is null for locally entered and brief-sourced data.

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

MapLibre is intentionally not loaded without verified coordinates or geometry. The location panel explains the missing information. MassGIS, municipal GIS, FEMA, and OpenStreetMap are explicitly listed as disconnected targets. PDF export is deferred; JSON export works now.

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

The intake field and global search suggest existing records by facility name or location. Focus either field to see suggestions; type to filter, use the arrow keys and Enter to open a record, or Escape to dismiss. Entering a new address still creates a preliminary record.

The workspace includes Century-Tywood J3 Corp (Holliston, Massachusetts), ThermoFusion (Hayward, California), and Aalberts Surface Technologies (New Hampshire). The additional names, locations, and reported operating-status notes are transcribed from the user-provided project summary screenshot and remain marked Needs review. No street addresses, coordinates, or engineering ratings were inferred for the two new sites. Missing references are added to existing saved workspaces without replacing custom records or edits.
