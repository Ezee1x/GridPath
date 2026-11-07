# Google Maps integration verification

Verified locally November 7, 2026, on `http://localhost:3000/explorer`.

## Observed live behavior

- Google JavaScript SDK loaded, with one bootstrap script after refresh.
- Century-Tywood button resolved the real address through Places Text Search (New).
- Google returned `79 Lowland St, Holliston, MA 01746`, latitude 42.2096727, longitude -71.4137934. These are observed Google values, not seeded coordinates.
- Satellite imagery displayed overhead with a location marker, zoom 19, Google attribution and imagery credits.
- Zoom controls changed zoom 19 → 18 → 19.
- Refresh restored the selected Place ID and fetched fresh address details.
- Desktop 1440px layout showed map and side panel. Mobile 390px layout stacked them, with document width 390px (no horizontal page overflow).
- Missing-key production build rendered the actionable configuration error while saved records remained available. This used an empty process environment override; `.env.local` was not modified. The normal configured production build was rebuilt afterward.
- One existing Next development server on port 3000 was reused; the production preview runs separately on port 3001. The temporary missing-key production server on port 3002 was stopped. No unrelated process was terminated.

## Automated checks

Lint, strict TypeScript, production build and all 14 unit tests pass. New validation tests cover MA/US acceptance, other state/country rejection, incomplete street addresses, invalid coordinates and missing/blank API keys. Test address fixtures are synthetic and never rendered as live results.

## Remaining manual verification

Google's real `PlaceAutocompleteElement` renders successfully. Its closed shadow DOM prevented this browser automation from entering a query or selecting predictions. Live typed autocomplete, keyboard suggestion selection and switching between the Cambridge/Boston examples have therefore **not** been verified. Out-of-state rejection is unit-tested, but has not been exercised through the live widget. No Google authorization error was observed for SDK loading, satellite imagery or featured Places lookup. Those successful paths do not establish autocomplete-specific access or quota availability.

The selected-address handler fetches Place fields, validates returned state/country and updates the map. No autocomplete results or selected-address coordinates are hardcoded. Confirm the full typing/selection path manually before presenting the demo.

## Data boundaries

The Google ZIP differs from the supplied fixture (01746 vs 01747); the UI flags the difference and leaves the saved record unchanged. No parcel, building, road, electrical, transformer or measurement data is inferred. GeoJSON layers have a reusable interface but no fabricated overlays. Google imagery remains an interactive visualization and is not used for analysis.

## Files

- `src/lib/maps/address.ts`: pure address validation and key requirement.
- `src/lib/maps/google-maps.ts`: singleton loader, Place normalization and featured lookup.
- `src/components/maps/useGoogleMaps.ts`: client lifecycle and authorization errors.
- `src/components/maps/GoogleAddressSearch.tsx`: modern Places widget and selection.
- `src/components/maps/GoogleSiteMap.tsx`: satellite map, marker and independent GeoJSON layers.
- `src/components/maps/GoogleAddressWorkspace.tsx`: selection, refresh and location/status panel.
- `src/components/WorkspacePage.tsx`, `src/components/sites/Overview.tsx`, `src/components/sites/SiteDetail.tsx`: integration and accurate location copy.
- `src/app/globals.css`: neutral map/search styling and responsive layout.
- `src/lib/adapters.ts`: Google Places source type.
- `src/lib/maps.test.ts`: address and configuration tests.
- `package.json`, `package-lock.json`: official loader and Google Maps types.
- `.env.example`, `README.md`: setup and architecture documentation.
- `docs/google-maps-desktop.png`: live desktop QA screenshot, including attribution.
