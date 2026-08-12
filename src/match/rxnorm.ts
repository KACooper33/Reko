/**
 * B3c — match extracted ingredient strings against RxNorm.
 *
 * This is the merge point with Track A. What it does is set by measurement, not
 * by preference (docs/a3-a4-findings.md):
 *
 *  - Salt abbreviations are expanded by lookup first. `HBr` and `Hydrobromide`
 *    share no trigrams, so no amount of fuzzy scoring reaches the PIN. A
 *    three-entry map moved two measured cases from partial to exact 1.00.
 *
 *  - Everything else is trigram overlap over all IN/PIN rows. Brute force is
 *    the right tool: 19 ms for 18,322 concepts, because A3 pruned hard. The
 *    FTS5 trigram index does NOT do this job — MATCH is substring search, and
 *    `smethicone` is not a substring of `simethicone`.
 *
 *  - Nothing is auto-accepted. `Smethicone` scores simethicone 0.64 against
 *    dimethicone 0.53, and both are real substances. A 0.11 margin between two
 *    real drugs is not a safety margin, so this returns ranked candidates and
 *    B3d asks the user.
 */
import { jaccard, normalize, trigrams } from '../ocr/normalize';
import type { ConceptRow, RxnormDb } from '../db/types';

/**
 * Closed vocabulary. Short because the salts on OTC labels are few.
 *
 * `hci` is not a salt. It is the `l`→`I` misread B2a measured on the control
 * frame, and handling it costs one line.
 */
export const SALT_EXPANSIONS: Record<string, string> = {
  hcl: 'hydrochloride',
  hci: 'hydrochloride',
  hbr: 'hydrobromide',
  hbi: 'hydrobromide',
  so4: 'sulfate',
};

export type Candidate = {
  rxcui: number;
  tty: 'IN' | 'PIN' | 'BN';
  name: string;
  score: number;
};

export type MatchResult = {
  /** What was searched, after normalization and salt expansion. */
  query: string;
  /** Ranked candidates, best first. Never empty unless the index is. */
  candidates: Candidate[];
  /**
   * True when the top candidate is far enough clear of the runner-up to be
   * worth pre-selecting on the confirmation screen. It is NOT permission to
   * skip confirmation.
   */
  confident: boolean;
};

/** Expand salt abbreviations token by token. */
export function expandSalts(s: string): string {
  return normalize(s)
    .split(' ')
    .map((w) => SALT_EXPANSIONS[w] ?? w)
    .join(' ');
}

/** Anything below this is not worth showing as a candidate at all. */
const FLOOR = 0.30;

/**
 * Margin required over the runner-up before the top hit is called confident.
 *
 * Set from the measured near-misses: simethicone beat dimethicone by 0.11, and
 * dextromethorphan beat deudextromethorphan by 0.10. Both runners-up are real
 * substances, so those margins must NOT qualify.
 */
const CONFIDENT_MARGIN = 0.15;
const CONFIDENT_FLOOR = 0.75;

export type PreparedIndex = { row: ConceptRow; grams: Set<string> }[];

/** Build the in-memory trigram index once, then reuse it per query. */
export function prepareIndex(rows: ConceptRow[]): PreparedIndex {
  return rows.map((row) => ({ row, grams: trigrams(row.name_norm) }));
}

/** Score one extracted string against the index. */
export function matchIngredient(
  raw: string,
  index: PreparedIndex,
  limit = 5,
): MatchResult {
  const query = expandSalts(raw);
  const q = trigrams(query);

  const scored: Candidate[] = [];
  for (const { row, grams } of index) {
    const score = jaccard(q, grams);
    if (score >= FLOOR) {
      scored.push({ rxcui: row.rxcui, tty: row.tty, name: row.name, score });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.name.length - b.name.length);
  const candidates = scored.slice(0, limit);

  const top = candidates[0];
  const next = candidates[1];
  const confident =
    !!top &&
    top.score >= CONFIDENT_FLOOR &&
    (!next || top.score - next.score >= CONFIDENT_MARGIN);

  return { query, candidates, confident };
}

/**
 * The brand bridge.
 *
 * The edge direction is the one that cost time in A3: RRF rows read RIGHT TO
 * LEFT, so "Acetaminophen has_tradename Tylenol" stores the ingredient in
 * rxcui2. Querying it the intuitive way returns zero rows and looks exactly
 * like missing data. The adapter's brandsFor() encapsulates that.
 */
export async function brandsForIngredient(db: RxnormDb, rxcui: number): Promise<string[]> {
  return db.brandsFor(rxcui);
}
