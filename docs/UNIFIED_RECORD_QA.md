# Unified engineering record and verification queue

Implemented in the existing ProjectSync repository. The Full Site Record is now the canonical record for values, observations, evidence references, review state/history, requests, owners, priorities and stage applicability. The Verification Queue, saved-site summaries, sidebar badge and document view read that same record.

## Audit and schema changes

Before: 58 fields (47 required existing-condition fields; 11 proposed). After: **69 fields across the same seven categories**, with **58 required at site intake and 11 proposed fields not yet applicable**. The Electrical Infrastructure category grows from 12 to 20 fields. Counts are derived from FIELD_SCHEMA, field state and project stage.

| Added field ID | Field | Category | Default priority |
|---|---|---|---|
| serviceAmperage | Service amperage | Electrical Infrastructure | Critical |
| availableCapacity | Available electrical capacity | Electrical Infrastructure | Critical |
| utilityPole | Utility pole identifiers | Electrical Infrastructure | Medium |
| breakerSpace | Available breaker space | Electrical Infrastructure | High |
| undergroundUtilities | Underground utilities and obstructions | Electrical Infrastructure | High |
| equipmentDistance | Existing electrical equipment separation distances | Electrical Infrastructure | Medium |
| existingConduit | Existing field-verified conduit route | Electrical Infrastructure | High |
| existingClearances | Existing equipment working clearances | Electrical Infrastructure | High |
| utilityBills | Utility bills | Electricity Usage and Rates | High |
| facilityName | Facility name | Property Identification | Low |
| propertyType | Property type / occupancy description | Property Identification | Medium |

The final six additions close other holes in the older requirement list. Existing conduit and clearances are distinct from proposed BESS routes/clearances. Property type does not substitute for an assessor's official land-use classification.

**Consolidated rather than duplicated:**

- `breaker` remains one field containing main breaker and main bus ratings; a structured equipment template supports equipment ID, mainBreakerAmps and mainBusAmps.
- `transformerCapacity` remains the existing transformer-ratings field, now supporting an array of equipment IDs, capacityKva, primaryVoltageV, secondaryVoltageV, phase and impedancePercent. Legacy scalar capacity is retained as partial evidence during migration rather than asserting that it supplies all ratings.
- `singleLine` remains the single-line availability/document field. Its structured template can record availability, revision and document reference.
- Previous supplemental bills/underground requests migrate into `utilityBills` and `undergroundUtilities`, including owners, notes and request statuses. They are no longer independent actionable entries.
- Legacy municipality/AHJ requirements consolidate into `municipalityAhj`; road/access requirements consolidate into `delivery`. Distinct source observations remain available.

The audit maps **all 34 legacy verification requirements to 32 canonical fields, with zero unmapped requirements**. Full mapping and category totals: `UNIFIED_RECORD_AUDIT.json`. Non-equivalent legacy proposed-equipment data is retained in a read-only migration archive, rather than being asserted as existing equipment.

## Shared data architecture

- `record-store.ts` owns one reactive record and one session file map per `[Place ID, parcel ID]`. Manual records use a stable workspace/site identity. Queue and dashboard subscribe to the same entry using useSyncExternalStore; edits notify both immediately and persist once through the common storage path.
- Full Site Record filters are **All fields**, **Missing information**, **Needs verification**, and **Source conflicts**. The seven categories remain in filtered views. Queue actions derive from field state, not a separate missing-requirements array.
- Reasons include missing/partial values, requested information, received evidence awaiting review, under-review state, source conflicts, rejected extraction and required engineering review. Each actionable field appears once, even if multiple reasons apply.
- Each field has a configurable Critical/High/Medium/Low priority override. Source values, confidence, units, default priority, category, condition and required status come from the canonical observation/schema. Service voltage and single-line information are Critical; pole identifiers default to Medium. Changing stage to Design activates proposed fields; intake excludes them from completeness and queue actions.
- Queue links use `/sites/:id?field=:fieldId` and open the corresponding Full Site Record evidence/review drawer. Requests, owner, notes and priority can be edited in either view. The saved record remains accessible while GIS loads; a source outage does not block electrical review.
- Saved-site index entries now contain identity/routing metadata and no new legacy field/requirement arrays. Existing legacy arrays are read for migration and retained as an archive, not maintained as another active model. The former independent verification and document editors have been replaced.
- Document uploads attach to a canonical field's evidence keys. Evidence can be received without entering an extracted value. This leaves missing values missing and review status unverified. File bytes are shared across views for the current session; hashes, references, dates and associations persist. Existing session-only file retention behavior remains unchanged.

## Evidence and persistence

Saved 58-field records and older Slope-containing 59-field records migrate by stable field ID. Existing observations, selected values, pinned/verified selections, sources, source vintages, owners and request notes are retained. Slope remains archived and outside the active inventory. Invalid stored records are preserved rather than overwritten.

New corrections remain separate observations. Rejected observations retain their values, source references, reviewer, time and rejection note. Review/selection changes retain prior review history. All observations and source references remain inspectable, including rejected alternatives. A new source or uploaded file never automatically grants Engineer Verified status. Reopening a previously verified collection request returns the field to review and retains the earlier verification history.

Portable exports continue excluding Google Places content. GIS, environmental and LiDAR calculations retain their existing public inputs and methods. New exports contain the actual schema inventory, current field requests/reviews, effective priorities, stage applicability, missing fields, sources and history. Deprecated extra requests are not exported as a live independent collection; their originals remain in the migration archive.

## Validation

**Automated: 74 tests passed**, including:

1. Every legacy verification requirement maps to an existing canonical field and no duplicate queue IDs exist.
2. 58/59-field migration preserves reviewed evidence, original source dates, owner/request state and archived Slope.
3. Queue and dashboard receive the same in-memory record; requests, reviews, completeness, export and persisted reload stay synchronized.
4. A second site's record stays independent; cross-site updates are rejected.
5. Conflicts and rejected values retain observations/history without verifying a missing value.
6. Proposed fields are excluded at intake and activate only in Design; priority overrides match exports.
7. Partial structured breaker/transformer ratings stay incomplete.
8. Evidence-only receipt targets the intended field and adds no inferred value or verification.
9. New saved-site metadata has no competing verification arrays; session file maps are shared; unreadable saved copies are not overwritten.
10. Existing parcel matching, source tracing, geometry, environmental, LiDAR, property and intake regressions remain green.

**Browser checks on the saved Boston site (200 Clarendon Street):**

- Service amperage is visible in both the queue and Full Site Record. Clicking its queue link opens its exact evidence drawer.
- Changed its collection status from Missing to Requested in the record; the queue displayed Requested. Changed it to Under review in the queue; client navigation opened the drawer with Under review. Restored the original Missing state afterward. No test electrical measurements or fake supporting documents were added to the real site.
- The four filters returned 69 total fields, 42 missing, 58 actionable fields and zero conflicts for the then-current source state. Proposed power was absent from the missing filter at intake. The empty conflicts view states that no fields match.
- Switching to Design changed the applicable completeness denominator to 69; switching back restored 58 and Not yet applicable proposed fields.
- Actual downloaded JSON inspected: 69 inventory rows, 58 required at intake, Service amperage status/priority matching the record, Not yet applicable proposed power, retained GIS/source references, and no active extraRequests collection.
- Parcel 2380675, buildings, roads, FEMA, wetlands and LiDAR continued loading. Elevation's View contour map still opened 64 actual official 5-foot contour features with labels, preserving the parcel. DOM inspection confirmed one Full Site Record on the saved-site page.
- Screenshots: `unified-site-record.png`, `unified-field-review.png`, `unified-verification-queue.png`.

TypeScript, lint (no warnings), all 74 tests, production build and git diff whitespace check passed. No new dependencies, commit or deployment. Production preview was rebuilt; existing Google referrer restrictions were not altered.
