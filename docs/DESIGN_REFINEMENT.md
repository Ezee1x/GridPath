# QORE ProjectSync interface refinement

Implemented November 7, 2026, in the existing Next.js application. Existing routes, record IDs, source references, fixture values, and review workflows are retained.

## Visual system

- Replaced decorative uppercase labels, colored dots, the floating record illustration, and the large dark intake surface with a compact address form and operational copy.
- Added self-hosted Geist, 14px body text, 13px table text, 12px secondary labels, 17px section headings, and 28px page headings.
- Centralized colors, typography, control height, spacing, and radii in `src/app/tokens.css`. Replaced the previous layered stylesheet with consistent shared component rules.
- Changed separate metric cards into a summary strip; simplified connection status into a list; used neutral borders and surfaces throughout evidence panels, forms, and engineering records.
- Kept accent color for primary intake, navigation, links, progress, and evidence/review states. Export and other contextual actions use secondary buttons.
- Added a shared `PageHeader` and technical geometric `BrandMark`. Added meaningful ProjectSync breadcrumbs and sentence-case interface labels.

## Branding and assets

`src/lib/brand.ts` supplies the product name, subtitle, metadata copy, and export prefix. The application title is **QORE ProjectSync | Site Intelligence**. Attribution identifies a team-built prototype for EQORE.

Added Open Graph and mobile metadata, a web manifest, a technical application icon, a replacement favicon, Apple touch icon, 192px and 512px install icons, and a social preview image. Assets can be regenerated with `npm run brand:assets`. Set `NEXT_PUBLIC_APP_URL` before building for a hosted canonical origin; local metadata defaults to `http://localhost:3001`.

Removed five unused starter SVGs from `public/`: the framework and hosting logos, globe, window, and file artwork. All existing runtime dependencies remain in use. Geist is now a direct runtime dependency; Sharp is declared as a development dependency for the reproducible asset script.

The historical QA document and original screenshot are retained as development records. The existing repository directory name remains in launch instructions. The old storage key is referenced only by the compatibility reader and migration tests. These references are intentional and do not appear as product branding in the normal interface.

## Data continuity

`src/lib/persistence.ts` copies existing saved records into `qore-projectsync-workspace-v1` when the new namespace is absent. It retains the original copy, preserves IDs, assignments, notes, collection states, and source metadata, and gives the current namespace precedence on subsequent loads. Migration storage failures still return the readable saved records.

Exports retain the structured record schema and now include the application name and subtitle. Download filenames use the `qore-projectsync-` prefix. New records still populate only the supplied address. Received evidence remains separate from deliberate human verification, and proposed BESS values remain separate from existing electrical infrastructure.

## Verification

- ESLint: passed.
- Strict TypeScript: passed.
- Seven domain and migration tests: passed.
- Next.js production build: passed without metadata warnings.
- Fifteen existing routes, record routes, and metadata/icon assets returned successful responses. The unknown-record route displays its existing empty state.
- Browser checked all workspace destinations, address validation, new intake, evidence drawer, CSV staging, requirement assignment, supporting-document attachment, persistence after refresh, and branded JSON download.
- Phone (390px), tablet (768px), and desktop (1440px) checks found no page-level horizontal overflow in the tested intake, electrical, document, and verification views. Tables and tab bars scroll within their own containers. Fixed a hidden table header label that had escaped its scroll container on mobile.
- Production browser checks reported no console warnings or errors.
- Production dependency audit: no vulnerabilities. Eight existing moderate advisories remain in the development ESLint/TypeScript dependency chain.

## Continuing boundaries

Live property retrieval, geocoding, extraction, backend storage, and authenticated engineer approval remain future integrations. Original reference PDFs are not bundled. File contents are staged for the page session; document metadata persists. The refinement does not change those data or review limitations.

Final overview capture: `docs/projectsync-overview.png`. The final production preview is served at `http://127.0.0.1:3001/`; browser console checks on that build returned no warnings or errors. The original preview origin loaded its existing saved sample through the compatibility reader. Regression-created records and uploads were confined to the separate QA origin.
