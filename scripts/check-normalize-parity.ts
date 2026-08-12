/**
 * Asserts the TypeScript normalizer agrees with the Python one.
 *
 *     npx tsx scripts/check-normalize-parity.ts
 *
 * The rule in assets/test-labels/README.md is one normalize() in three places.
 * Two implementations exist for real reasons — Python builds the database, the
 * app matches against it — so the risk is drift, and drift here makes every
 * comparison lie quietly.
 *
 * This checks the strongest version of the claim available: run the TS function
 * over every concept name and compare against the `name_norm` column that
 * build-rxnorm-db.py wrote. All 23,445 rows, not a sample.
 */
import { NodeRxnormDb } from '../src/db/node';
import { normalize } from '../src/ocr/normalize';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/rxnorm.sqlite', { readOnly: true });
const rows = db.prepare('SELECT name, name_norm FROM concepts').all() as unknown as {
  name: string;
  name_norm: string;
}[];

let mismatches = 0;
const examples: string[] = [];
for (const { name, name_norm } of rows) {
  const ts = normalize(name);
  if (ts !== name_norm) {
    mismatches++;
    if (examples.length < 10) {
      examples.push(`  ${JSON.stringify(name)}\n    python: ${JSON.stringify(name_norm)}\n    ts:     ${JSON.stringify(ts)}`);
    }
  }
}

console.log(`checked ${rows.length.toLocaleString()} concept names`);
if (mismatches === 0) {
  console.log('✅ TypeScript and Python normalize() agree on every row');
} else {
  console.log(`❌ ${mismatches.toLocaleString()} mismatches\n`);
  console.log(examples.join('\n'));
  process.exitCode = 1;
}
db.close();
