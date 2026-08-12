#!/usr/bin/env python3
"""
A3 + A4 — prune RxNorm RRF to a bundle-sized SQLite, with an FTS index.

    python3 scripts/build-rxnorm-db.py

Reads  data/raw/RXNCONSO.RRF and data/raw/RXNREL.RRF   (from A2)
Writes data/rxnorm.sqlite                              (gitignored build artifact)

Both inputs and the output are gitignored. RxNorm is licensed — never commit it.
Regenerate from this script instead.

WHAT IS KEPT, AND WHY
  IN   ingredient          the answer Reko gives
  PIN  precise ingredient  labels print the salt form: B2a measured
                           "Dextromethorphan HBr", not the base
  BN   brand name          the brand bridge, which is the product's point

Everything else goes: dose forms, packs, obsolete atoms, non-English synonyms,
and the hundred-odd other source vocabularies. Only SAB=RXNORM rows are taken,
so names are the normalized RxNorm strings rather than every source's variant.

SIZE TARGET
  Under 25 MB, hard stop 50 MB. This ships inside the APK to phones like a
  Galaxy S8, where a large download is a reason to uninstall.

NORMALIZATION
  name_norm is built by normalize() below. That function must stay identical to
  the one applied to OCR output in the app — fixture, OCR, and RxNorm keys all
  have to go through the same door or every comparison lies. It deliberately
  does NOT try to repair OCR confusions (l/I, 0/O); B2a showed those need a
  separate, evidence-led step, and the trigram index is what absorbs deletions.
"""

import datetime
import glob
import os
import re
import shutil
import sqlite3
import sys
import time
import unicodedata

RAW = "data/raw"
OUT = "data/rxnorm.sqlite"

# The committed, bundled copy. data/ stays gitignored as the working directory;
# this asset is deliberate, because EAS builds in the cloud and cannot
# regenerate it — there is no UMLS key and no 248 MB download in a cloud build.
#
# Committing this is permitted: the build keeps SAB=RXNORM rows only, and
# RxNorm's own normalized names and RXCUIs are US government-created and in the
# public domain. The restricted material is the proprietary third-party source
# vocabularies, which are filtered out. See docs/a3-a4-findings.md.
ASSET = "assets/rxnorm.sqlite"

# Required verbatim by NLM's RxNorm Terms of Service when redistributing.
# Stored in the database so the string travels with the data it describes,
# rather than drifting in a separate constant somewhere in the app.
NLM_ATTRIBUTION = (
    "This product uses publicly available data courtesy of the U.S. National "
    "Library of Medicine (NLM), National Institutes of Health, Department of "
    "Health and Human Services; NLM is not responsible for the product and "
    "does not endorse or recommend this or any other product."
)

KEEP_TTY = {"IN", "PIN", "BN"}

# Relationships that build the bridge. Stored verbatim; direction is verified
# after load rather than assumed, because RRF's from/to convention is a classic
# source of silently reversed graphs.
KEEP_RELA = {
    "has_tradename",
    "tradename_of",
    "has_precise_ingredient",
    "precise_ingredient_of",
}


def normalize(s: str) -> str:
    """Lowercase, NFKC, collapse whitespace. Nothing clever — see module docstring."""
    s = unicodedata.normalize("NFKC", s)
    return " ".join(s.lower().split())


def die(msg: str) -> None:
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


def release_date() -> str:
    """The release actually built from, taken from the downloaded zip's name.

    NLM's terms require a redistributor either to keep the data current or to
    disclose that the bundled copy is not the most current. A database frozen
    inside an APK is stale by definition, so the app discloses this date — which
    means it has to be the real one, not a hardcoded guess.
    """
    zips = glob.glob(os.path.join(RAW, "RxNorm_full_*.zip"))
    if not zips:
        die(f"no RxNorm_full_*.zip in {RAW} — cannot determine the release date")
    m = re.search(r"RxNorm_full_(\d{2})(\d{2})(\d{4})\.zip", os.path.basename(zips[0]))
    if not m:
        die(f"cannot parse a release date from {zips[0]}")
    mm, dd, yyyy = m.groups()
    return datetime.date(int(yyyy), int(mm), int(dd)).isoformat()


def main() -> None:
    conso = os.path.join(RAW, "RXNCONSO.RRF")
    rel = os.path.join(RAW, "RXNREL.RRF")
    for p in (conso, rel):
        if not os.path.exists(p):
            die(f"missing {p} — run scripts/fetch-rxnorm.sh first")

    if os.path.exists(OUT):
        os.remove(OUT)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)

    db = sqlite3.connect(OUT)
    db.executescript(
        """
        PRAGMA journal_mode = OFF;
        PRAGMA synchronous  = OFF;
        CREATE TABLE concepts (
            rxcui     INTEGER PRIMARY KEY,
            tty       TEXT NOT NULL,
            name      TEXT NOT NULL,   -- verbatim RxNorm string, for display
            name_norm TEXT NOT NULL    -- normalize(name), for matching
        );
        CREATE TABLE rel (
            rxcui1 INTEGER NOT NULL,
            rela   TEXT    NOT NULL,
            rxcui2 INTEGER NOT NULL
        );
        CREATE TABLE meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        """
    )

    rel_date = release_date()
    db.executemany(
        "INSERT INTO meta VALUES (?,?)",
        [
            ("rxnorm_release", rel_date),
            ("built_at", datetime.datetime.now().astimezone().isoformat(timespec="seconds")),
            ("source", "RxNorm full monthly release, SAB=RXNORM rows only"),
            ("attribution", NLM_ATTRIBUTION),
        ],
    )
    db.commit()
    print(f"meta:     RxNorm release {rel_date}")

    # ---- pass 1: concepts ---------------------------------------------------
    t0 = time.time()
    seen: dict[int, str] = {}
    rows = []
    read = 0
    with open(conso, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            read += 1
            f = line.split("|")
            if len(f) < 17:
                continue
            if f[1] != "ENG" or f[11] != "RXNORM" or f[16] != "N":
                continue
            tty = f[12]
            if tty not in KEEP_TTY:
                continue
            rxcui = int(f[0])
            if rxcui in seen:
                continue          # one canonical row per concept
            seen[rxcui] = tty
            rows.append((rxcui, tty, f[14], normalize(f[14])))
    db.executemany("INSERT INTO concepts VALUES (?,?,?,?)", rows)
    db.commit()
    print(f"RXNCONSO: {read:,} lines read, {len(rows):,} concepts kept "
          f"({time.time()-t0:.1f}s)")
    for tty in sorted(KEEP_TTY):
        n = sum(1 for v in seen.values() if v == tty)
        print(f"    {tty:4} {n:>7,}")

    # ---- pass 2: relationships ---------------------------------------------
    t0 = time.time()
    read = kept = 0
    batch = []
    with open(rel, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            read += 1
            f = line.split("|")
            if len(f) < 15:
                continue
            # Concept-level RxNorm edges only; the atom-level MMSL rows are noise here.
            #
            # SUPPRESS is EMPTY on every row of RXNREL — measured, all 1,680,430
            # CUI-level RXNORM rows. Requiring "N" here (as RXNCONSO needs) silently
            # rejects the entire file and yields an empty, useless bridge.
            if f[2] != "CUI" or f[6] != "CUI" or f[10] != "RXNORM":
                continue
            if f[14] not in ("", "N"):
                continue
            if f[7] not in KEEP_RELA:
                continue
            if not f[0] or not f[4]:
                continue
            a, b = int(f[0]), int(f[4])
            if a not in seen or b not in seen:
                continue
            batch.append((a, f[7], b))
            kept += 1
            if len(batch) >= 50_000:
                db.executemany("INSERT INTO rel VALUES (?,?,?)", batch)
                batch.clear()
    if batch:
        db.executemany("INSERT INTO rel VALUES (?,?,?)", batch)
    db.commit()
    print(f"RXNREL:   {read:,} lines read, {kept:,} edges kept "
          f"({time.time()-t0:.1f}s)")
    for rela, n in db.execute(
        "SELECT rela, COUNT(*) FROM rel GROUP BY rela ORDER BY 2 DESC"
    ):
        print(f"    {rela:24} {n:>7,}")

    # ---- A4: FTS index ----------------------------------------------------
    # Trigram tokenizer, chosen from B2a's measured error distribution: the
    # damaging class is an interior character DELETION ("Simethicone" read as
    # "Smethicone"). Trigrams survive that; a word-token index does not.
    try:
        db.executescript(
            """
            CREATE VIRTUAL TABLE concepts_fts USING fts5(
                name_norm,
                content='concepts',
                content_rowid='rxcui',
                tokenize='trigram'
            );
            INSERT INTO concepts_fts(rowid, name_norm)
                SELECT rxcui, name_norm FROM concepts;
            """
        )
        print("FTS5:     trigram index built")
    except sqlite3.OperationalError as e:
        die(f"could not build trigram FTS5 index: {e}")

    db.executescript(
        """
        CREATE INDEX idx_rel_1 ON rel(rxcui1, rela);
        CREATE INDEX idx_rel_2 ON rel(rxcui2, rela);
        CREATE INDEX idx_concepts_tty ON concepts(tty);
        """
    )
    db.commit()
    db.execute("VACUUM")
    db.close()

    size = os.path.getsize(OUT)
    mb = size / 1_048_576
    print(f"\n{OUT}  {mb:.1f} MB")
    if mb < 25:
        print("  ✅ under the 25 MB target")
    elif mb < 50:
        print("  ⚠  over target, under the 50 MB hard stop")
    else:
        print("  ❌ OVER THE HARD STOP — the brand allowlist (A6) becomes load-bearing")

    # Publish the bundled copy. This one is committed, so the cloud build has it.
    os.makedirs(os.path.dirname(ASSET), exist_ok=True)
    shutil.copy2(OUT, ASSET)
    print(f"{ASSET}  copied — commit this one")


if __name__ == "__main__":
    main()
