# Records and document persistence

QoreSites supports browser-local storage and an optional shared workspace. See [TEAM_WORKSPACE.md](TEAM_WORKSPACE.md) for authenticated shared storage configuration.

## Tier 1: local demo (implemented)

Everything stays in one browser on one device.

| What | Where | Survives refresh | Shared with teammates |
| --- | --- | --- | --- |
| Saved site list | `localStorage` `qoresites-workspace-v1` | Yes | No |
| Engineering record per address/parcel | `localStorage` `qore-engineering-intake-v2:<siteKey>` | Yes | No |
| Attached file contents | IndexedDB `qore-projectsync-files`, store `files` | Yes | No |
| Google Places address and coordinates | Active Maps session only | No (re-fetched by Place ID) | No |

### How attached files are stored

- `src/lib/intake/file-vault.ts` defines the vault. `indexedDbVault()` is used in the browser; `memoryVault()` is used by tests.
- `src/lib/intake/record-store.ts` wraps each record's file map. Any `files.set(key, file)` also writes the bytes, SHA-256 hash, name, type, size and time to the vault.
- When a record opens (and when another tab changes it), the store restores files from the vault.

A stored file is restored only when all of these hold:

1. The key belongs to this site (`input:<siteKey>:…`) and the row's `siteKey` matches.
2. The current record still references that key as a file source.
3. The row's hash matches the record's `fileHash`.
4. The stored bytes still hash to that value.

Restoring contents never changes a value, review state or request status.

If IndexedDB is unavailable (private browsing, blocked storage, quota), files fall back to session memory and the user sees a warning. File references, hashes and notes are still saved with the record.

### Known limits

- No teammate or cross-device access.
- "Clear site records" in Settings does not purge the file vault. Orphaned files are never shown because restore requires a live reference.
- No revision history of file contents. Re-adding identical bytes reuses the same document ID; changed bytes create a new one.
- JSON export contains file metadata and hashes, not file bytes.

## Tier 2: team collaboration (not built)

Shared review across authorized teammates needs server-side storage. Recommended shape:

- **Database** (e.g. Postgres) for sites, engineering records, observations, review history and requests. Keep the current record shape and field IDs so `src/lib/intake/model.ts` migration rules still apply.
- **Object storage** (e.g. S3-compatible) for file contents, addressed by SHA-256 hash, with a `documents` table holding document ID, hash, site, field associations, uploader, upload time and revision.
- **Authentication and access control** so reviews carry a real identity. Today "Engineer verified" is self-attested.
- **Import path** from Tier 1: upload each local record plus its vault files, preserving values, evidence, review history and saved parcel selections. The local hashes let the server deduplicate and confirm integrity.
- Backups, deployment configuration and monitoring before production use.

Until Tier 2 exists, use **Export Site Record** to hand a record to someone else.


## Product rename compatibility

The current saved-site namespace is `qoresites-workspace-v1`. On first use, records migrate from `qore-projectsync-workspace-v1`, or from `gridpath-workspace-v1` if that earlier backup is the only available copy. Existing IDs, notes, evidence, selected parcels and reviews are unchanged. The original key is retained; a present current workspace, including an intentionally empty list, wins over old copies. Failed writes still return readable records with a warning. The previous explorer Place ID is copied to `qoresites-explorer-place-id` without removing its old value.

The IndexedDB namespaces `qore-projectsync-files` and `qore-projectsync-annotation-images` are intentionally retained. They are internal compatibility identifiers, not product branding. This avoids orphaning file bytes or annotated images. Engineering record keys, shared-session cookies, protocol format identifiers and configured `QORE_*` environment variables also remain stable.
