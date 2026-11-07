# GridPath QA — November 7, 2026

## Automated checks

- ESLint: passed.
- TypeScript strict type-check: passed.
- Four domain tests: passed (blank intake, proposed-design exclusion, received/verified separation, current-state JSON).
- Next.js production build: passed.

## Browser flows observed

- Responsive overview at narrow mobile and desktop panel widths.
- Empty address shows a clear validation message.
- Century-Tywood direct route opens and shows seven of 25 required fields populated.
- Evidence drawer opens, distinguishes source-backed from human-verified, and states that originals are not bundled.
- Electrical tab distinguishes unknown existing ratings from proposed 250 kW / 760 kWh BESS values.
- Property tab explicitly shows the unavailable-coordinate/geometry fallback.
- Requirement status and owner edits survive refresh; Requested filter isolates the edited requirement.
- CSV upload through file selection adds metadata and explicitly states automated extraction is disconnected.
- Export downloads valid JSON containing current document metadata.
- Manual address intake creates a new record with one populated required field and zero documented required fields.

## Boundaries

- Original reference PDFs were not supplied; no independent document verification.
- No live GIS, extraction, remote storage, auth, or authenticated engineering approval.
- Uploaded bytes are session-only; metadata persists.
- Drag/drop uses the same validation/staging function as the tested file chooser.
- Dependency audit reports eight moderate findings in the development-only ESLint/TypeScript minimatch chain; no production dependency advisories. The suggested automatic fix downgrades Next's ESLint configuration across a major version, so it was not applied.

Final production verification: navigation, reset, source-status pages, and refresh completed without new browser console warnings or errors. Human-review validation rejected confirmation without reviewer and review basis. The clean reference sample was restored for handoff. Screenshot: `docs/gridpath-preview.png`.
