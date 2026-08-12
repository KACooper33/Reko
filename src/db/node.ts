/**
 * Node adapter — used by the scoring harness, never shipped.
 *
 * Uses node:sqlite, which is built in, so the harness needs no extra dependency
 * and cannot drift from the app on a third-party driver's behaviour.
 */
import { DatabaseSync } from 'node:sqlite';
import type { ConceptRow, RxnormDb } from './types';
import { BASE_INGREDIENT, BRANDS_FOR, INGREDIENTS, META } from './queries';

export class NodeRxnormDb implements RxnormDb {
  private db: DatabaseSync;

  constructor(path = 'data/rxnorm.sqlite') {
    this.db = new DatabaseSync(path, { readOnly: true });
  }

  async ingredients(): Promise<ConceptRow[]> {
    return this.db.prepare(INGREDIENTS).all() as unknown as ConceptRow[];
  }

  async brandsFor(rxcui: number): Promise<string[]> {
    const rows = this.db.prepare(BRANDS_FOR).all(rxcui, rxcui, rxcui) as unknown as {
      name: string;
    }[];
    return rows.map((r) => r.name);
  }

  async baseIngredient(rxcui: number): Promise<ConceptRow | null> {
    const row = this.db.prepare(BASE_INGREDIENT).get(rxcui, rxcui) as
      | ConceptRow
      | undefined;
    return row ?? null;
  }

  async meta(key: string): Promise<string | null> {
    const row = this.db.prepare(META).get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  close(): void {
    this.db.close();
  }
}
