# Phase 6B — electrical infrastructure source discovery

Implemented in the existing engineering record; no new duplicate electrical fields, accounts, scoring or equipment inference.

## Connected sources

1. [MassGIS Electricity Providers, by Town REST layer](https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/ElectricityProviders/MapServer/0), owned/published by MassGIS. Located through the official ArcGIS item `1710ebf6cf614b5fa97c0a269cece375` and inspected live. Provider names (`ELEC`), municipality (`TOWN`, `TOWN_ID`) and feature identifiers (`OBJECTID`) are exposed. The adapter uses an independent [Census address geocoder](https://geocoding.geo.census.gov/geocoder/) point and an ArcGIS point-intersection query. It preserves multiple/combined provider labels. This is municipality coverage, not proof of service to a building, meter or account. Query results and matching method are clickable. The service does not supply a feature record date; dates remain null. The [official dataset documentation](https://www.mass.gov/info-details/massgis-data-public-utility-service-providers) identifies the dataset and its source/vintage; its date is not substituted for a feature record date.
2. [Analyze Boston Approved Building Permits](https://data.boston.gov/dataset/approved-building-permits), resource `6ddcd912-32a0-43df-9908-63574f8c7e77`. The working [CKAN API](https://data.boston.gov/api/3/action/datastore_search?resource_id=6ddcd912-32a0-43df-9908-63574f8c7e77&limit=1) returned records successfully. The adapter searches electrical permits, then requires an exact normalized street address and Boston/MA; a supplied numeric parcel ID must also match after leading-zero normalization. Without that parcel identifier, the address relationship remains a candidate. Each permit has a direct filtered official API record reference. We retain issue date, source status, description and identity; filing dates and drawing URLs are not exposed and remain unavailable. Latest 100 source records are queried and truncation disclosed. Open/Closed does not prove work completion, current installed equipment or interconnection approval. No electrical ratings are parsed from free-text permits.
3. Existing authorized site documents: the adapter indexes only evidence already linked to fields in the current site/parcel record. Original file names, hashes, field references and review states are retained. Session availability is reported separately from a saved reference. No extraction provider is configured in this repository; no paid/vision calls or secrets were added. Manual value entry, source/page or region context, existing/proposed labeling and engineering review remain available through Source & Method. Structured templates accommodate the requested equipment subattributes without creating duplicate field records.

## Investigated sources that are not connected as automatic site lookups

- [Massachusetts DPU interconnection reports](https://www.mass.gov/info-details/utility-interconnection-in-massachusetts) and [filings/tariffs](https://www.mass.gov/info-details/interconnection-filings-and-tariffs): official public research resources. No dependable site/account/project join was established. Links are provided; no claim of an automatic filing match, approval, tariff or installed rating is made. Published engineering requirements are generic, not evidence of a property's existing service.
- [ISO New England public queue](https://www.iso-ne.com/system-planning/interconnection-service/interconnection-request-queue/): proposed project requests, not a building-service inventory. Not automatically joined to customer properties.
- [Worcester Building & Zoning](https://www.worcesterma.gov/building-zoning) and [Holliston Building](https://www.townofholliston.us/187/Building): official permit research paths. No supported, documented anonymous API was established in this investigation. They return an unavailable adapter status with a manual link. No universal scraper, authentication bypass or private utility-account retrieval was implemented.
- Eversource/National Grid/municipal provider coverage is identified by the MassGIS dataset. Company-specific private service/account systems are not accessed. A municipality/provider name never determines a tariff.

## Field-by-field findings

“Rarely” means a lawful public filing/drawing might contain a site-specific value, but the connected sources do not reliably retrieve it. Customer evidence is required when no such record is available. All public candidates require review; none becomes Engineer Verified automatically.

| Electrical field | Publicly discoverable | Source investigated | Working retrieval method | Reliability limitations | Remaining dependencies |
|---|---|---|---|---|---|
| Serving utility | Yes, as candidate | MassGIS/DPU provider layer | Independent Census point → official polygon query; municipality/provider/feature references | Town coverage may contain multiple providers; not meter/account confirmation | Recent facility bill or utility confirmation |
| Revenue meter manufacturer/model | Rarely | Boston permits; site evidence | Existing `meterModel` document references and manual structured entry | No manufacturer/model extracted from generic permit text or imagery | Existing photo/document, reviewer |
| Revenue meter identifier/location | Rarely | Boston permits; site evidence | `meterId` evidence lookup; structured identifier/location entry | Meter identifiers are not supplied by connected public GIS | Bill/meter records or authorized exterior photo |
| Service voltage | Rarely | Electrical permits/drawings; customer service records | Document evidence discovery and manual `voltage` entry | Proposed voltage and nominal meter voltage do not establish service voltage | Utility service record/existing single-line |
| Service phase / number of wires | Rarely | Permits/drawings; customer evidence | `phase` structured template supports phase and service-wire count | No inference from municipality, meter appearance or conductor visibility | Existing service drawing/utility documentation |
| Service amperage | Rarely | Permits; switchboard records | Field-linked documents and manual review | A panel/receptacle rating in a permit is not a service rating | Existing switchboard/service label or diagram |
| Available electrical capacity | No through connected public sources | Permits; utility requirements | Missing reason and targeted request | Nameplate amperage is not unused capacity | Engineer assessment and measured demand/load data |
| Utility pole identifiers | Sometimes | Public filings; customer utility/site plans | Existing `utilityPole` document references/structured entry | Nearby pole does not prove service relationship; no pole network endpoint queried | Verified utility/site documentation |
| Available breaker space | No through connected public sources | Panel schedules/customer evidence | Evidence lookup and targeted request | Exterior appearance or main rating does not establish compatible spaces | Qualified electrician's assessment or current panel schedule |
| Main panel manufacturer/model/rating | Rarely | Permit archive; customer drawings | `panelRating` structured entry and evidence lookup | Generic proposed panel descriptions are not current installed equipment | Existing panel nameplate/schedule, qualified reviewer |
| Main breaker/main bus ratings | Rarely | Permit drawings/customer equipment records | Existing `breaker` structured ratings and evidence workflow | Separate ratings must be substantiated; no unused-capacity inference | Current drawings/labels and electrical review |
| Main electrical room location | Sometimes | Public plans; facility drawings | `room` evidence lookup/manual review | Connected permit dataset does not publish plan links; historic layouts may change | Facility floor/as-built plan |
| Transformer identifier/manufacturer/model/location | Rarely | Permits, utility/customer evidence | `transformerId` structured observation; existing document references | Visible/nearby transformer may not serve facility | Utility confirmation and authorized equipment records |
| Transformer kVA/voltages/phase | Rarely | Permit drawings/nameplate evidence | Expanded existing `transformerCapacity` equipment template and manual review | No capacity, phase or voltage inferred from imagery or proposed work | Existing nameplate/utility record; authorized access only |
| Existing single-line diagram availability | Sometimes | Permit archives; uploaded documents | Existing `singleLine` evidence references; no automatic document-content claim | Boston API does not expose drawing URLs; file name alone does not prove current as-built contents | Latest existing diagram with revision and manual review |
| Underground utilities/obstructions | Rarely | As-built/site utility documents | Existing evidence lookup and request | Aerial imagery does not prove routing or clearance | Utility survey/as-built documentation |
| Existing equipment separations | Rarely | Dimensioned electrical plans | Existing `equipmentDistance` document workflow | Plans may be proposed/historical and not field verified | Authorized measured/as-built evidence |
| Existing conduit route | Rarely | Electrical/as-built plans | Existing `existingConduit` document workflow | No route inferred from address/map | Current plan or qualified electrician's documented assessment |
| Existing working clearances | Rarely | Existing equipment plans | Existing `existingClearances` evidence workflow | Geometry alone does not establish code-compliant working clearance | Dimensioned existing plan/authorized inspection |
| Potential point of interconnection | Sometimes as candidate | DPU filings, permits, utility correspondence | Official research link and existing `poi` evidence | Neither nearby lines nor a permit imply approval or a usable connection | Utility correspondence and engineer-reviewed diagram |

Utility service territory, provider legal name, public feature ID and municipality ID live in the discovery evidence attached to `utility`. TOWN_ID is a municipality ID, not a utility account/company ID. Interconnection research/limitations live in the same discovery bundle. Missing manufacturer/catalog/location/wire attributes use the existing related equipment fields' structured observations. They are never filled with placeholder claims.

## Integration and integrity

`Find Available Electrical Data` appears inside Electrical Infrastructure. The source adapters return independent error/coverage states; utility failure does not suppress a Boston permit query if Census resolved the municipality. The client checks exact site and parcel identity before applying results, and merges against the latest record. Existing selected user/verified observations and source vintages are preserved; new alternatives remain reviewable. Candidate provider observations are incomplete until facility service is confirmed. Missing values remain null/unselected; field-specific explanations replace generic missing text after discovery.

All 20 electrical fields receive collection statuses and an explanation. Customer requests for unconfirmed/missing electrical data, bills and interval data are generated in the record. Existing owner/notes are preserved, and no request is marked sent. Requests can be copied and reviewed field by field. They explicitly avoid opening cabinets/removing covers or approaching restricted equipment; internal work belongs to qualified/authorized personnel.

Full Site Record and Verification Queue use the same record and request notes. JSON export includes the discovery results, original sources, dates, match methods, historical/current-condition limits and missing-data explanations. Existing documents are indexed, not overwritten.

## Live tests and remaining limits

See [actual live responses](LIVE_SOURCE_TESTS.json). Successful requests:

| Site | Provider candidate returned | Electrical permits |
|---|---|---|
| 79 Lowland Street, Holliston | Eversource Energy (NSTAR Electric) | Unsupported municipal API; official portal link |
| 50 Foster Street, Worcester | National Grid (Massachusetts Electric) | Unsupported municipal API; official portal link |
| 200 Clarendon Street, Boston | Eversource Energy (NSTAR Electric) | 100 exact-address/parcel electrical records; cap disclosed |
| 300 Baker Avenue, Concord | Concord Municipal Light Plant | Unsupported municipal API; official municipal website |
| 25 Haven Street, Reading | Reading Municipal Light Department | Unsupported municipal API; municipal website lookup |

Holliston/Worcester also exercise the no-accessible-electrical-record condition. They still return provider candidates without fabricating service/equipment values. Unit tests cover conflicting/combined provider candidates, mismatched addresses and parcel IDs, outages with permit partial success, uploaded document discovery, preserved verified selections/source vintages, missing values, customer requests, exports and cross-site rejection.

## Final validation

- TypeScript, ESLint, production build and `git diff --check` passed; all 84 tests passed.
- Production API: malformed identity returned HTTP 400 without source queries; a valid Holliston request returned HTTP 200 with Eversource municipality candidate and explicit unavailable permit/interconnection adapters.
- Browser: ran discovery on the saved 200 Clarendon Street record; candidate utility and 100 historical electrical permits appeared with clickable sources. Outstanding electrical equipment values remained missing, with the provider candidate explicitly incomplete.
- Browser: Verification Queue showed the generated service-voltage request and source limitation from the same engineering record.
- Browser: downloaded JSON and inspected it: discovery present, 100 permits, 22 customer requests, service voltage null, provider complete=false, and field-specific missing amperage explanation present.
- Isolated localhost:3002 browser QA: restored an existing synthetic evidence record, re-added an authorized QA text attachment, ran discovery against an intentionally unresolvable synthetic address, and confirmed the document adapter still found the site-linked evidence while the public adapter reported error. Both file references remained; the re-added file was still downloadable, and amperage/voltage remained unpopulated. No synthetic documents were attached to the user's actual site records.
- UI screenshot: [electrical-discovery-dashboard.png](electrical-discovery-dashboard.png).

## Status synchronization (2026-11-07)

Discovery results used to be a snapshot. They now follow the record (`reconcileElectricalDiscovery` in `src/lib/electrical/record.ts`, run by the shared store on every update, load and file restore):

- **New evidence, values and reviews** update each electrical field's statuses, reasons and open requests right away. Evidence alone never completes a request or verifies a field.
- **Search dates are kept.** `retrievedAt` is only set by a search. Re-running a search moves the previous one into `previousSearches` with its original date, address, provider candidates and permit count.
- **Request history.** Each generated request is kept in `requestHistory` as Open, Completed (an engineer-verified value was recorded) or Superseded (wording changed, no longer needed, or results went out of date), with created and resolved dates. Unchanged requests carry over a new search with their original date.
- **Manual notes are safe.** Discovery records the text it wrote in `request.generatedNotes`. It refreshes notes only when they still equal that text; edited or deliberately cleared notes are never overwritten.
- **No inherited findings.** Results whose site key or parcel differ from the record, or whose searched address differs from the current address, are marked `stale`: field statuses and open requests are withdrawn, open requests become Superseded, and the panel asks for a new search. History is kept for reference; observations from other sites are never applied.

Live check (79 Lowland Street, Holliston): search found Eversource; attaching a document to Service voltage changed its status to "Document evidence found · Awaiting engineer review" without a new search or date change; a second search kept the first in history and carried over all 22 open requests without duplicates. Tests: `src/lib/electrical-sync.test.ts`.
