/**
 * The SQL, in one place.
 *
 * Both adapters use these strings verbatim. Edge direction in RRF has caused two
 * silent-zero bugs in this project already, so the queries are not duplicated per
 * adapter where they could drift.
 *
 * **RRF reads right to left: a row means `rxcui2 <RELA> rxcui1`.**
 *
 *   has_tradename            rxcui1=BN   rxcui2=IN    "Acetaminophen has_tradename Tylenol"
 *   has_precise_ingredient   rxcui1=PIN  rxcui2=BN    "Tylenol has_precise_ingredient …"
 *   form_of                  rxcui1=IN   rxcui2=PIN   "Dextromethorphan HBr form_of Dextromethorphan"
 */

export const INGREDIENTS = `
  SELECT rxcui, tty, name, name_norm FROM concepts WHERE tty IN ('IN','PIN')
`;

export const META = `SELECT value FROM meta WHERE key = ?`;

/**
 * The base ingredient behind a concept.
 *
 * Labels print the salt — "Dextromethorphan HBr" — but the useful answer, and the
 * one carrying the brands, is the base ingredient. For a PIN this walks `form_of`
 * to the IN. For a concept that is already an IN, it returns that row.
 */
export const BASE_INGREDIENT = `
  SELECT c.rxcui, c.tty, c.name, c.name_norm
    FROM concepts c WHERE c.rxcui = ? AND c.tty = 'IN'
  UNION
  SELECT c.rxcui, c.tty, c.name, c.name_norm
    FROM rel r JOIN concepts c ON c.rxcui = r.rxcui1
   WHERE r.rxcui2 = ? AND r.rela = 'form_of' AND c.tty = 'IN'
  LIMIT 1
`;

/**
 * Brands for a concept, via all three paths, because which one applies depends on
 * whether the match landed on an IN or a PIN.
 *
 * Measured before writing this: querying only `has_tradename` returns **zero**
 * brands for a PIN, and three of the four C4 products match a PIN. A bridge that
 * silently returns nothing for most real labels is worse than no bridge.
 *
 *   1. IN  -> BN   via has_tradename
 *   2. PIN -> BN   via has_precise_ingredient (the salt's own brands)
 *   3. PIN -> IN -> BN  via form_of then has_tradename (the base's brands)
 */
export const BRANDS_FOR = `
  SELECT DISTINCT b.name FROM rel r JOIN concepts b ON b.rxcui = r.rxcui1
   WHERE r.rela = 'has_tradename' AND b.tty = 'BN' AND r.rxcui2 = ?
  UNION
  SELECT DISTINCT b.name FROM rel r JOIN concepts b ON b.rxcui = r.rxcui2
   WHERE r.rela = 'has_precise_ingredient' AND b.tty = 'BN' AND r.rxcui1 = ?
  UNION
  SELECT DISTINCT b.name FROM rel r JOIN concepts b ON b.rxcui = r.rxcui1
   WHERE r.rela = 'has_tradename' AND b.tty = 'BN' AND r.rxcui2 = (
     SELECT rxcui1 FROM rel WHERE rxcui2 = ? AND rela = 'form_of' LIMIT 1
   )
  ORDER BY 1
`;
