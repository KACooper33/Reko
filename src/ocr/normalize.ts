/**
 * The one normalizer.
 *
 * `assets/test-labels/README.md` sets the rule: this must be applied in exactly
 * three places — reading a C4 fixture answer, reading OCR output, and building
 * RxNorm keys. If those three drift apart, every comparison lies, and it lies
 * quietly.
 *
 * `scripts/build-rxnorm-db.py` holds the Python twin, which produces the
 * `name_norm` column. `scripts/check-normalize-parity.ts` asserts the two agree.
 *
 * It deliberately does NOT repair OCR confusions. B2a measured the real ones
 * (`l`→`I`, interior deletions, `0`→`O`) and they are handled where the evidence
 * says they should be: salt expansion by closed-vocabulary lookup, and
 * everything else absorbed by trigram scoring in src/match/rxnorm.ts.
 *
 * Normalize for comparison, never for storage. The verbatim string is what the
 * user gets shown on the confirmation screen, and what debugging needs.
 */
export function normalize(s: string): string {
  return s.normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean).join(' ');
}

/**
 * Trigram set of a string, space-padded so word starts and ends carry weight.
 *
 * Padding matters: without it, "smethicone" and "simethicone" score closer to
 * unrelated substrings than they should. Mirrors trigrams() in
 * scripts/verify-rxnorm-db.py, which produced the measured 0.64 score.
 */
export function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  return out;
}

/** Jaccard similarity of two trigram sets. 1.0 is identical. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}
