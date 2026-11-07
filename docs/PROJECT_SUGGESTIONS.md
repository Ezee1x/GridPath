# Project suggestions and reference records

Added November 7, 2026.

The commercial property address field and global project search now share a keyboard-accessible suggestion list. Suggestions open on focus, filter by facility name or location, and open the existing engineering record when selected. Arrow keys move selection, Enter opens a selected project, Escape dismisses the list, and leaving the field closes it. New addresses with no matching project retain manual intake, including a create-record action within the dropdown.

The three reference projects are Century-Tywood J3 Corp (Holliston, Massachusetts), ThermoFusion (Hayward, California), and Aalberts Surface Technologies (New Hampshire). Names, locations, and reported project-status notes for the additional references come from the user's supplied screenshot. They remain marked Needs review with a traceable source entry. Exact street addresses, electrical ratings, parcel information, and coordinates are not inferred.

New reference records and supplemental status fields are merged into saved workspaces without replacing existing records, field values, source evidence, assignments, or verification edits. The merge is idempotent. Reset restores all three reference projects.

Validation: lint, strict TypeScript, ten tests, and production build passed. Browser checks confirmed all three suggestions, name filtering, location filtering in global search, mouse and Enter selection, Escape dismissal, saved-workspace augmentation, and the no-match manual-address fallback. Browser console checks returned no warnings or errors.

Important files: `src/components/sites/ProjectSearch.tsx`, `src/lib/project-search.ts`, `src/lib/reference-projects.ts`, `src/lib/store.tsx`, and `src/lib/project-search.test.ts`. Preview: `docs/projectsync-project-suggestions.png`.
