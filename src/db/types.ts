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
  /** Brand names for an ingredient RXCUI. */
  brandsFor(rxcui: number): Promise<string[]>;
  /** A value from the meta table — release date, attribution. */
  meta(key: string): Promise<string | null>;
}
