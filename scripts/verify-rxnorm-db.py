#!/usr/bin/env python3
"""
Acceptance tests for the A3/A4 database.

    python3 scripts/verify-rxnorm-db.py

Three questions:

  1. Does the brand bridge point the right way, and does it pass A6's own test —
     diphenhydramine returning recognisable household brands?
  2. Can every active ingredient from the C4 fixtures be found exactly?
  3. Can the corrupted strings that B2a actually measured be matched? This is
     the real test. "Smethicone" and "Phenylephrine HCI" are not typos I
     invented — they are what ML Kit returned from real photographs.
"""

import sqlite3
import unicodedata

DB = "data/rxnorm.sqlite"


def normalize(s: str) -> str:
    s = unicodedata.normalize("NFKC", s)
    return " ".join(s.lower().split())


def trigrams(s: str) -> set[str]:
    s = f"  {s} "
    return {s[i : i + 3] for i in range(len(s) - 2)}


def main() -> None:
    db = sqlite3.connect(DB)

    # ---- 1. direction of the bridge ---------------------------------------
    print("=" * 68)
    print("1. BRIDGE DIRECTION")
    print("=" * 68)
    for rela in ("has_tradename", "has_precise_ingredient"):
        row = db.execute(
            """
            SELECT c1.tty, c2.tty, COUNT(*)
              FROM rel r
              JOIN concepts c1 ON c1.rxcui = r.rxcui1
              JOIN concepts c2 ON c2.rxcui = r.rxcui2
             WHERE r.rela = ?
             GROUP BY c1.tty, c2.tty
             ORDER BY 3 DESC LIMIT 1
            """,
            (rela,),
        ).fetchone()
        print(f"  {rela:24} rxcui1={row[0]}  rxcui2={row[1]}  ({row[2]:,} edges)")

    # ---- 2. A6's test ------------------------------------------------------
    print()
    print("=" * 68)
    print("2. A6's TEST — diphenhydramine's brands")
    print("=" * 68)
    ing = db.execute(
        "SELECT rxcui, name FROM concepts WHERE tty='IN' AND name_norm='diphenhydramine'"
    ).fetchone()
    print(f"  ingredient: {ing[1]} (RXCUI {ing[0]})")
    # RRF reads RIGHT TO LEFT: the row means "rxcui2 <RELA> rxcui1".
    # So for "Acetaminophen has_tradename Tylenol", the IN is rxcui2 and the BN
    # is rxcui1. Querying it the intuitive way round returns zero rows and looks
    # like missing data rather than a reversed edge.
    brands = db.execute(
        """
        SELECT c.name FROM rel r JOIN concepts c ON c.rxcui = r.rxcui1
         WHERE r.rxcui2 = ? AND r.rela='has_tradename' AND c.tty='BN'
         ORDER BY c.name
        """,
        (ing[0],),
    ).fetchall()
    print(f"  {len(brands)} brands returned")
    for (n,) in brands[:24]:
        print(f"    {n}")
    if len(brands) > 24:
        print(f"    ... and {len(brands)-24} more")

    # ---- 3. the C4 actives, exact ------------------------------------------
    print()
    print("=" * 68)
    print("3. C4 FIXTURE ACTIVES — exact lookup")
    print("=" * 68)
    for want in (
        "Acetaminophen",
        "Dextromethorphan",
        "Dextromethorphan Hydrobromide",
        "Phenylephrine",
        "Phenylephrine Hydrochloride",
        "Guaifenesin",
        "Simethicone",
        "Chlorpheniramine",
        "Chlorpheniramine Maleate",
    ):
        rows = db.execute(
            "SELECT tty, name FROM concepts WHERE name_norm=? ORDER BY tty",
            (normalize(want),),
        ).fetchall()
        found = ", ".join(f"{t}:{n}" for t, n in rows) if rows else "NOT FOUND"
        print(f"  {want:32} {found}")

    # ---- 4. what B2a actually produced -------------------------------------
    print()
    print("=" * 68)
    print("4. B2a's REAL OCR OUTPUT — can it be matched?")
    print("=" * 68)
    names = db.execute(
        "SELECT rxcui, tty, name, name_norm FROM concepts WHERE tty IN ('IN','PIN')"
    ).fetchall()
    index = [(r[0], r[1], r[2], trigrams(r[3])) for r in names]
    print(f"  scoring against {len(index):,} IN/PIN concepts\n")

    cases = [
        ("Smethicone", "Simethicone", "interior deletion"),
        ("Phenylephrine HCI", "Phenylephrine Hydrochloride", "l -> I substitution"),
        ("Dextromethorphan HBr", "Dextromethorphan Hydrobromide", "salt abbreviation"),
        ("Acetaminophen", "Acetaminophen", "clean control"),
        ("Chlorpheniramine maleate", "Chlorpheniramine Maleate", "clean, two words"),
        ("Guaifenesin", "Guaifenesin", "clean control"),
    ]
    # "HBr" and "Hydrobromide" share no trigrams at all, so the salt form can
    # never be reached by fuzzy matching alone. The vocabulary is short and
    # closed, so expansion is a lookup. This map demonstrates the fix; the real
    # one belongs in B3c.
    SALTS = {
        "hcl": "hydrochloride",
        "hbr": "hydrobromide",
        "hci": "hydrochloride",   # the l -> I misread B2a measured
    }

    def expand_salts(s: str) -> str:
        return " ".join(SALTS.get(w, w) for w in normalize(s).split())

    for raw, expect, why in cases:
        q = trigrams(normalize(raw))
        scored = sorted(
            (
                (len(q & t) / len(q | t), tty, name)
                for _, tty, name, t in index
            ),
            reverse=True,
        )[:3]
        top_score, top_tty, top_name = scored[0]
        hit = normalize(top_name) == normalize(expect)
        # A near-miss on the base ingredient is still useful for Reko.
        partial = not hit and normalize(expect).startswith(normalize(top_name))
        mark = "PASS" if hit else ("PARTIAL" if partial else "FAIL")
        print(f"  [{mark:7}] {raw!r}  ({why})")
        for s, tty, name in scored:
            print(f"             {s:.2f}  {tty:3}  {name}")

        # Retry with the salt abbreviation expanded, where it changes anything.
        exp = expand_salts(raw)
        if exp != normalize(raw):
            q2 = trigrams(exp)
            best2 = max(
                ((len(q2 & t) / len(q2 | t), tty, name) for _, tty, name, t in index)
            )
            hit2 = normalize(best2[2]) == normalize(expect)
            print(f"             → salts expanded to {exp!r}")
            print(f"               [{'PASS' if hit2 else 'FAIL'}] "
                  f"{best2[0]:.2f}  {best2[1]:3}  {best2[2]}")
        print()

    db.close()


if __name__ == "__main__":
    main()
