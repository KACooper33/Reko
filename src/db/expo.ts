/**
 * expo-sqlite adapter — the one that ships.
 *
 * Satisfies the same interface as the Node adapter, so every measurement the
 * scoring harness makes is a measurement of the code that runs on the phone.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import type { ConceptRow, RxnormDb } from './types';

export class ExpoRxnormDb implements RxnormDb {
  constructor(private db: SQLiteDatabase) {}

  async ingredients(): Promise<ConceptRow[]> {
    return this.db.getAllAsync<ConceptRow>(
      "SELECT rxcui, tty, name, name_norm FROM concepts WHERE tty IN ('IN','PIN')",
    );
  }

  async brandsFor(rxcui: number): Promise<string[]> {
    // rxcui2 is the ingredient — RRF reads right to left. See src/match/rxnorm.ts.
    const rows = await this.db.getAllAsync<{ name: string }>(
      `SELECT c.name FROM rel r JOIN concepts c ON c.rxcui = r.rxcui1
        WHERE r.rxcui2 = ? AND r.rela = 'has_tradename' AND c.tty = 'BN'
        ORDER BY c.name`,
      [rxcui],
    );
    return rows.map((r) => r.name);
  }

  async meta(key: string): Promise<string | null> {
    const row = await this.db.getFirstAsync<{ value: string }>(
      'SELECT value FROM meta WHERE key = ?',
      [key],
    );
    return row?.value ?? null;
  }
}
