# EQORE master implementation: validation and repeatable demonstration

Updated 2026-11-08. Work is local on `main`; pre-existing uncommitted changes were preserved. No deployment or credential provisioning is claimed.

## Implemented end-to-end functionality

The existing record, 52 active intake fields, verification queue, Maps/GIS, uploads and shared storage remain. Added requirements use those stable field IDs and derive coverage from actual observations, sources and review states. Downstream design/interconnection/commissioning references do not inflate initial-intake missing counts. No code-compliance or BESS feasibility score is generated.

- Engineering library: twelve information-collection requirements across five stages, plan-sheet mappings, required evidence, official URLs and verification limitations. Exact legal code sections are intentionally null unless verified. Requirement review uses the existing field drawer; there is no independent requirement-status database.
- OpenEI v7: server-side key, independent Census coordinate pair, C&I filters, minimal candidate lists and full details on request, effective dates, sector, original tier/season/TOU/ratchet/restriction records, source URLs, five-minute bounded cache, limited concurrency and retry. Candidate retention is unselected/incomplete; customer confirmation requires an attached site bill and explicit comparison. Engineer verification remains separate. Full published records are retained with immutable source versions.
- Energy: browser-local CSV/Green Button parsing and preview, kWh/Wh scaling, interval-average kW derived from actual duration, supplied demand retained separately, UTC timestamps, explicit timezone, DST ambiguity rejection, missing/duplicate/overlap detection, monthly boundary apportionment (explicitly estimated when an interval crosses a boundary), one meter/channel, chart and source-file hashing. Modeled/synthetic imports never populate actual usage fields. Fifteen-minute completeness is not satisfied by other durations or gaps.
- Documents: local PDF embedded-text extraction and local Florence OCR, typed electrical schemas and partial values, file/page/excerpt evidence, existing/proposed/unknown classification, Accept/Edit/Reject/reference actions, original extraction retained, conflicts and verified selections preserved. No unapproved cloud processing. Unreadable/unlabelled pages require manual transcription; scanned/low-text PDFs have an explicit local OCR option limited to three pages per run; unprocessed pages are flagged, and individual page-image/manual fallback remains available.
- Workflow: requirements/evidence matrix, Holliston/Boston/Worcester/Cambridge source directory, copyable/downloadable customer requests, stage-specific references, enriched JSON and ZIP metadata, printable HTML summary, measured collection events and a manual baseline form with identical target field IDs and separate review times. No time-savings claim is invented.

## Actual live source results

See `eqore-live-results.json` for retrieval times, exact parcel IDs, source status and operation durations. Tests used independent Census matching (placeholder input map coordinates were ignored by the Google-input API branch; no actual Google-derived data was exported). QA identities were not saved into user records.

| Address                    | Intended MassGIS feature / parcel | Actual result                                                                                                                                                               |
| -------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 79 Lowland St, Holliston   | 2251987 / 012.0-0004-0064.2       | Parcel SITE_ADDR 79 LOWLAND ST; parcel/building/road requests successful; one territory candidate; Holliston permits manual portal research                                 |
| 25 Southgate St, Worcester | 588601 / 07-024-01-03             | Parcel SITE_ADDR 25 SOUTHGATE ST; parcel/building/road requests successful; one territory candidate; eight matched permit records after available parcel filtering          |
| 200 Clarendon St, Boston   | 2380675 / 0401134000              | Parcel SITE_ADDR 200 Clarendon ST; parcel/building/road requests successful; one territory candidate; 100 recent electrical permits returned (source cap, not full history) |

Territories do not confirm meter service. Permit records do not establish installed equipment or completion. None of these addresses supplied publicly exposed authoritative electrical drawings through the supported feeds.

At the initial audit, `OPENEI_API_KEY` was absent. Real HTTP tests then returned `configuration-required` for all three addresses. Candidate/complex tariff structures, geographic schema, partial-sector failure, secret redaction, bill confirmation and field synchronization were tested with **synthetic HTTP fixtures**, not claimed live OpenEI results.

## Browser and document validation

Used isolated `localhost:3003` storage and the clearly labelled synthetic QA record; real user records on `localhost:3000` were not assigned synthetic values.

1. Uploaded a four-reading CSV fixture. Preview showed 900-second intervals, 22 kWh, maximum supplied demand 30 kW, four average-demand chart points, coverage and zero gaps/duplicates. Marked it modeled/synthetic before acceptance; actual usage fields remained missing. Reloading the production build preserved both the Modeled / synthetic label and zero collected actual usage fields.
2. Uploaded `synthetic-nameplate.png`, visibly labelled as a synthetic OCR fixture, to transformer evidence. Actual local OCR returned `Service voltage: 480 V` and `Transformer capacity: 500 kVA`, with page/image 1 references. Acceptance started disabled for unknown conditions. Classifying both as proposed and retaining references did not select them as existing conditions.
3. An image-only synthetic PDF (no embedded text) was also rendered locally and processed with opt-in OCR. The development and production endpoints returned the same two typed candidates with page 1 evidence and no warnings. This validates the processing path, not general drawing accuracy.
4. The real Boston record's matrix showed source-derived missing/incomplete/conflicting states; opening Existing electrical service exposed voltage/phase/amperage/single-line field links and E-300 mapping. Generate Information Request produced that site's actual missing-field checklist and safe collection instructions.
5. Prior and extended tests cover conflicting electrical observations, rejected values, verified-selection preservation, cross-site file protection, export/import hashes and queue synchronization. Printable HTML is escaped; original rate structures and quality warnings are in JSON.

No EQORE plan PDFs or actual customer equipment photographs were found in the repository. They were **not processed**. The upload workflow accepts them when provided. Generic IFC samples must be assigned proposed/reference status and must not be asserted to describe Worcester facilities. Representative field-photo accuracy remains unbenchmarked; the synthetic OCR smoke test is not an accuracy claim.

## Code references: what was verified

- Massachusetts 780 CMR tenth-edition/2021 IBC basis and end of concurrency: checked through indexed official Mass.gov preamble/adoption notices. App says official index checked, not full legal-rule verification.
- Massachusetts 527 CMR 1.00: indexed official state page/amendments identify the 2021 NFPA 1 basis; amendment document effective May 12, 2023. State page also gives December 9, 2022 for the base adoption. Proposed 2026 amendments are not treated as adopted.
- Massachusetts electrical amendment PDF and direct state code pages returned 403. The project-supplied 2026 NEC / April 24, 2026 information is explicitly confirmation-required; the app does not invent verified code-section rules.
- NFPA 855 applicable edition and incorporation remain unconfirmed. ICC model-code editions are not assumed adopted automatically. Local AHJ/project permit date still requires review.
- NYSERDA, NYC, Redmond and Woodside checklists are comparative out-of-state references only, not Massachusetts governing rules. No copyrighted standard was reproduced or access control bypassed.

Official references are linked in `src/lib/engineering/library.ts` and the in-app reference panel; source URLs and verification limitations are included in export.

## Repeatable demonstration

1. `npm ci` on Node 24+. Configure the existing Maps key locally if needed; keep `.env.local` out of Git. Optional OpenEI key setup is in `.env.example`.
2. Run `npm run dev -- --port 3000`. Search one address above, inspect/select its actual intended parcel, Analyze Site and save. Keep its saved parcel when reopening.
3. Inspect Highlights of Site (eight metrics), open the existing Electrical Infrastructure and Electricity Usage & Rates accordions. Public utility/permit discovery and rate configuration/search use the same site identity.
4. Open Engineering requirement coverage, follow missing fields, add evidence and review it. Upload actual site drawings, or label generic samples proposed/reference. Review sources and conditions before Accept/Edit. Rejected originals remain visible in history.
5. Import a CSV with `start,duration_seconds,energy_kwh` (optional `demand_kw,meter_id`), using ISO offsets; or a supported linked Green Button feed. Review units, coverage and warnings. Confirm the actual site; select modeled/synthetic for test/ComStock files.
6. With an OpenEI key, search C&I candidates, request full detail, retain an unconfirmed candidate, then attach a recent bill under Utility bills and explicitly confirm the utility/rate code/eligibility. The tariff becomes customer-confirmed, not engineer verified. Without a key, show the real configuration-required state.
7. Generate/copy/download the customer request. Review selected fields via existing Source & method. Export Site Record JSON, the ZIP including original evidence, or printable HTML. Confirm requirements, code-reference limitations, raw tariff structures, consumption classification and source timestamps in JSON.
8. For a measured comparison, start a new site collection session and finish only after review. Record a measured manual baseline against exactly the same selected field IDs, including both workflows' review time. Existing/preloaded data is not relabelled as newly retrieved; no automatic savings percentage is claimed.

## Validation commands and limitations

- `npm test`: 131 tests pass (unit/integration; deterministic fixtures are explicitly synthetic).
- `npm run typecheck`: passes.
- `npm run lint`: passes.
- `npm run build`: production build passes, including `/api/rates` and existing GIS/environment routes.
- Actual three-site HTTP/public-source checks: `eqore-live-results.json`.
- Actual browser CSV upload/preview and local image OCR: screenshots `eqore-document-review.png` and `eqore-requirements-dashboard.png`.

Green Button support is a restricted ESPI subset: one linked electricity-import incremental-energy meter/channel, Wh with declared multiplier and durations. Cumulative/net/export/mixed-channel data, quality-flagged readings and unsupported XML must be reviewed manually, not silently converted. CSV DST-ambiguous local times require explicit offsets. Large imports are bounded to 8 MB / 40,000 readings; general attachments retain their existing 25 MB limit.

Shared hosting, persistent disk, HTTPS, off-host backup scheduling, authorized reviewer accounts, supplied EQORE drawings and representative customer equipment photos remain team/environment dependencies. No deployment or live OpenEI tariff success is claimed. `npm audit --omit=dev --json` reported zero production vulnerabilities. The full audit reported eight moderate development-toolchain advisories (ESLint/TypeScript tooling/minimatch); the application framework was not downgraded as an automatic audit fix.

## Main implementation files

- `src/lib/engineering/`: requirement/reference library, live coverage, source directory, activity/benchmark summaries and printable export.
- `src/lib/rates/`, `src/app/api/rates/`: OpenEI schema, server adapter/cache and central-record candidate/confirmation logic.
- `src/lib/energy/`: CSV/Green Button parser, normalized readings/quality and evidence acceptance.
- `src/lib/documents/`: extended explicit-label extraction, typed validation and review decisions.
- `src/components/engineering/`, `src/components/rates/`, `src/components/energy/`: compact expandable integration panels.
- Existing `SiteIntelligenceDashboard`, `VerificationQueue`, `FieldEvidence`, `DocumentExtraction`, `useIntake`, GIS/environment hooks, central model/export/types, code-reference adapter and site-package export were extended in place.
- Tests: `master-foundation.test.ts`, `energy-intake.test.ts`, `document-review.test.ts`, `engineering-export.test.ts`, and extended extraction tests; previous site-isolation/GIS/review/storage tests retained.


## Feature-branch continuation — reference document readiness

Work continues on `codex/eqore-master-intake`. The pre-existing dirty working tree was retained in place; no reset, stash, commit, or push was performed.

The upload dialog now records an explicit document classification: unclassified, site evidence, or reference-only. Reference-only attachments preserve existing request/review state, remain available as original files, and cannot populate existing conditions through candidate acceptance, confirm a customer tariff, or become actual energy evidence. Their classifications survive JSON and site-package serialization. Re-uploading the same bytes under a different classification creates a separate reference rather than changing the original sample's status. Existing unclassified uploads retain their keys and behavior.

Validation gates, run in order during this continuation:

1. Foundation and utility: requirements/export and OpenEI schema, missing-key, partial-result, confirmation and verified-selection tests passed.
2. Document and energy intake: 15 focused tests passed, including reference-only uploads, candidate review, verified-review preservation, supported Green Button, DST and full-year interval parsing. Additional assertions reject reference-only bills/energy files.
3. Integration: 131 unit/integration tests, type check, lint and production build passed. The upload classification was checked in the browser on the existing Boston record without attaching synthetic evidence to it. Screenshot: `eqore-reference-upload.png`.

Credential dependency remains explicit: `OPENEI_API_KEY` is required for live tariff retrieval; the adapter and configuration-required UI are already implemented. Local PDF/text/image extraction works without a cloud-provider key. No unapproved cloud processing was enabled. Supplied EQORE documents and representative customer images still require an actual import and review; no claim is made that absent documents were processed.


## Annotated map layer — November 8 continuation

The separate Site record / Site annotations navigation was replaced by three map tabs: Public GIS Layers, Elevation & Contours, and Annotated Layer. The third tab automatically runs the existing detector for a new site, reuses saved aerial analyses and images, retains editing/photo/Street View tools in collapsed controls, and provides scanning/progress animation, elapsed time, cancellation and retry. Reduced-motion preferences are respected. Search drafts retain annotations until Save site record; saved records persist them through the existing workspace/image vault. Async requests abort on unmount and cannot save into a different site identity. Hidden tabs keep the annotation component mounted to preserve review state and ignore zero-width resize events.

Imagery is public MassGIS aerial imagery for the selected site's independent Census location, not a screenshot of Google satellite tiles. Already loaded public GIS locations and selected parcel geometry are reused; the Google Maps and elevation viewers remain available. Existing saved analyses and field links were preserved. Unsupported or unlocatable addresses cannot be promised imagery or reliable detections.

Actual live checks:

- Boston, 200 Clarendon St: opened the new tab in the browser; automatically produced 8 candidate features in about 8 seconds. Refresh and Public GIS → Annotated Layer switching were checked. Saved history and image reused without a new request when switching tabs.
- Holliston, 79 Lowland St: independent public-address lookup followed by the actual aerial detection endpoint returned 12 candidates, HTTP 200, 1024 × 768 MassGIS imagery.
- Worcester, 25 Southgate St: same live endpoint flow returned 7 candidates, HTTP 200, 1024 × 768 MassGIS imagery.
- Counts verify the processing path, not detection accuracy, equipment ratings, or engineering findings. The two endpoint checks did not create site records. Full results: `annotated-layer-live-results.json`.
- New unit coverage checks independent location/site/parcel isolation and reuse; total **132 tests passed**. Type check, lint, production build and diff whitespace check passed.
- Screenshots: `annotated-layer.png`, `annotated-layer-loading.png`.

The OpenEI key was subsequently configured and verified through the local API: actual live searches succeeded for Holliston (100 candidates), Worcester (50), and Boston (100), with the configured per-sector cap. A Worcester candidate's full energy/demand structures and schedules were retrieved successfully. These responses include historical tariffs and do not confirm current customer eligibility. Earlier configuration-required results are historical audit results, not the current key status.

## Street View comparison and live camera indicator

The Annotated Layer now includes a Street View toggle. On desktop it opens an annotated Google satellite map on the left and an interactive Google Street View panorama on the right, with inline annotation-name/notes editing and a two-corner Add annotation action constrained to the analyzed image extent. On narrow screens the two viewers stack. Closing Street View restores the original public aerial diagram.

Existing annotations originate from the public aerial analysis and are projected through its Web Mercator image transform onto the Google map. Google imagery is not sent to the detector. The paired view uses a Google basemap because the current Google Maps Platform terms, section 3.2.3(e), explicitly prohibit displaying Street View alongside a non-Google map: https://cloud.google.com/maps-platform/terms . Original public aerial image controls are hidden while the paired mode is displayed.

Google panorama `position_changed` and `pov_changed` events update a blue camera marker and heading arrow. A compact coordinate/heading readout is shown; this navigation state is component state only and is not stored in site records, evidence, exports, or the server. Event listeners and panorama visibility are cleaned up when closed or the site changes. Missing panorama coverage retains a clear unavailable state. Explicit initial panorama zoom avoids invalid zoom values during initialization/resizing.

Actual browser checks on 200 Clarendon St, Boston: panorama loaded; northward navigation moved the readout from 42.349851, -71.074850 to 42.349923, -71.074873; rotating changed the heading and marker CSS rotation. Selecting a map callout exposed its name and notes while Street View remained open. No existing annotation content was changed during this check. Desktop paired layout and narrow responsive behavior were inspected; screenshot: `street-view-comparison.png`. These checks do not validate street imagery coverage at every address or establish equipment ratings. The final check showed no new runtime errors after explicit zoom initialization.

Validation: 132 tests passed; type check, lint, production build and `git diff --check` passed. Work remains on `codex/eqore-master-intake`, with pre-existing changes retained and no commit/push performed.

## Street View entry-point correction and original diagram pairing

The operator confirmed personal permission from the Google team for the combined usage. Based on that confirmation, the paired view now keeps the original public aerial diagram (including its existing SVG callouts and drag-to-draw/edit tools) alongside Street View. This supersedes the earlier Google-basemap substitution for this workspace; no independent verification of the permission is asserted. This change does not enable new document uploads or automated Street View image analysis beyond the existing configured capture capability.

Both the main Street View toggle and the older Imagery → Street View control now open the same comparison; the older control no longer renders a second, vertically stacked panorama in Image controls. Opening it scrolls the diagram/panorama pair into view. Desktop and tablet widths above 600 px use two columns; phone widths of 600 px or less retain stacked responsive behavior.

The live camera is projected into the source aerial image using its original center, zoom and image dimensions. A camera outside the image extent is explicitly reported instead of being pinned at a false in-image location. Navigation remains session-only. New unit coverage checks projection round trips for two locations/zooms, heading normalization, invalid input and off-image handling.

Browser validation used the older control from the reported screenshot. It opened the original diagram on the left and Street View on the right. Navigating north moved the camera readout and SVG marker from approximately image pixel (527.72, 405.12) to (519.14, 368.79), matching the observed panorama-location change. Screenshot: `original-diagram-street-view.png`. No existing annotation values were changed during this check.

Validation: 133 tests passed, type check passed, lint passed, production build passed and diff whitespace check passed. Existing dirty changes remain on `codex/eqore-master-intake` without commit or push.

## On-map annotation label editor

Newly drawn annotations and selected callouts now open an inline label editor over the image, including in the Street View comparison. Save label / Enter trims and saves a non-empty name through the existing site annotation store; Cancel / Escape discards the draft. Unchanged labels do not create unnecessary updates. Callout dragging still works; the editor waits until the drag ends. Browser QA confirmed opening, typing and cancelling a draft preserves the original label. Screenshot: `map-label-editor.png`. Type check, lint, 133 tests and production build passed.
