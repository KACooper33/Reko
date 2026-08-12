/**
 * Node adapter — used by the scoring harness, never shipped.
 *
 * Uses node:sqlite, which is built in, so the harness needs no extra dependency
 * and cannot drift from the app on a third-party driver's behaviour.
 */
import { DatabaseSync } from 'node:sqlite';
import type { ConceptRow, RxnormDb } from './types';

export class NodeRxnormDb implements RxnormDb {
  private db: DatabaseSync;

  constructor(path = 'data/rxnorm.sqlite') {
    this.db = new DatabaseSync(path, { readOnly: true });
  }

  async ingredients(): Promise<ConceptRow[]> {
    return this.db
      .prepare("SELECT rxcui, tty, name, name_norm FROM concepts WHERE tty IN ('IN','PIN')")
      .all() as unknown as ConceptRow[];
  }

  async brandsFor(rxcui: number): Promise<string[]> {
    // rxcui2 is the ingredient: RRF reads right to left. See src/match/rxnorm.ts.
    const rows = this.db
      .prepare(
        `SELECT c.name FROM rel r JOIN concepts c ON c.rxcui = r.rxcui1
          WHERE r.rxcui2 = ? AND r.rela = 'has_tradename' AND c.tty = 'BN'
          ORDER BY c.name`,
      )
      .all(rxcui) as unknown as { name: string }[];
    return rows.map((r) => r.name);
  }

  async meta(key: string): Promise<string | null> {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  close(): void {
    this.db.close();
  }
}
