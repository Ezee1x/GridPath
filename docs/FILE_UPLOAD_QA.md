# Dashboard and Verification Queue file collection

Implemented a shared Add files section and direct per-field Add file actions in the engineering dashboard and Verification Queue. Both write to the existing canonical site/parcel engineering record and shared session file map. Attachments also appear in the existing Documents and field evidence views.

Files receive SHA-256 identifiers, names, retrieval timestamps, field/site associations, and optional notes. Files can be downloaded during the session. Re-adding identical content restores file access without duplicating its source reference. Uploading never fabricates a field value or marks it engineer verified. New evidence on a verified field reopens review using existing evidence rules.

Supported types: PDF, PNG/JPEG, CSV, text, JSON, Excel, Word, DWG/DXF. Batches allow 10 files, 25 MB each; empty and unsupported files are rejected before committing a batch. File references persist in browser storage; file bytes remain session-only, explicitly stated beside upload controls.

Validation:
- TypeScript and ESLint passed.
- All 79 tests passed, including canonical view synchronization, site isolation, source metadata persistence, duplicate handling, input validation, and unchanged completeness/value/review state after file receipt.
- Production build passed.
- Browser QA used an isolated localhost:3002 workspace with a clearly labeled synthetic record and text files; no QA documents were attached to user records.
- Uploaded from dashboard, navigated to Queue, observed Received / Unreviewed and attachment count, added multiple files from Queue, reopened dashboard field and confirmed shared files.
- Downloaded an attachment and compared bytes with the original file: identical.
- Refreshed and confirmed both saved references remained with the explicit re-add-file message.
- Captured dashboard-add-files.png and verification-add-files.png from the normal workspace without adding files to its records.
