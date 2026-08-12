/**
 * B3a — locate the "Active ingredient(s)" section in OCR output.
 *
 * Two measurements from B2a drive the whole design (docs/b2a-ocr-findings.md):
 *
 *  1. The heading itself corrupts. Mylicon returned
 *     `Active ingreaiiat (in each 0.3 m!)`. Exact match fails, and so does any
 *     regex tight enough to be useful. So the heading is matched fuzzily, and
 *     there is a fallback that does not need the heading at all.
 *
 *  2. The flat `text` field is not in reading order. On the two-column TopCare
 *     panel the Purpose values land far from their ingredients. So this works
 *     from `blocks` and their bounding boxes, not from the concatenated string.
 */
import { jaccard, normalize, trigrams } from '../ocr/normalize';
import { canonicalizeBasis } from './units';

export type OcrBox = { x: number; y: number; width: number; height: number };
export type OcrBlock = { text: string; boundingBox: OcrBox };
export type OcrResult = { text: string; blocks: OcrBlock[] };

/**
 * One visual row.
 *
 * `segments` are the individual cells found on that row, kept separate on
 * purpose. `text` is their concatenation, useful for debugging but NOT what the
 * parser reads — see findActivesSection.
 */
export type Row = { text: string; segments: string[]; y: number; x: number; blocks: OcrBlock[] };

export type Section = {
  /** Lines belonging to the actives section, in reading order. */
  lines: string[];
  /** The parenthetical basis from the heading, e.g. "in each softgel". */
  basis: string | null;
  /** How the section was found — useful when a fixture regresses. */
  via: 'heading' | 'shape';
  /** Similarity of the matched heading, when found that way. */
  headingScore?: number;
};

const HEADING_TARGETS = ['active ingredients', 'active ingredient'];

/** Below this, a candidate heading is not believable. Mylicon's scores ~0.5. */
const HEADING_MIN = 0.45;

/**
 * A strength line: a name, then a number, then a unit.
 *
 * The unit alternatives are deliberately loose because B2a measured `mL`
 * arriving as `m`, `m!` and `ml`. Anchoring on `mg` alone would miss the
 * per-volume products entirely.
 */
const STRENGTH_LINE =
  /^(.*?[a-z]{4,}.*?)\s+(\d+(?:[.,]\d+)?)\s*(mg|mcg|g|ml|m[!l]?|iu)\b/i;

/** Runs of leader dots separate the ingredient column from Purpose. */
const LEADER_DOTS = /[.…]{2,}/;

/**
 * Split blocks into single visual lines.
 *
 * **A block is not a line.** Measured on the frozen fixtures: 11 of TopCare's 30
 * blocks contain embedded newlines, and the actives block holds the heading plus
 * all three ingredients as one string:
 *
 *   'Active ingredients (in each softgel)\nAcetaminophen 325 mg.....\n
 *    Dextromethorphan HBr 10 mg....\nPhenylephrine HCI 5 mg...'
 *
 * Joining block text and collapsing whitespace destroys that structure, and an
 * anchored strength regex then matches only the first ingredient — which is
 * exactly how a three-active product silently returns one.
 *
 * A block's bounding box spans all its lines, so each line's vertical position is
 * interpolated within the box. That keeps the spatial information the two-column
 * grouping depends on.
 */
function toLines(blocks: OcrBlock[]): { text: string; y: number; x: number; block: OcrBlock }[] {
  const out: { text: string; y: number; x: number; block: OcrBlock }[] = [];
  for (const b of blocks) {
    const parts = b.text.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) continue;
    const { y, height, x } = b.boundingBox;
    parts.forEach((text, i) => {
      out.push({ text, y: y + (height * (i + 0.5)) / parts.length, x, block: b });
    });
  }
  return out;
}

/**
 * Group lines into visual rows, so a two-column panel reads across rather than
 * down. Two lines share a row when their vertical centres are within a tolerance
 * derived from line height, which adapts to image resolution.
 */
export function toRows(blocks: OcrBlock[]): Row[] {
  const lines = toLines(blocks).sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: Row[] = [];
  const parts: string[][] = [];

  for (const line of lines) {
    const lineHeight =
      line.block.boundingBox.height /
      Math.max(1, line.block.text.split('\n').filter((s) => s.trim()).length);
    const tolerance = Math.max(lineHeight * 0.5, 6);
    const idx = rows.findIndex((r) => Math.abs(r.y - line.y) <= tolerance);
    if (idx >= 0) {
      parts[idx].push(line.text);
      rows[idx].blocks.push(line.block);
      rows[idx].y = (rows[idx].y * (parts[idx].length - 1) + line.y) / parts[idx].length;
      rows[idx].x = Math.min(rows[idx].x, line.x);
    } else {
      rows.push({ text: '', segments: [], y: line.y, x: line.x, blocks: [line.block] });
      parts.push([line.text]);
    }
  }

  rows.forEach((r, i) => {
    r.segments = parts[i];
    r.text = parts[i].join(' ').replace(/\s+/g, ' ').trim();
  });
  return rows.sort((a, b) => a.y - b.y);
}

/** Fuzzy heading match. Returns the best score over the target phrasings. */
function headingScore(line: string): number {
  // Compare only the part before any parenthesis: the basis varies by product
  // and would otherwise drag every score down.
  const head = normalize(line.split('(')[0]).slice(0, 40);
  if (!head) return 0;
  const t = trigrams(head);
  return Math.max(...HEADING_TARGETS.map((target) => jaccard(t, trigrams(target))));
}

/** Pull "in each softgel" / "in each 5 mL" out of a heading line. */
function extractBasis(line: string): string | null {
  const m = line.match(/\(([^)]*in each[^)]*)\)/i) ?? line.match(/\b(in each [^).]*)/i);
  return m ? canonicalizeBasis(m[1].trim()) : null;
}

/**
 * A line that looks like a strength line, and is not a warning.
 *
 * The exclusions come from real text: dosing tables ("2 softgels with water
 * every 4 hrs"), liver warnings ("more than 4,000 mg of acetaminophen in 24
 * hours") and overdose lines all match the shape otherwise.
 */
function looksLikeStrength(line: string): boolean {
  if (!STRENGTH_LINE.test(line)) return false;
  // A heading is never an active. Measured on Mucinex frame 2, where the corrupted
  // heading "tie ngredients (in each 5 mL) Purposes" carried a number and a unit and
  // was extracted as an ingredient. It matched nothing, so it was harmless — but a
  // corrupted heading that did fuzzy-match some ingredient would become a phantom,
  // and B3d would then ask the user to confirm something fabricated.
  if (headingScore(line) >= 0.35) return false;
  const n = normalize(line);
  if (/\b(do not|warning|overdose|more than|exceed|every \d|hrs|hours|doses|ask a doctor)\b/.test(n)) {
    return false;
  }
  return true;
}

/**
 * Find the actives section.
 *
 * Preferred path: locate the heading, then take the strength-shaped lines that
 * follow it until the next section heading.
 *
 * Fallback: when the heading is too corrupt to recognise, take the first
 * contiguous cluster of strength-shaped lines in the upper part of the panel.
 * Drug Facts always opens with the actives, so position is a real signal.
 */
export function findActivesSection(ocr: OcrResult): Section | null {
  // Read row CELLS, not concatenated rows.
  //
  // Measured on Mylicon: the ingredient shares a visual row with the Purpose
  // column, and because the photo is rotated 90 degrees the x-order does not
  // match reading order — the row concatenates to "..Antigs Smethicone 20 mg.",
  // Purpose first. Any cut-at-leading-dots then destroys the line. Evaluating
  // each cell independently sidesteps rotation entirely and handles column
  // bleed at the same time.
  const rows = toRows(ocr.blocks);
  const lines = rows.flatMap((r) => r.segments).filter(Boolean);

  let bestIdx = -1;
  let best = 0;
  lines.forEach((line, i) => {
    const s = headingScore(line);
    if (s > best) {
      best = s;
      bestIdx = i;
    }
  });

  if (bestIdx >= 0 && best >= HEADING_MIN) {
    const collected: string[] = [];
    // The heading line often carries the first ingredient on the same visual row.
    const headTail = lines[bestIdx].split(/\)\s*/).slice(1).join(') ').trim();
    if (headTail && looksLikeStrength(headTail)) collected.push(headTail);

    for (let i = bestIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (looksLikeStrength(line)) {
        collected.push(line);
        continue;
      }
      // Stop at the next section. "Uses", "Warnings", "Purpose" and "Directions"
      // are the Drug Facts headings that follow the actives.
      if (/^\s*(uses|warnings?|purpose|directions|inactive)/i.test(line) && collected.length) {
        break;
      }
      // Tolerate one stray line — a bled Purpose value or a rotated fragment.
      if (collected.length && i - bestIdx > collected.length + 3) break;
    }

    if (collected.length) {
      return {
        lines: collected,
        basis: extractBasis(lines[bestIdx]),
        via: 'heading',
        headingScore: Number(best.toFixed(2)),
      };
    }
  }

  // Fallback: no believable heading. Take the first run of strength lines.
  const idx = lines.findIndex(looksLikeStrength);
  if (idx < 0) return null;
  const cluster: string[] = [];
  for (let i = idx; i < lines.length; i++) {
    if (looksLikeStrength(lines[i])) cluster.push(lines[i]);
    else if (cluster.length) break;
  }
  // The basis may still be recoverable from a nearby corrupted heading.
  const nearby = lines.slice(Math.max(0, idx - 2), idx + 1).map(extractBasis).find(Boolean);
  return { lines: cluster, basis: nearby ?? null, via: 'shape' };
}

export { LEADER_DOTS, STRENGTH_LINE, looksLikeStrength };
