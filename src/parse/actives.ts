/**
 * B3b — extract active ingredient names and strengths from the actives section.
 *
 * Three rules here are not style choices; each one is a measured failure from
 * B2a (docs/b2a-ocr-findings.md):
 *
 *  1. Cut at the leader dots. The Purpose column bleeds through them:
 *     `Dextromethorphan HBr 15 mg....ough suppressant`. The dots are how the
 *     Drug Facts format separates the columns, so they are a reliable cut.
 *
 *  2. Canonicalise the unit; do not read it. `mL` was measured arriving as `m`,
 *     `m!` and `ml` on three different frames.
 *
 *  3. Never take a number from an adjacent line. A bullet glyph merged with a
 *     digit and turned `3 or more` into `13 or more`. The same merge beside a
 *     strength turns 5 mg into 15 mg, so a strength is only ever read from the
 *     same line as the name it belongs to.
 */
import { STRENGTH_LINE } from './section';
import { canonicalUnit } from './units';

export type Active = {
  /** Verbatim, as printed. What the user gets shown, and what maps to C4's `printed`. */
  printed: string;
  /** The name with the salt suffix left on, cleaned of leader junk. */
  name: string;
  /** Numeric strength, or null when unreadable. */
  strength: number | null;
  /** Canonical unit: mg, mcg, g, mL, IU. */
  unit: string | null;
};

/** Trailing junk that survives the leader-dot cut on some frames. */
const TRAILING_JUNK = /[\s.·:;,|_-]+$/;
const LEADING_JUNK = /^[\s.·:;,|_■•-]+/;

/**
 * Cut a line at the first run of two or more dots.
 *
 * Kept separate and exported because it is the single most load-bearing line of
 * cleanup in the parser, and worth testing on its own.
 */
export function cutAtLeaders(line: string): string {
  // Strip leading junk FIRST. A cell can begin with leader dots — Mylicon's
  // Purpose cell reads "..Antigs" — and cutting at position 0 would return an
  // empty string, silently dropping an ingredient.
  const start = line.replace(LEADING_JUNK, '');
  const m = start.match(/[.…]{2,}/);
  return m ? start.slice(0, m.index) : start;
}

/**
 * Parse one candidate line into an Active.
 *
 * Returns null when the line has no readable name — a name with an unreadable
 * strength is still worth surfacing, because B3d lets the user correct it, but
 * a line with neither is noise.
 */
export function parseActiveLine(line: string): Active | null {
  const printed = line.trim();
  const cut = cutAtLeaders(printed);

  const m = cut.match(STRENGTH_LINE);
  if (m) {
    const name = m[1].replace(LEADING_JUNK, '').replace(TRAILING_JUNK, '').trim();
    if (!name) return null;
    const strength = Number(m[2].replace(',', '.'));
    return {
      printed,
      name,
      strength: Number.isFinite(strength) ? strength : null,
      unit: canonicalUnit(m[3]),
    };
  }

  // No strength on this line. Keep the name if there is a plausible one, so the
  // confirmation screen can show it as found-but-unquantified rather than
  // dropping an ingredient silently.
  const name = cut.replace(LEADING_JUNK, '').replace(TRAILING_JUNK, '').trim();
  if (!/[a-z]{4,}/i.test(name)) return null;
  return { printed, name, strength: null, unit: null };
}

/** Parse every line of a section, dropping noise. */
export function extractActives(lines: string[]): Active[] {
  const out: Active[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const a = parseActiveLine(line);
    if (!a) continue;
    // Guard against the same row arriving twice from overlapping blocks.
    const key = `${a.name.toLowerCase()}|${a.strength}|${a.unit}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}
