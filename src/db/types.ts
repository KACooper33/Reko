/**
 * The seam that keeps the matcher testable off-device.
 *
 * The scoring harness runs in Node against data/rxnorm.sqlite; the app runs
 * expo-sqlite against the bundled asset. Both satisfy this interface, so
 * src/match/rxnorm.ts is written once and every measurement the harness makes
 * is a measurement of the code that actually ships.
 */
export type ConceptRow = {
  rxcui: number;
  tty: 'IN' | 'PIN' | 'BN';
  name: string;
  name_norm: string;
};

export interface RxnormDb {
  /** All IN and PIN rows. Small enough (18,322) to hold in memory. */
  ingredients(): Promise<ConceptRow[]>;
  /**
   * Brand names for a concept, whether it is an IN or a PIN.
   *
   * Not "brands for an ingredient" — the distinction matters. Labels print the
   * salt, so most real matches land on a PIN, and a PIN has no has_tradename
   * edges at all. See src/db/queries.ts.
   */
  brandsFor(rxcui: number): Promise<string[]>;
  /**
   * The base ingredient behind a concept: PIN -> IN, or the row itself if it is
   * already an IN. This is the name Reko should show — "Dextromethorphan", not
   * "Dextromethorphan Hydrobromide".
   */
  baseIngredient(rxcui: number): Promise<ConceptRow | null>;
  /**
   * The one recognisable brand, or null when none is trustworthy enough to show.
   * Null is a real answer here — see PRIMARY_BRAND_MIN_REACH.
   */
  primaryBrand(rxcui: number): Promise<{ name: string; reach: number } | null>;
  /** What the ingredient is for. */
  purposeFor(rxcui: number): Promise<{ purpose: string | null; uses: string | null } | null>;
  /** A value from the meta table — release date, attribution. */
  meta(key: string): Promise<string | null>;
}
