# Phase 5B — Environmental data and LiDAR terrain

Implemented in the existing Next.js repository. Google address search, satellite imagery, parcel selection, building/road layers, existing measurements, evidence review and electrical intake remain in place. No satellite-image analysis, feasibility score or inferred electrical values were added.

## Verified public endpoints

| Source | Verified endpoint / operations | Use and limitations |
|---|---|---|
| FEMA NFHL | `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28` plus `/0` availability and `/3` FIRM panels; metadata and polygon queries | Zone/subtype/SFHA polygons, union intersection areas and available effective panel dates. Native NAD83 EPSG:4269 requests avoid upstream projection errors. `maxAllowableOffset=0.00001` degree (roughly 1 meter locally) avoids the upstream full-geometry failure. Geometry is explicitly transformed for display; measurements use projected meters. Approximate screening, not regulatory determination. |
| Official statewide MassDEP wetlands | `https://services1.arcgis.com/hGdibHYSPO59RG1h/ArcGIS/rest/services/DEP_Wetlands/FeatureServer/1` | Polygon Query supports meter-distance search; OBJECTID, WETCODE, IT_VALC, IT_VALDESC, POLY_CODE, SOURCE, SOURCE_SCALE. Primarily 2005 imagery; not a jurisdictional delineation. |
| Initially supplied wetlands copy | `https://services7.arcgis.com/vZE8iWev3YlXRRXa/ArcGIS/rest/services/MADEP_Wetlands/FeatureServer/0` | Metadata/query verified, but its 51,659-record regional subset excludes Holliston and Worcester. It returned empty Lowland results while the official statewide service returned 16 nearby features including parcel overlap. This copy is not the production analysis source. |
| Supplied LiDAR item | `https://www.arcgis.com/sharing/rest/content/items/8bba74ddf38e4254aa08b83847e2501d?f=json` | Resolves to `https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/LiDAR/ELEVATION_LIDAR_INT_2013to2021/ImageServer`. The inspected service has integer-meter S16 pixels; it is not used for terrain sampling. The original project resolution must not be confused with returned service pixels. |
| Float bare-earth DEM | `https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/LiDAR/DEM_lidar_2013to2021_32bitFloat/ImageServer` | Metadata and bounded `exportImage` verified. Unrendered Float32 GeoTIFF, requested EPSG:26986, meters, nearest-neighbor, NoData -9999; actual TIFF keys, pixel dimensions and mask read/validated. Returned grids about 1 m at these sites, rather than a claimed 0.5 m. |
| Official LiDAR index / vectors | `https://gis-prod.digital.mass.gov/geoserver/wfs` | WFS GetFeature `massgis:GISDATA.LIDARINDEX_POLY_CURRENT_BEST` returns source tile/project/download references. `massgis:GISDATA.CONTOURS_1FT_2021_ARC` returns actual contours; bounded CQL spatial/elevation filters avoid whole-tile transfers. Source attributes elev_ft/elev_m retained; lines clipped in EPSG:26986. |
| Municipality | Existing official municipal layer and selected parcel TOWN_ID from Phase 5A | Reuses retrieved municipality; candidate building jurisdiction only, with authority verification required. No fire department, contacts or electrical AHJ invented. |

Official documentation: [Wetlands](https://www.mass.gov/info-details/massgis-data-massdep-wetlands-2005), [LiDAR terrain](https://www.mass.gov/info-details/massgis-data-lidar-terrain-data), [1-foot contour product](https://www.mass.gov/info-details/massgis-data-1-foot-elevation-contours-for-central-and-eastern-ma), [LiDAR index](https://www.mass.gov/info-details/massgis-data-latest-and-best-quality-lidar-terrain-data-index).

## Calculations and coverage

- Environmental polygon measurements use a site-local azimuthal equidistant meter projection, unioning parcel intersections to avoid double counts. Wetland proximity measures the parcel polygon to actual wetland boundary, not the Google marker or a clipped display edge. Zero means boundary touches/crosses/is contained in the parcel. Search radius is 100/250/500 meters. An empty bounded query is never a wetland-absence determination.
- Parcel DEM statistics sample valid pixel centers inside outer rings, excluding holes, NoData and zero-mask cells. Median, minimum, maximum and range convert meters to feet using 0.3048 m/ft. Valid-sample fraction and actual raster/parcel extent coverage are separately retained; partial extrema describe only sampled terrain.
- Terrain request extent includes about 60 m context on each side, minimum 160 m and maximum 1,200 m each axis. Grids are at most 600 pixels each dimension. Large parcels explicitly report partial extent. Geographic input is bounded and validated; API bodies limited to 350 KB. Server results and small raster sets have bounded ten-minute caches.
- Tier A uses actual 2021 official contour vectors where index tiles expose valid contour URLs. 1/2/5/10 ft display filters are supported by that published 1-foot product. `Not Available` index strings are treated as null.
- Tier B generates genuine marching-squares isolines on Float32 pixel centers, linearly interpolating crossings with a saddle decider, excluding cells touching invalid data, and joining real segments. No artificial bounding-box contour is added. Only 5/10 ft are offered for this DEM path. A DEM checkbox allows inspection of the fallback independently.
- NAVD88 Geoid18 is stated for the identified 2021 project. Other acquisition projects retain NAVD88 with a project-specific geoid verification note. Old LiDAR does not establish present-day grading or survey accuracy.
- Flood zones, wetlands and elevation have independent requests, errors, retries and source evidence. Failed/unknown coverage is distinct from a complete covered empty result. A ready elevation summary may coexist with a failed contour request, and vice versa.
- Google is the display/address-selection layer only. Analysis geometry is public MassGIS/FEMA data. Existing portable-export filtering excludes Google Places address/coordinates; public GIS evidence and exempt Place IDs remain. Attribution and Google map terms remain visible. No blanket legal/licensing permission is implied by source availability.

## Live test sites

Final detailed observations, geometry identifiers, timestamps and source URLs are in `PHASE5B_LIVE_RESULTS.json`. Addresses/parcel SITE_ADDR were checked against actual public parcel features, not hardcoded measurement results.

| Site | MassGIS OBJECTID | Parcel ground range | Actual contours | Environmental result |
|---|---|---:|---|---|
| 79 Lowland Street, Holliston | 2251987 | about 26.9 ft | 144 official 5-ft vector features in initial run | FEMA X/AE; about 184,691 sq ft mapped SFHA overlap. Statewide wetland query returned 16 features, about 125,057 sq ft parcel overlap. |
| 25 Southgate Street, Worcester | 588601 | about 8.4 ft | 49 official 5-ft vector features in initial run | Mapped FEMA X. No wetlands returned in the 250 m query; no absence claim. |
| 200 Clarendon Street, Boston | 2380675 | about 3.9 ft | 64 official 5-ft vector features in initial run | Mapped FEMA X. No wetlands returned in the 250 m query; no absence claim. |
| 1500 Main Street, Springfield | 2475347 | about 4.4 ft | 24 genuine DEM-generated 5-ft isolines in initial run | 2015 QL2 source tiles have no official contour URLs; fallback works. One nearby mapped wetland, no parcel overlap, boundary about 675 ft away. |

Counts can change slightly with the final expanded four-corner query envelope. All measured elevations come from live pixels. These four tests do not establish statewide coverage.

## UI and export verification

- Browser tested at `http://localhost:3000/explorer`, the working Google-referrer origin. Existing port-3001 Google key restrictions were not changed. Production APIs were tested at port 3001 separately.
- Real contour lines, labels in feet, gold selected parcel and optional blue building outlines visibly render together. Public satellite mode and both environmental checkboxes work. Returning to the terrain tab retains the selected parcel.
- Elevation-row **View contour map** activates the Elevation tab, scrolls to the map and preserves parcel 2251987; DOM verified feet labels and no Slope row. Screenshot: `phase5b-terrain.png`.
- Changed interval and selected neighboring parcel 1612441 while requests were loading, then restored 2251987: pending results cleared immediately. Requests are aborted on cleanup; body/retry keys and response kind/parcel checks prevent old results from being accepted. Each selected-address component is keyed by Place ID and coordinates; intake is separately keyed by Place ID/parcel.
- Google Places address switching was also exercised using keyboard navigation through its closed-shadow control: select the 200 Clarendon Street Boston suggestion, choose parcel 2380675, start 1-foot terrain retrieval, then initiate the featured Holliston address while source retrieval was pending. Boston returned 210 actual 1-foot contour features. After Holliston became active, its own unselected parcel state appeared and Boston address, 10.3-ft median, contours and dashboard were absent. No page reload or cross-site measurements remained.
- Actual **Export Site Record** download inspected: current parcel environment bundle, source feature/tile references, 58-field inventory and missing checklist; no active/retired Slope export, no Google Places sources. Existing verified values/reviews are preserved by the existing merge logic.
- Inventory now 58 active fields, 47 required existing-condition fields and 11 proposed fields. Old 59-field records migrate Slope into retained internal retired data. It is excluded from visible inventory, readiness, missing list and exports.

## Automated verification

`npm test`: 62 passed. Tests cover analytic plane interpolation, saddle topology, flat surfaces without contours, masks/NoData, holes, feet conversion, generated line geometry/labels, bounding limits, projection round trips, partial extent, failed upstream sources, missing vs covered-empty flood data, tile sentinel values, wrong-parcel collection rejection, legacy Slope migration, and Float32 GeoTIFF georeferencing/NoData decoding and incorrect-CRS rejection. Existing geometry/property/intake tests remain green.

`npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`: passed. No lint warnings. Production server was rebuilt/restarted at 3001 for API QA. No deployment or commit performed.

Missing/partial LiDAR cases and DEM outages were tested with explicit synthetic fixtures. The final production run also observed a real Lowland wetlands timeout: flood/elevation succeeded independently, the wetlands error remained explicit, and a separate retry returned the 16 actual wetland features. The failed attempt and successful retry are both retained in the live results. All four live sites had complete valid parcel DEM samples. Current tests do not prove that every Massachusetts parcel has data.

## Remaining data and files

Wind, snow, public permit records and local code amendments remain **Not retrieved**. Next sources are site-specific current authoritative standards/design criteria and municipal permit/code records. Building/electrical/fire authorities require confirmation; candidate municipal geography alone is incomplete. Existing electrical information requests remain unchanged.

New dependency: `geotiff` (server-side Float32 TIFF decoding); existing `proj4`, polygon-clipping and GIS infrastructure reused. No Python service or heavy GIS code added to the browser.

Added: `src/app/api/environment/route.ts`; `src/lib/environment/{config,types,query,spatial,polygons,elevation,isolines,adapters}.ts`; `src/components/environment/{useEnvironment,EnvironmentControls,EnvironmentEvidence,EnvironmentalDetails}.tsx/ts`; `src/lib/environment.test.ts`; `scripts/verify-environment.ts`; this report, live JSON and screenshot.

Updated: `GisSiteContext`, `GoogleSiteMap`, intake hook/dashboard/evidence/model/schema/types, relevant inventory-count tests/QA scripts, neutral CSS, package manifests and README. Previous phases' uncommitted repository changes were retained.
