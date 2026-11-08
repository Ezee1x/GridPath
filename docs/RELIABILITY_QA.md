# Reliability and handoff verification — 2026-11-08

All QA account data and synthetic documents were isolated in a temporary server directory and localhost:3003 browser origin. Existing user records at localhost:3000 were preserved.

Implemented checks:
- Unit/integration suite (112 passing tests): role restrictions; authenticated reviewer attribution; stale-version conflicts; revoked sessions/password changes; file identity/hash checks; database reopen; handoff round-trip; tampering; receiving-workspace review reset; extraction excerpts/pages; streamed request limits; exact municipal street/parcel matching.
- Real HTTP API (production build): unauthenticated record reads rejected; initial setup/login; independent authenticated sessions retrieving the same site record and original document bytes; TXT and embedded-PDF extraction returned two explicit sourced candidates. Shared-mode unauthenticated extraction was rejected. Production image analysis returned five candidates in 8.2 seconds and rejected a concurrent job with HTTP 429.
- Browser: sign-in, shared site appearing from server, restored document download/extraction controls, unchecked confirmation preventing candidate retention, two candidates visible with page excerpts; explicit retention left the rating unselected; a ZIP export reported the original document included.
- Public aerial inference: MassGIS 2025 imagery near Cambridge (42.377, -71.116), 1024×768, five candidates, approximately 8.4 seconds on this computer with cached model downloads. Candidate count is an execution check, not a correctness claim.
- Model lifecycle: concurrent second job rejected; forced one-second timeout; cancellation; subsequent job succeeds. An initial worker-thread shutdown test exposed a native ONNX abort; replaced threads with separate child processes and reran successfully with exit code 0.
- OCR: synthetic nameplate image transcribed service voltage correctly but misread “amperage.” Candidates therefore remain estimated/unselected and require original-document comparison.
- Live municipal tests: 200 Clarendon Street, Boston (100 returned electrical permits, capped); 131 Second Street, Cambridge (two electrical permits after handling Census “2ND” alias); 7 Young Street, Worcester (one building permit, contextual only). See RELIABILITY_LIVE_RESULTS.json for exact source queries and IDs. No installed electrical ratings inferred from these permits.
- SQLite snapshot and file-blob backup completed; restored database and document hashes checked separately.

Deployment not performed: shared hosting, persistent disk, administrator identity, HTTPS, off-host backup schedule and a representative manually labelled image benchmark need the team's environment/data. Browser-only mode remains the default until shared mode is configured.
