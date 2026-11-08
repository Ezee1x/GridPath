# Phase 4 — Engineering site record

Implemented in the existing Next.js application; Maps/Places and per-layer GIS requests remain in place. Analyze Site runs the shared pure geographic analyzer against the map's already-loaded records. The dashboard does not repeat MassGIS requests or call any future adapter.

## Components and model

- `SiteIntelligenceDashboard`: ten metrics below the map, five readiness counts, category accordions, missing-information view and live JSON download.
- `FieldEvidence`: source/method dialog, source observations, explicit manual input, supporting document references, conflict selection and explicit engineering review.
- `useIntake`: browser persistence keyed by Google place ID **and** selected parcel feature ID; corrupt copies are preserved rather than overwritten.
- Typed version 2.0 `IntakeRecord`, 59 field definitions in categories of 7/9/7/9/12/6/9. There are 48 required existing-condition facts and 11 proposed design/placement fields. Proposed fields do not affect existing-condition readiness. Municipality with an unknown AHJ is partial, not complete.
- `MassGISAdapter`: normalizes existing results, source IDs, source dates, original/current units and methods. Future FEMA/zoning/tariff/document-extraction adapters are declarations marked not integrated.
- Explicit linking imports corresponding saved-record observations without changing the original record or replacing an already verified selection. Conflicting observations remain available. The older saved-record list retains its original completeness model; the new dashboard uses the 59-field model.

## Measurement definitions

The existing site-local WGS84 azimuthal equidistant meter projection is reused. No planar arithmetic uses longitude/latitude degrees. Parcel assessor lot area is retained alongside projected polygon area. The dashboard roofprint total is a geometric **union of contained roofs**, with reported area sums and parcel-clipped coverage separately identified in evidence. Unbuilt area subtracts clipped roofprint union from mapped parcel geometry and explicitly does not represent usable installation space. Roof-to-parcel ring distances include holes; crossing geometry withholds a representative site minimum. Road proximity identifies the returned road centerline and cannot establish access. Per-roofprint road distances are also recorded.

## Live integration checks

Run `npx tsx scripts/verify-site-intake.ts` against `QORE_QA_ORIGIN` (default localhost:3000). The script makes one aggregate GIS request per site, then runs the actual analyzer, adapter and export functions locally without writing browser records. Full evidence and measurements are saved in `PHASE4_LIVE_RESULTS.json`.

| Address | Selected parcel OBJECTID | Contained roofs | Required/populated/missing | Result |
| --- | --- | --- | --- | --- |
| 25 Southgate St, Worcester | 588601, manually chosen for QA | 1 | 48 / 13 / 35 | Point/address mismatch stays uncertain automatically |
| 79 Lowland St, Holliston | 2251987, automatic candidate | 1 | 48 / 13 / 35 | Source and geometry areas retained separately |
| 77 Massachusetts Ave, Cambridge | None | 0 associated (5 nearby returned) | 48 / 4 / 44 | No fabricated parcel totals or boundary distances |
| 100 Institute Rd, Worcester | 2217903, manually chosen for QA | 25 | 48 / 13 / 35 | Multi-roof union, individual areas and distances |

Southgate's test geocoder point falls in **53 Southgate St** (1364517), while a separate 25 Southgate candidate exists. No automatic parcel match is asserted. Manual QA selections are not engineer verification. Cambridge requires manual assessment of ambiguous candidates.

Each case also simulated a missing road response with the same live parcel/building data: road proximity stayed missing, while successful parcel and building calculations were preserved. Area partition and union inequalities passed; every normalized source key resolved; unintegrated values remained null. Census current address-geocoder points were used for Southgate/Cambridge/Institute Road as test inputs; Lowland used the observed Google Places point. These checks are not a claim of automated Google autocomplete typing for all four addresses.

## Browser checks

- Actual Lowland Google Places selection, satellite map, GIS layer controls, parcel selection and Analyze Site remained operational.
- Expand all opened seven categories with exactly 59 field rows; Collapse all closed them.
- Parcel evidence displayed source OBJECTID, record date, retrieved time, original acres, converted units and separate projected area/method.
- A single-line-diagram request was changed to Requested with a QA note; reload and re-analysis preserved both. Counts did not mistake the request for a populated or verified electrical value. QA edits were restored to Missing/empty after the test.
- The actual Export Site Record button downloaded JSON; assertions verified 59 fields, readiness 48/13/13/35/13 and the live QA request note. Zoning, flood, wetlands and utility observations were null.
- Desktop 1440px: four metric columns; mobile 390px: two metric columns. No page-level horizontal overflow. Category tables have their own horizontal scrolling when expanded.
- Browser console error count was zero at inspection. Responsive override reset after testing.

## Validation and limits

`npm run lint`, `npm run typecheck`, `npm test` (40 passing), and `npm run build` passed.

Local browser persistence is not a server database. File hashes, names and source references persist, but uploaded file bytes are session-only and must be reattached after refresh. Engineer review is explicitly self-attested in this prototype, not authenticated or a professional approval system. Future integrations remain unimplemented; unknown values stay missing. Public geometry is preliminary and association remains subject to verification. Existing Phase 2/3 QA artifacts describe their earlier checks and are preserved.

Production preview started on port 3001 after the successful build. Google returned `RefererNotAllowedMapError` for both 127.0.0.1:3001 and localhost:3001. The Maps key was not changed. Browser feature QA used the working localhost:3000 origin. This origin restriction must be addressed in the Google key configuration before Maps can run on port 3001.
