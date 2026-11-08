/**
 * Readable site name for headings. Public geocoders return addresses in all
 * caps ("50 FOSTER ST, WORCESTER, MA, 01608"); this only changes letter case
 * for display and keeps two-letter state codes upper case.
 */
export function displayName(name: string) {
  if (name !== name.toUpperCase() || !/[A-Z]/.test(name)) return name;
  return name
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/,\s*([a-z]{2})(?=,|\s*$|\s+\d)/gi, (_m, state: string) => `, ${state.toUpperCase()}`);
}
