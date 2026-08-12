/**
 * Scores the B3a → B3b → B3c pipeline against the C4 golden set.
 *
 *     npx tsx scripts/score-parser.ts
 *
 * Reads the frozen OCR output beside each fixture, so this runs on the laptop
 * with no device and no emulator. That is the point: the parser is developed
 * against measured OCR rather than against a live camera.
 *
 * C4 is the instrument, not the grade. A failure here is a fact about the
 * parser; a failure that disagrees with the label is a fact about the fixture.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { findActivesSection, type OcrResult } from '../src/parse/section';
import { extractActives } from '../src/parse/actives';
import { matchIngredient, prepareIndex } from '../src/match/rxnorm';
import { normalize } from '../src/ocr/normalize';
import { NodeRxnormDb } from '../src/db/node';

const DIR = 'assets/test-labels';

type Answer = {
  product: string;
  basis: string | null;
  frames: string[];
  actives: { printed: string; ingredient: string; strength: string }[];
};

/** Minimal front-matter reader for the fixture format. */
function readAnswer(path: string): Answer {
  const raw = readFileSync(path, 'utf8');
  const body = raw.replace(/^---\n/, '').replace(/\n---[\s\S]*$/, '');
  const answer: Answer = { product: '', basis: null, frames: [], actives: [] };
  let mode: '' | 'frames' | 'actives' = '';
  let current: Record<string, string> | null = null;

  for (const line of body.split('\n')) {
    if (/^product:/.test(line)) answer.product = line.split(':').slice(1).join(':').trim();
    else if (/^basis:/.test(line)) answer.basis = line.split(':').slice(1).join(':').trim() || null;
    else if (/^frames:/.test(line)) mode = 'frames';
    else if (/^actives:/.test(line)) mode = 'actives';
    else if (/^notes:/.test(line)) mode = '';
    else if (mode === 'frames' && /^\s*-\s/.test(line)) {
      answer.frames.push(line.replace(/^\s*-\s*/, '').trim());
    } else if (mode === 'actives') {
      const item = line.match(/^\s*-\s*(\w+):\s*(.*)$/);
      const cont = line.match(/^\s{4,}(\w+):\s*(.*)$/);
      if (item) {
        current = { [item[1]]: item[2].trim() };
        answer.actives.push(current as Answer['actives'][number]);
      } else if (cont && current) {
        current[cont[1]] = cont[2].trim();
      }
    }
  }
  return answer;
}

async function main() {
  const db = new NodeRxnormDb();
  const index = prepareIndex(await db.ingredients());
  const release = await db.meta('rxnorm_release');
  console.log(`RxNorm ${release} · ${index.length.toLocaleString()} IN/PIN concepts\n`);

  const answers = readdirSync(DIR)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => ({ file: f, answer: readAnswer(join(DIR, f)) }));

  let products = 0;
  let passed = 0;
  let bridgeGaps = 0;
  let phantoms = 0;   // extracted ingredients that would be SHOWN but are not on the label
  let missingPurpose = 0;
  const missingOcr: string[] = [];

  for (const { file, answer } of answers) {
    // The frame set is the unit. Merge the actives found across every frame that
    // has frozen OCR — that is B2c's union, exercised here without a camera.
    const found = new Map<string, ReturnType<typeof extractActives>[number]>();
    const vias: string[] = [];
    let basis: string | null = null;

    for (const frame of answer.frames) {
      const ocrPath = join(DIR, frame.replace(/\.jpg$/, '.ocr.json'));
      if (!existsSync(ocrPath)) {
        missingOcr.push(ocrPath);
        continue;
      }
      const ocr = JSON.parse(readFileSync(ocrPath, 'utf8')) as OcrResult;
      const section = findActivesSection(ocr);
      if (!section) continue;
      vias.push(section.via);
      basis ??= section.basis;
      for (const a of extractActives(section.lines)) {
        if (!found.has(normalize(a.name))) found.set(normalize(a.name), a);
      }
    }

    if (!answer.frames.some((f) => existsSync(join(DIR, f.replace(/\.jpg$/, '.ocr.json'))))) {
      continue; // no frozen OCR for this product yet
    }

    products++;
    const expected = answer.actives;
    const lines: string[] = [];
    let ok = 0;

    for (const want of expected) {
      const target = normalize(want.ingredient || want.printed);
      // Find the extracted line whose match resolves to the expected concept.
      let hit: string | null = null;
      let detail = '';
      let topRxcui: number | null = null;
      for (const a of found.values()) {
        const m = matchIngredient(a.name, index, 3);
        const top = m.candidates[0];
        if (!top) continue;
        const topNorm = normalize(top.name);
        if (topNorm === target || target.startsWith(topNorm) || topNorm.startsWith(target)) {
          hit = a.name;
          topRxcui = top.rxcui;
          detail =
            `${top.name} ${top.score.toFixed(2)}` +
            (m.confident ? '' : `  (not confident${m.candidates[1] ? `, next ${m.candidates[1].name} ${m.candidates[1].score.toFixed(2)}` : ''})`);
          break;
        }
      }
      if (hit) {
        ok++;
        lines.push(`      ✓ ${want.ingredient.padEnd(30)} ← ${detail}`);
        // B4 — verify the brand bridge resolves. Querying only has_tradename
        // returned ZERO brands for a PIN, and labels print the salt, so this is
        // checked per product rather than assumed.
        const base = topRxcui !== null ? await db.baseIngredient(topRxcui) : null;
        const brands = topRxcui !== null ? await db.brandsFor(topRxcui) : [];
        if (brands.length === 0) {
          bridgeGaps++;
          lines.push(`          ⚠ no brands — bridge gap`);
        } else {
          lines.push(
            `          base: ${base?.name ?? '?'} · ${brands.length} brands · ${brands.slice(0, 4).join(', ')}`,
          );
        }
        // What the screen actually leads with. A missing purpose or primary brand is a
        // real gap in the demo, so it is reported rather than left to be noticed.
        const baseRxcui = base?.rxcui ?? topRxcui!;
        const primary = await db.primaryBrand(baseRxcui);
        const purposeRow = await db.purposeFor(baseRxcui);
        if (!purposeRow?.purpose) missingPurpose++;
        // Mirror exactly what the screen renders, including the fallback, so the
        // harness output cannot drift from what a person actually sees.
        const shown = primary
          ? `"main ingredient in ${primary.name}" (reach ${primary.reach})`
          : `"sold as ${base?.name ?? want.ingredient}" (fallback)`;
        lines.push(`          shown: ${shown} · ${purposeRow?.purpose ?? 'NO purpose'}`);
      } else {
        lines.push(`      ✗ ${want.ingredient.padEnd(30)} NOT MATCHED`);
      }
    }

    // Precision, not just recall. An invented ingredient is arguably worse than a
    // missed one: B3d would ask the user to confirm something that is not on the
    // label. Measured on Mucinex frame 2, whose severe OCR corruption produces
    // extractions like "azsin" and "tie ngredients (in each".
    const expectedNorms = expected.map((e) => normalize(e.ingredient || e.printed));
    for (const a of found.values()) {
      const m = matchIngredient(a.name, index, 1);
      const top = m.candidates[0];
      if (!top) continue; // below the score floor — never shown, so not a phantom
      const base = await db.baseIngredient(top.rxcui);
      const resolved = normalize(base?.name ?? top.name);
      const accounted = expectedNorms.some(
        (e) => e === resolved || e.startsWith(resolved) || resolved.startsWith(e),
      );
      if (!accounted) {
        phantoms++;
        lines.push(`      ! PHANTOM ${JSON.stringify(a.name)} → ${resolved} ${top.score.toFixed(2)}`);
      }
    }

    const all = ok === expected.length;
    if (all) passed++;
    const basisOk = !answer.basis || (basis && normalize(basis) === normalize(answer.basis));

    console.log(
      `  [${all ? 'PASS' : 'FAIL'}] ${answer.product}  ` +
        `${ok}/${expected.length} actives · via ${vias.join('+') || 'none'} · ` +
        `basis ${basisOk ? 'ok' : `MISMATCH (got ${basis ?? 'none'}, want ${answer.basis})`}`,
    );
    for (const l of lines) console.log(l);
    console.log();
  }

  if (missingOcr.length) {
    console.log('Frames without frozen OCR (run the export in the app):');
    for (const p of new Set(missingOcr)) console.log(`  ${p}`);
    console.log();
  }
  console.log(`${passed}/${products} products fully matched`);
  console.log(
    bridgeGaps === 0
      ? 'brand bridge: every matched ingredient resolved to at least one brand'
      : `brand bridge: ${bridgeGaps} matched ingredients returned NO brands`,
  );
  console.log(
    phantoms === 0
      ? 'precision: no invented ingredients would reach a user'
      : `precision: ${phantoms} PHANTOM ingredients would be shown — not on any label`,
  );
  console.log(
    missingPurpose === 0
      ? 'purpose: every matched ingredient states what it is for'
      : `purpose: ${missingPurpose} matched ingredients have no purpose text`,
  );
  db.close();
  if ((products && passed < products) || bridgeGaps || phantoms) process.exitCode = 1;
}

main();
