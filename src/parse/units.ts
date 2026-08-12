/**
 * Unit canonicalisation, shared by B3a (the basis clause) and B3b (strengths).
 *
 * Its own module so both can use it without a circular import.
 *
 * The `m` and `m!` entries are not typos. B2a measured ML Kit returning those
 * for `mL` — `(in each 5 m)` from the Mucinex bottle and `(in each 0.3 m!)` from
 * Mylicon. Reading the unit literally makes the basis meaningless, and `5 mg`
 * without a basis is meaningless too.
 */
export const UNITS: Record<string, string> = {
  mg: 'mg',
  mcg: 'mcg',
  ug: 'mcg',
  g: 'g',
  ml: 'mL',
  m: 'mL',
  'm!': 'mL',
  'mi': 'mL',
  iu: 'IU',
};

/** Canonical form of a unit token, or null if unrecognised. */
export function canonicalUnit(raw: string): string | null {
  return UNITS[raw.trim().toLowerCase()] ?? null;
}

/**
 * Canonicalise the unit inside a basis clause.
 *
 *   "in each 0.3 m!"  -> "in each 0.3 mL"
 *   "in each softgel" -> "in each softgel"   (no unit to fix)
 *
 * Only a token immediately following a number is treated as a unit, so
 * "in each softgel" is left alone rather than having "softgel" mangled.
 */
export function canonicalizeBasis(basis: string | null): string | null {
  if (!basis) return null;
  return basis
    // No \b terminator: it forces a backtrack on "0.3 m!", matching only "m"
    // and leaving the stray "!" behind as "0.3 mL!".
    .replace(/(\d[\d.,]*)\s*([A-Za-z!]{1,4})/g, (whole, num: string, unit: string) => {
      const canon = canonicalUnit(unit);
      return canon ? `${num} ${canon}` : whole;
    })
    .replace(/\s+/g, ' ')
    .trim();
}
