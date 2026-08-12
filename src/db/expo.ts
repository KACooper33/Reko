/**
 * expo-sqlite adapter — the one that ships.
 *
 * Satisfies the same interface as the Node adapter, so every measurement the
 * scoring harness makes is a measurement of the code that runs on the phone.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import type { ConceptRow, RxnormDb } from './types';
import {
  BASE_INGREDIENT,
  BRANDS_FOR,
  INGREDIENTS,
  META,
  PRIMARY_BRAND_FOR,
  PURPOSE_FOR,
} from './queries';

export class ExpoRxnormDb implements RxnormDb {
  constructor(private db: SQLiteDatabase) {}

  async ingredients(): Promise<ConceptRow[]> {
    return this.db.getAllAsync<ConceptRow>(INGREDIENTS);
  }

  async brandsFor(rxcui: number): Promise<string[]> {
    const rows = await this.db.getAllAsync<{ name: string }>(BRANDS_FOR, [
      rxcui,
      rxcui,
      rxcui,
    ]);
    return rows.map((r) => r.name);
  }

  async baseIngredient(rxcui: number): Promise<ConceptRow | null> {
    return (
      (await this.db.getFirstAsync<ConceptRow>(BASE_INGREDIENT, [rxcui, rxcui])) ?? null
    );
  }

  async primaryBrand(rxcui: number): Promise<{ name: string; reach: number } | null> {
    return (
      (await this.db.getFirstAsync<{ name: string; reach: number }>(PRIMARY_BRAND_FOR, [
        rxcui,
      ])) ?? null
    );
  }

  async purposeFor(
    rxcui: number,
  ): Promise<{ purpose: string | null; uses: string | null } | null> {
    return (
      (await this.db.getFirstAsync<{ purpose: string | null; uses: string | null }>(
        PURPOSE_FOR,
        [rxcui],
      )) ?? null
    );
  }

  async meta(key: string): Promise<string | null> {
    const row = await this.db.getFirstAsync<{ value: string }>(META, [key]);
    return row?.value ?? null;
  }
}
