# A2–A4 findings — RxNorm pruned, and how matching actually behaves

Measured 2026-08-11 against RxNorm release **03-Aug-2026**.

Reproduce with:

```bash
./scripts/fetch-rxnorm.sh          # A2
python3 scripts/build-rxnorm-db.py # A3 + A4
python3 scripts/verify-rxnorm-db.py
```

---

## Size: 5.1 MB, against a 25 MB target

| Stage | Size |
|---|---|
| Full release zip | 248 MB |
| `RXNCONSO.RRF` + `RXNREL.RRF` expanded | 632 MB |
| **`data/rxnorm.sqlite`** | **5.1 MB** |

Only 2 of the 12 RRF files are needed. `RXNSAT.RRF` (533 MB of attributes) and
`RXNATOMARCHIVE.RRF` (78 MB of history) are never opened.

Contents, after filtering to `LAT=ENG`, `SAB=RXNORM`, `SUPPRESS=N`:

| TTY | Rows | Purpose |
|---|---|---|
| `IN` | 14,663 | the ingredient answer |
| `PIN` | 3,659 | the salt form labels actually print |
| `BN` | 5,123 | the brand bridge |
| edges | 20,680 | `has_tradename` 7,551 · `precise_ingredient` 2,789, each with its inverse |

**The 25 MB ceiling is not a constraint.** There is room for the DailyMed plain-language
text (A7–A8) without approaching it.

---

## Two RRF traps, both of which produced silent wrong answers

### `SUPPRESS` is empty in `RXNREL`, not `N`

`RXNCONSO` uses `SUPPRESS=N` for active rows. `RXNREL` leaves the field **blank on every
row** — measured across all 1,680,430 CUI-level RxNorm rows.

The first build applied the `RXNCONSO` rule to both files and kept **0 edges**. It
completed successfully, reported a plausible 3.4 MB database, and produced an empty brand
bridge. Nothing failed loudly.

### RRF relationships read right to left

A row means **`rxcui2 <RELA> rxcui1`**, not the other way round.

```
has_tradename            rxcui1=BN   rxcui2=IN
has_precise_ingredient   rxcui1=PIN  rxcui2=BN
```

So "Acetaminophen has_tradename Tylenol" is stored with the ingredient in `rxcui2`.
Querying it the intuitive way returns zero rows, which looks exactly like missing data.

`scripts/verify-rxnorm-db.py` prints the observed TTY on each side before running anything
else, precisely so a reversed graph cannot pass unnoticed.

---

## A6's own test, run for real

`TASKS.md` set the test: does diphenhydramine return "Benadryl, ZzzQuil, Tylenol PM" and
*not* forty store brands?

**It returns 54 brands.** The recognisable ones are there — Benadryl, Aleve PM, Excedrin
PM, Doans PM, Compoz. So are these:

```
Acetadryl · Banophen · Banophen Cream · Calagel
Calagel Reformulated Jun 2019 · Dermamycin · Diphedryl
Diphenhist · Dormin · Buckley's Bedtime Formula
```

`Calagel Reformulated Jun 2019` is not a brand any person would recognise. It is a
registry artefact.

**This settles what A6 is for.** The hand-curated allowlist is **editorially** necessary,
not necessary for size — 5.1 MB is already comfortable. Its job is suppressing noise like
the line above, and RxNorm cannot do that job for you.

It also means A6 is not on the critical path for size, so A5's selection basis does not
block the database.

---

## A4: the FTS index does not do what it was added for

`TASKS.md` A4 says "add FTS index for approximate matching against noisy OCR output".
Measured, it does not provide that.

```
MATCH 'smethicone'   -> NO ROWS
MATCH 'simethicone'  -> simethicone, povidone (K-30) simethicone emulsion
```

FTS5's trigram tokenizer gives **substring** search. `smethicone` is not a substring of
`simethicone`, so the deletion B2a actually measured finds nothing.

### What works instead

Trigram set overlap (Jaccard) scored across every `IN`/`PIN` row:

```
full scan of 18,322 concepts: 19 ms
```

Brute force is fast enough that no index is needed for this path. The dataset is small
because A3 pruned hard, which makes the simplest approach viable.

**Keep the FTS index anyway**, but for a different job: substring and prefix search when
the user types a correction on the B3d confirmation screen. Do not rely on it for OCR
matching.

19 ms is a laptop number. Measure it on the S8 before trusting it.

---

## Matching B2a's real OCR output

Not invented typos — these are the strings ML Kit returned from photographs.

| OCR gave | Top match | Score | Verdict |
|---|---|---|---|
| `Smethicone` | simethicone (IN) | 0.64 | **PASS** — deletion survived |
| `Phenylephrine HCI` | phenylephrine (IN) | 0.78 | base found, salt missed |
| `Dextromethorphan HBr` | dextromethorphan (IN) | 0.81 | base found, salt missed |
| `Acetaminophen` | acetaminophen (IN) | 1.00 | PASS |
| `Chlorpheniramine maleate` | chlorpheniramine maleate (PIN) | 1.00 | PASS |
| `Guaifenesin` | guaifenesin (IN) | 1.00 | PASS |

### Salt abbreviations need a lookup, not fuzzy matching

`HBr` and `Hydrobromide` share **no trigrams**, so no amount of fuzzy scoring reaches the
`PIN`. A three-entry map fixes both cases outright:

```
hcl -> hydrochloride    hbr -> hydrobromide    hci -> hydrochloride
```

| Expanded to | Score | Verdict |
|---|---|---|
| `phenylephrine hydrochloride` | **1.00** | PASS |
| `dextromethorphan hydrobromide` | **1.00** | PASS |

Note the third entry. `hci` is the `l`→`I` misread B2a measured, and handling it costs one
line. The vocabulary is short and closed — the salts on the Top 100 are a handful.

### The margins are uncomfortably thin, and that matters here

```
Smethicone            -> simethicone     0.64
                         dimethicone     0.53   ← a different substance
Dextromethorphan HBr  -> dextromethorphan     0.81
                         deudextromethorphan  0.71   ← a different drug
```

Both runners-up are real substances, not noise. A 0.11 margin between two real drugs is
not a safety margin.

**This is direct evidence for B3d.** A fuzzy match must never be accepted silently. The
confirmation screen is not politeness — it is the control that stops a near-miss between
two real drugs reaching a person.

---

## Confirmed by the fixtures

All nine active ingredients from the four C4 products resolve exactly, and each exists in
both forms where the label uses a salt:

```
Acetaminophen                  IN
Dextromethorphan               IN     Dextromethorphan Hydrobromide   PIN
Phenylephrine                  IN     Phenylephrine Hydrochloride     PIN
Chlorpheniramine               IN     Chlorpheniramine Maleate        PIN
Guaifenesin                    IN     Simethicone                     IN
```

**RxNorm's `IN`/`PIN` split maps exactly onto C4's `ingredient`/`printed` fields.** That
design decision was made before this data existed; it holds.

---

## What is not done

- **Nothing measured on device.** 19 ms is a laptop. The S8 is the number that matters.
- **No `normalize()` shared with the app yet.** It exists in two Python scripts. The rule
  is one function in three places — fixture, OCR output, RxNorm keys — and the app's copy
  does not exist.
- **A5's selection basis is still open**, so the Top 100 is not cut. The database holds all
  14,663 ingredients.
- **A6 not started**, and now known to be an editorial job rather than a size one.
