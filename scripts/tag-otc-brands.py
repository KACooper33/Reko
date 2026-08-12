#!/usr/bin/env python3
"""
Tag RxNorm brand names as over-the-counter, using openFDA's NDC directory.

    python3 scripts/build-rxnorm-db.py    # first
    python3 scripts/tag-otc-brands.py     # then this

WHY THIS EXISTS
  B4 wired the brand bridge and it worked — then showed that dextromethorphan's
  brands include Auvelity (an Rx antidepressant), Nuedexta and Bromfed DM. D4
  scopes v1 to OTC only. Telling someone holding children's cough syrup that it
  relates to an antidepressant is not noise; it is a wrong and alarming answer,
  and this audience is the least equipped to discount it.

WHY IT WORKS THE WAY IT DOES
  Two sources, neither usable alone. Measured before this was written:

    RxNorm BN      17 brands for dextromethorphan. Clean, normalised, recognisable
                   — but includes Rx products with no flag to tell them apart.
    openFDA OTC    1,353 "brands" for the same ingredient, including
                   "12 hr relief cough dm" twice and an ingredient list with
                   typos as a brand name. Correctly OTC-scoped, unusable to read.

  A global join fails outright: only 7% of RxNorm's 5,123 brand names match an
  openFDA OTC brand exactly, 50% match nothing at all, and the no-match bucket
  holds both Bromfed DM (Rx) and Robafen Cough (OTC). Absence proves nothing.

  So: RxNorm supplies the candidates, openFDA confirms them — scoped to the
  ingredient, with fuzzy matching for the many near-misses ("Robafen Cough" vs
  openFDA's "Robafen Cough DM").

WHAT IT DOES NOT DO
  This over-suppresses. DayQuil Cough and Zicam Cough are genuinely OTC and get
  dropped. That bias is deliberate: losing a real brand makes a thinner answer,
  while admitting an Rx brand makes a wrong one.

  It is therefore a STARTING POINT FOR A6, not a replacement for it. A6's hand
  curation adds the false negatives back and ranks what remains. Do not mistake
  this for an authoritative OTC classification.

  Known gap: simethicone gets 0 confirmed brands because openFDA has no OTC
  ingredient entry for it at all.

  Confirmation is recorded per BRAND, not per (brand, ingredient) pair. A brand
  confirmed OTC via one ingredient counts as OTC everywhere. That is imprecise,
  but safe in the direction that matters: a purely-Rx brand like Auvelity is
  never confirmed for any ingredient, so it is excluded regardless.
"""

import json
import os
import sqlite3
import sys
import urllib.request
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rxnorm_common import jaccard, normalize, trigrams  # noqa: E402

DB = "data/rxnorm.sqlite"
ASSET = "assets/rxnorm.sqlite"
RAW = "data/raw/drug-ndc.json.zip"
URL = "https://download.open.fda.gov/drug/ndc/drug-ndc-0001-of-0001.json.zip"

# Below this a candidate is not the same brand. 0.6 accepts "Robafen Cough" against
# "Robafen Cough DM" while rejecting unrelated names that share a common word.
FUZZY_MIN = 0.60


def fetch() -> None:
    if os.path.exists(RAW):
        print(f"  using cached {RAW} ({os.path.getsize(RAW) / 1_048_576:.1f} MB)")
        return
    os.makedirs(os.path.dirname(RAW), exist_ok=True)
    print(f"  downloading {URL}")
    urllib.request.urlretrieve(URL, RAW)
    print(f"  got {os.path.getsize(RAW) / 1_048_576:.1f} MB")


def main() -> None:
    if not os.path.exists(DB):
        sys.exit(f"error: {DB} missing — run scripts/build-rxnorm-db.py first")
    fetch()

    with zipfile.ZipFile(RAW) as z:
        payload = json.loads(z.read(z.namelist()[0]))
    records = payload["results"]
    export_date = payload.get("meta", {}).get("last_updated", "unknown")
    print(f"  openFDA: {len(records):,} records, exported {export_date}")

    # OTC brand names, indexed by active ingredient name.
    otc_by_ing: dict[str, set[str]] = {}
    otc_records = 0
    for r in records:
        if "OTC" not in (r.get("product_type") or ""):
            continue
        otc_records += 1
        brand = r.get("brand_name") or r.get("brand_name_base")
        if not brand:
            continue
        nb = normalize(brand)
        for ai in r.get("active_ingredients") or []:
            name = ai.get("name")
            if name:
                otc_by_ing.setdefault(normalize(name), set()).add(nb)
    print(f"  OTC records: {otc_records:,} across {len(otc_by_ing):,} ingredient names")

    db = sqlite3.connect(DB)
    db.executescript(
        """
        DROP TABLE IF EXISTS brand_otc;
        CREATE TABLE brand_otc (
            rxcui     INTEGER PRIMARY KEY,  -- the BN
            confirmed INTEGER NOT NULL,     -- 1 = openFDA lists it as OTC
            via       TEXT                  -- 'exact' | 'fuzzy' | NULL
        );
        """
    )

    # Every (ingredient -> brand) pair the bridge can traverse.
    pairs = db.execute(
        """
        SELECT i.rxcui, i.name_norm, b.rxcui, b.name_norm
          FROM rel r
          JOIN concepts i ON i.rxcui = r.rxcui2 AND i.tty = 'IN'
          JOIN concepts b ON b.rxcui = r.rxcui1 AND b.tty = 'BN'
         WHERE r.rela = 'has_tradename'
        """
    ).fetchall()

    verdict: dict[int, tuple[int, str | None]] = {}
    pool_cache: dict[str, list[tuple[str, set[str]]]] = {}

    for _, ing_norm, bn_rxcui, bn_norm in pairs:
        if verdict.get(bn_rxcui, (0, None))[0] == 1:
            continue  # already confirmed via another ingredient

        if ing_norm not in pool_cache:
            # Include salt forms: the label says "dextromethorphan hydrobromide",
            # openFDA indexes both that and the base.
            pool = set()
            for key, brands in otc_by_ing.items():
                if key.startswith(ing_norm):
                    pool |= brands
            pool_cache[ing_norm] = [(p, trigrams(p)) for p in pool]

        pool = pool_cache[ing_norm]
        if any(bn_norm == p for p, _ in pool):
            verdict[bn_rxcui] = (1, "exact")
            continue
        bt = trigrams(bn_norm)
        if any(jaccard(bt, pt) >= FUZZY_MIN for _, pt in pool):
            verdict[bn_rxcui] = (1, "fuzzy")
        else:
            verdict.setdefault(bn_rxcui, (0, None))

    all_bns = [r[0] for r in db.execute("SELECT rxcui FROM concepts WHERE tty='BN'")]
    db.executemany(
        "INSERT OR REPLACE INTO brand_otc VALUES (?,?,?)",
        [(b, *verdict.get(b, (0, None))) for b in all_bns],
    )
    db.execute(
        "INSERT OR REPLACE INTO meta VALUES ('openfda_export', ?)", (str(export_date),)
    )
    db.execute("CREATE INDEX IF NOT EXISTS idx_brand_otc ON brand_otc(rxcui, confirmed)")
    db.commit()

    conf = sum(1 for v in verdict.values() if v[0] == 1)
    print(f"\n  confirmed OTC: {conf:,} of {len(all_bns):,} brands")
    for via, n in db.execute(
        "SELECT via, COUNT(*) FROM brand_otc WHERE confirmed=1 GROUP BY via"
    ):
        print(f"    via {via}: {n:,}")

    print("\n  Effect on the bridge (A6's own test first):")
    for ing in (
        "diphenhydramine",
        "dextromethorphan",
        "acetaminophen",
        "guaifenesin",
        "chlorpheniramine",
        "simethicone",
    ):
        row = db.execute(
            "SELECT rxcui FROM concepts WHERE tty='IN' AND name_norm=?", (ing,)
        ).fetchone()
        if not row:
            continue
        before = db.execute(
            """SELECT COUNT(DISTINCT b.rxcui) FROM rel r JOIN concepts b ON b.rxcui=r.rxcui1
               WHERE r.rela='has_tradename' AND b.tty='BN' AND r.rxcui2=?""",
            (row[0],),
        ).fetchone()[0]
        after = db.execute(
            """SELECT COUNT(DISTINCT b.rxcui) FROM rel r
                 JOIN concepts b ON b.rxcui=r.rxcui1
                 JOIN brand_otc o ON o.rxcui=b.rxcui AND o.confirmed=1
               WHERE r.rela='has_tradename' AND b.tty='BN' AND r.rxcui2=?""",
            (row[0],),
        ).fetchone()[0]
        flag = "  ← no OTC coverage in openFDA" if after == 0 else ""
        print(f"    {ing:20} {before:>4} → {after:<4}{flag}")

    db.execute("VACUUM")
    db.close()

    import shutil

    shutil.copy2(DB, ASSET)
    print(f"\n  {ASSET}  {os.path.getsize(ASSET) / 1_048_576:.1f} MB — commit this one")


if __name__ == "__main__":
    main()
