# QoreSites rebrand and teammate migration

Implemented November 8, 2026 on `codex/qoresites-rebrand`.

## Identity

- Product / repository / intended local folder: **QoreSites**.
- npm package: `qoresites`.
- Application title: `QoreSites | Battery Storage Site Intelligence`.
- Tagline: `Site intelligence for battery storage.`
- Description: `Automated site data collection and engineering intake for commercial battery storage installations.`
- Attribution: `Built for EQORE · MIT Energy & Climate Hack 2026`.
- EQORE remains the sponsor; no corporate EQORE logo was introduced.

## Audit and scope

The starting branch was `codex/eqore-master-intake`, at `f045c81`. Existing uncommitted work removed Data sources from navigation/routing (`AppShell.tsx`, `WorkspacePage.tsx`, `[section]/page.tsx`) and included its validation screenshot. These changes were preserved when creating the dedicated rebrand branch. No history rewrite, reset, stash, force-push, commit or code push was performed.

The rebrand updates shared brand constants, navigation/loader text, workspace attribution and avatar initials, browser/Open Graph/Twitter/Apple metadata, manifest icon URLs, generated social artwork, export headers and filenames, npm metadata and active developer guidance. Functional field IDs, site IDs, GIS endpoints, API routes, evidence values, reviewer records and configured credentials remain unchanged.

Actual application-owned filename changes:

- `public/projectsync-icon-192.png` → `public/qoresites-icon-192.png`.
- `public/projectsync-icon-512.png` → `public/qoresites-icon-512.png`.

Generic source filenames did not contain obsolete product branding and were retained. `icon.svg` is a minimal geometric Q/site mark; favicon, Apple icon, manifest icons and social PNG are generated from the app's own assets. No starter-template asset references remain.

JSON intake exports now include `application: "QoreSites"`; ZIP manifests include the application name without changing their import-compatible protocol format. Printable HTML headers/titles and JSON/ZIP/HTML/text download names use QoreSites. Engineering evidence is not relabelled or fabricated.

## GitHub: completed

The existing repository was renamed through the authenticated GitHub CLI after local tests/build passed:

https://github.com/Ezee1x/QoreSites

The local `origin` fetch/push URL is now `https://github.com/Ezee1x/QoreSites.git`. GitHub reported admin access. No replacement repository was created. Code changes remain local and uncommitted on the feature branch.

Teammates with existing clones should run inside their clone:

```bash
git remote set-url origin https://github.com/Ezee1x/QoreSites.git
git remote -v
git fetch origin
```

Do not reset or discard teammate work. The rename does not automatically publish this uncommitted feature branch.

GitHub inspection found zero Actions workflows, zero webhooks and zero deployment records. The local repository has no `.github/workflows`, Dockerfile or linked `.vercel/project.json`. No deployment integration was disconnected or recreated. If a hosting project is managed outside these discoverable records, verify its repository connection/display name in that host's dashboard and keep its credentials/project ID intact. `NEXT_PUBLIC_APP_URL` should remain the actual deployment URL; a product name change alone is not a domain change.

## Local project folder: intentionally deferred

The development server and editor/browser workspace are actively using `/Users/ez/Documents/Codex/GridPath`. Moving that directory during the task would violate the brief's requirement to preserve the active workspace. After stopping running servers and closing that editor workspace, run:

```bash
cd /Users/ez/Documents/Codex
mv GridPath QoreSites
cd QoreSites
npm run dev -- --port 3000
```

First confirm a separate `QoreSites` destination does not already exist; do not merge or overwrite another directory. Reopen `/Users/ez/Documents/Codex/QoreSites` in the editor/Codex workspace. Keep the same browser hostname and port so browser-local records remain available. Any shell aliases, external launcher working directories or editor bookmarks using the old absolute path must be updated at that time. Dependencies and the existing `.env.local` move with the directory; no replacement API keys are required.

## Data compatibility and intentionally retained identifiers

- Saved-site lists migrate to `qoresites-workspace-v1`, reading `qore-projectsync-workspace-v1` first and then `gridpath-workspace-v1` only when the current key is absent. Prior values are retained. An existing current list, including an intentionally empty list, wins over stale copies. Write failures still return readable records with a warning.
- The saved explorer Place ID migrates to `qoresites-explorer-place-id`, retaining the old key and respecting a newer selection.
- IndexedDB names `qore-projectsync-files` and `qore-projectsync-annotation-images` remain unchanged to preserve original file/image bytes without a risky database-copy operation.
- Engineering record namespaces, site/source IDs, `qore-site-package` / backup protocol identifiers, events and shared-session cookie names stay compatible. These are internal interchange/storage contracts, not visible product names.
- Existing `QORE_*`, Google Maps and OpenEI environment variable names stay unchanged. No `.env.local` contents were printed, modified or committed.
- Dated QA/design reports, historical screenshots and their filenames retain the names used when their evidence was recorded. See current README and this document for current branding. Historical engineering/source evidence is intentionally not mass-edited.

The active source/config/name audit leaves obsolete product-name matches only in migration readers/tests and retained database namespaces. The still-active physical directory and Git history also retain their historical names intentionally.

## Validation

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: **135 passed**, including both earlier workspace migrations, current-key precedence, saved Place ID migration and attachment/image/package integrity.
- `npm run build`: passed.
- Package-lock change is limited to the root package name; dependencies and scripts were preserved.
- Actual HTTP checks: QoreSites page metadata/manifest, 192/512 icons, SVG/Apple/social images return successfully with expected content types.
- Actual browser reload retained the pre-existing Boston saved record, parcel selection, site ID, Full Site Record and map. No old product name appeared in its rendered body. Google satellite/MassGIS layers remained visible.
- Elevation tab displayed live/cached source-backed elevation samples and official MassGIS contours.
- Actual JSON export downloaded as `QoreSites_Site_Record.json` with application name, 69 retained fields, 463 source references, 12 requirement mappings, measurements and readiness in the checked Boston record.
- Google Places autocomplete was exercised on `localhost:3000`: a live 79 Lowland Street, Holliston suggestion appeared and selecting it loaded the correct site map. On the isolated production QA origin `localhost:3003`, suggestions returned a provider error; no API-key restrictions were changed to bypass it.

Additional production-browser checks confirmed the Verification Queue and Documents deep links render correctly. A synthetic text attachment was uploaded to an isolated synthetic QA record from the queue; the attached-file count updated and the same file appeared on Documents. No customer record received test attachments. Public retrieval and file receipt did not mark engineering values verified.

The final production build and lint passed after the avatar initials update. The overview screenshot is [qoresites-overview.png](qoresites-overview.png). The production QA server used a separate origin and has been stopped; the existing development server remains available.

These checks establish branding/integration compatibility, not general engineering correctness or equipment detection accuracy. This rebrand did not re-run live OpenEI rate retrieval, new annotation model inference or a browser print-to-PDF workflow. Their integration contracts were preserved and existing automated tests passed; the actual browser export checked here was JSON.
