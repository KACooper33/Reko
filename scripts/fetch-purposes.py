#!/usr/bin/env python3
"""
A7 (partly) — fetch what each ingredient is for, from openFDA's label endpoint.

    python3 scripts/build-rxnorm-db.py
    python3 scripts/tag-otc-brands.py
    python3 scripts/fetch-purposes.py     # this

WHY openFDA RATHER THAN SCRAPING DAILYMED
  D8 names DailyMed SPL as the plain-language source. openFDA serves the same SPL
  sections through an API, so A7 needs no scraper:

    purpose                 "Purpose Pain reliever/fever reducer"
    indications_and_usage   "Uses temporarily relieves minor aches and pains ..."

  Only ingredients reachable from a confirmed OTC brand are worth fetching — 141 of
  the 14,663 in the database — so this is a couple of minutes, not a bulk download.

WHAT IS STORED, AND WHAT IS NOT
  `purpose` and `uses` are stored VERBATIM. `purpose_display` is reserved and left
  null: it is where hand-written copy goes when A8 runs.

  That column exists because openFDA's own wording is not the register the product
  needs. "Antigas" and "Antihistamine" are accurate and are not how anyone describes
  a medicine to their mother. Shipping them is a deliberate interim choice, and the
  seam for fixing it is a data change rather than a re-architecture.

  Purpose is recorded PER INGREDIENT, not per product. A combination product's own
  label may phrase it differently from what Reko shows.

  Responses are cached under data/raw/purposes/ (gitignored), so re-runs cost nothing.
"""

import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

DB = "data/rxnorm.sqlite"
ASSET = "assets/rxnorm.sqlite"
CACHE = "data/raw/purposes"
API = "https://api.fda.gov/drug/label.json"

# openFDA allows 240 requests a minute without a key. This stays well inside that.
DELAY_S = 0.30


def actives_count(rec: dict) -> int:
    """How many distinct active ingredients this label covers."""
    of = rec.get("openfda") or {}
    subs = of.get("substance_name") or []
    return len({str(x).strip().lower() for x in subs})


def fetch_one(rxcui: int, name: str) -> dict | None:
    """Query openFDA for one ingredient, preferring a SINGLE-ingredient label.

    This matters more than it looks. openFDA's `purpose` section covers the whole
    product, so a combination cold medicine returns "Pain reliever/fever reducer
    Cough suppressant Nasal decongestant" — and attributing all of that to
    dextromethorphan says a cough suppressant is a pain reliever. For a medicines
    app that is not noise, it is a false statement about a drug.

    So: fetch several candidates and take the first whose label has exactly one
    active ingredient. If none exists, store nothing. No answer beats a wrong one.
    """
    path = os.path.join(CACHE, f"{rxcui}.json")
    if os.path.exists(path):
        with open(path) as fh:
            return json.load(fh)

    # generic_name first, then substance_name: RxNorm's IN name is the base
    # ("dextromethorphan") while some labels only index the salt.
    for field in ("openfda.generic_name", "openfda.substance_name"):
        q = f'{field}:"{name}" AND _exists_:purpose'
        url = f"{API}?search={urllib.parse.quote(q)}&limit=20"
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                payload = json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                continue          # no match on this field; try the next
            if e.code == 429:
                print("  rate limited; pausing 20s", file=sys.stderr)
                time.sleep(20)
                continue
            raise
        except Exception as e:                        # noqa: BLE001
            print(f"  {name}: {e}", file=sys.stderr)
            return None
        results = payload.get("results") or []
        single = next((r for r in results if actives_count(r) == 1), None)
        if single:
            os.makedirs(CACHE, exist_ok=True)
            with open(path, "w") as fh:
                json.dump(single, fh)
            return single
        time.sleep(DELAY_S)
    return None


def first(rec: dict, key: str) -> str | None:
    v = rec.get(key)
    if not v:
        return None
    text = v[0] if isinstance(v, list) else v
    return " ".join(str(text).split()) or None


def strip_label(text: str | None, labels: tuple[str, ...]) -> str | None:
    """openFDA prefixes the section name into the text itself.

    Longest label first: "Purposes" must be tried before "Purpose", or the plural
    leaves a stray "s" at the front of the string.
    """
    if not text:
        return None
    for label in sorted(labels, key=len, reverse=True):
        if text.lower().startswith(label.lower()):
            text = text[len(label) :].lstrip(" :")
            break
    # Some labels carry only the section heading, which strips to nothing useful.
    # Measured: epinephrine came back as the bare word "Purpose". A stray heading on
    # screen looks like a bug, so treat it as absent.
    if not text or text.lower() in {w for lab in labels for w in (lab,)} or len(text) < 5:
        return None
    return text


def main() -> None:
    if not os.path.exists(DB):
        sys.exit(f"error: {DB} missing — run scripts/build-rxnorm-db.py first")
    db = sqlite3.connect(DB)
    if not db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='brand_otc'"
    ).fetchone():
        sys.exit("error: brand_otc missing — run scripts/tag-otc-brands.py first")

    db.executescript(
        """
        DROP TABLE IF EXISTS ingredient_purpose;
        CREATE TABLE ingredient_purpose (
            rxcui           INTEGER PRIMARY KEY,
            purpose         TEXT,   -- openFDA, verbatim
            uses            TEXT,   -- indications_and_usage, verbatim
            purpose_display TEXT,   -- reserved: hand-written copy (A8)
            fetched         TEXT
        );
        """
    )

    # Only ingredients the app can actually surface.
    targets = db.execute(
        """
        SELECT DISTINCT i.rxcui, i.name_norm
          FROM rel r
          JOIN concepts i ON i.rxcui = r.rxcui2 AND i.tty = 'IN'
          JOIN concepts b ON b.rxcui = r.rxcui1 AND b.tty = 'BN'
          JOIN brand_otc o ON o.rxcui = b.rxcui AND o.confirmed = 1
         WHERE r.rela = 'has_tradename'
         ORDER BY i.name_norm
        """
    ).fetchall()
    print(f"  {len(targets)} ingredients reachable from a confirmed OTC brand")

    now = time.strftime("%Y-%m-%d")
    rows, hits = [], 0
    for i, (rxcui, name) in enumerate(targets, 1):
        rec = fetch_one(rxcui, name)
        purpose = strip_label(first(rec or {}, "purpose"), ("purposes", "purpose"))
        uses = strip_label(first(rec or {}, "indications_and_usage"), ("uses", "use"))
        if purpose or uses:
            hits += 1
        rows.append((rxcui, purpose, uses, None, now))
        if i % 25 == 0 or i == len(targets):
            print(f"    {i}/{len(targets)}  ({hits} with text)")

    db.executemany("INSERT INTO ingredient_purpose VALUES (?,?,?,?,?)", rows)
    db.execute("INSERT OR REPLACE INTO meta VALUES ('openfda_purposes_fetched', ?)", (now,))
    db.commit()

    print(f"\n  {hits}/{len(targets)} ingredients have purpose or uses text")
    print("\n  Sample — what will actually be shown:")
    for name, purpose in db.execute(
        """
        SELECT c.name, p.purpose FROM ingredient_purpose p
          JOIN concepts c ON c.rxcui = p.rxcui
         WHERE p.purpose IS NOT NULL
         ORDER BY LENGTH(p.purpose) LIMIT 12
        """
    ):
        print(f"    {name:26} {purpose[:56]}")

    db.execute("VACUUM")
    db.close()

    import shutil

    shutil.copy2(DB, ASSET)
    print(f"\n  {ASSET}  {os.path.getsize(ASSET) / 1_048_576:.1f} MB — commit this one")


if __name__ == "__main__":
    main()
