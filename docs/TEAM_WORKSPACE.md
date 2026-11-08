# Shared workspace deployment and recovery

This repository now supports two modes: browser-only intake, and an optional authenticated shared server. The latter uses SQLite (WAL) plus immutable SHA-256 file blobs. No externally hosted database or account has been provisioned.

## Deploy a shared server

1. Use Node **24+**, install with `npm ci`, and retain this repository's `src/` tree and production dependencies. Inference builds a small child-process entry from TypeScript on first use; a source-stripped standalone deployment needs an explicit build/package step before it is supported.
2. Mount a private persistent disk. Configure `QORE_TEAM_ENABLED=true`, an absolute `QORE_DATA_DIR`, and a long random `QORE_TEAM_SETUP_TOKEN` in server secret settings. Do not put secrets in Git or `NEXT_PUBLIC_*` variables. The setup token can be removed after initial setup.
3. Run `npm run build` and `npm start` behind HTTPS. Set proxy request/body limits to 52 MB and proxy timeouts to accommodate five-minute model jobs. Production session cookies are Secure, HttpOnly, SameSite=Strict.
4. Open Settings, initialize the first administrator using the setup token, then add named teammates. Give reviewer roles only to people your team authorizes professionally. Role membership does not verify engineering licensure.
5. Explicitly publish existing browser records and available files from Settings. On first connection, differing browser/shared copies are preserved as conflicts. Export local packages before choosing to pull shared copies.

All team accounts share one workspace. There is no per-client/project tenancy isolation. Viewer accounts cannot write to the server; editors collect data; engineer/admin accounts can attribute field verification to their authenticated identity. Administrators add/disable accounts; disabled accounts lose sessions immediately. Password changes revoke all sessions. Login attempts are rate limited by account. Use the host's access controls/rate limits as an additional perimeter for an Internet deployment.

Shared saves use optimistic versions: a stale tab receives a conflict rather than overwriting a teammate. Polling picks up successful remote updates every ten seconds while signed in. File references have immutable content hashes; original bytes are downloaded only after authentication. Local records/files remain on trusted browsers after sign-out; signing out is not a device wipe.

**One Next.js server per data directory.** SQLite and local blobs are not a distributed database. Do not use an ephemeral/serverless filesystem or run independent replicas against separate disks. For larger deployments, replace the repository boundary with a managed database/object store and organization identity provider.

## Backup and restore

Run on the server, writing outside the live data directory:

```sh
QORE_DATA_DIR=/persistent/qore-data node scripts/backup-workspace.mjs /backups/qore-2026-11-08
```

The script makes a consistent `VACUUM INTO` SQLite snapshot and copies the immutable blobs referenced by that snapshot. It refuses to overwrite an existing destination. Schedule it with your host's scheduler and copy successful backups to access-controlled storage on a separate disk. Backup encryption/retention depend on the hosting environment; this code does not silently provision a cloud backup service.

To restore: stop the application, preserve the old data directory, restore `workspace.sqlite` and `blobs/` from one complete snapshot into a new directory, set `QORE_DATA_DIR` to that directory, and restart. Check sign-in, site counts, and download hashes before retiring the old disk. Backups contain password hashes and live session tokens' hashes; restrict access. To revoke restored sessions, delete rows from `sessions` during controlled offline recovery.

## Site packages

Export site package on a saved site creates a ZIP containing portable engineering data, site identity/parcel selection, original evidence files, and available annotation images. The manifest lists missing files and intentionally omitted restricted imagery. Google Places details are omitted by the existing portability policy. Street View analyses/images are omitted from packages. Existing independently sourced public GIS evidence remains.

Import on Overview validates paths, limits, site identity, and file hashes, and refuses to overwrite an existing site. Imported verification is preserved in history and returned to Under review for confirmation by the receiving team. A site package is a handoff, not a full account/audit database backup.

## Document extraction and model operations

Add files → attached file → Extract electrical ratings supports embedded PDF text (up to 100 pages), TXT/CSV text, and local image OCR. Extraction is explicit. Supported labels currently include service voltage, service amperage, panel rating, and phase. Each candidate retains the file source, page, excerpt and method. The reviewer must confirm existing conditions before retaining a candidate. Candidates are unselected and never engineer verified automatically. Other ratings, drawings, tariff tables and interval-data interpretations still require manual review. Scanned PDFs without embedded text prompt users to upload the relevant page/nameplate image or enter sourced values manually.

Detection/OCR runs in a separate child process, one job at a time. A hard timeout or client cancellation kills that process; models persist only in the download cache. Native ONNX allocations are outside the JavaScript heap limit, so provide adequate host memory (start with 8 GB for an isolated application instance and monitor real use). Expensive jobs require authentication when shared mode is enabled. `QORE_VISION_TIMEOUT_MS` defaults to 300000, bounded to 1000–600000. An HTTP client/proxy must allow the matching duration.

Do not treat a successful inference smoke test as an accuracy benchmark. Use authorized, representative ground and aerial photos, including empty/negative images, and manually label normalized `[left,top,right,bottom]` boxes with the app's equipment categories:

```json
{"cases":[{"image":"photos/site.jpg","vocabulary":"ground","truth":[{"category":"transformer","box":[0.1,0.2,0.5,0.8]}]}]}
```

Run `npx tsx scripts/benchmark-annotations.ts /absolute/labelled-manifest.json`. The report includes per-image false positives/negatives and category-matched IoU≥0.5 precision/recall. No representative labelled team dataset has been supplied, so production accuracy is not claimed.
