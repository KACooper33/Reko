# B4 findings — the brand bridge

Measured 2026-08-11. `npm run score` now verifies the bridge for every matched
ingredient, and the result was confirmed on the API 36 emulator.

---

## It works: 8 of 8 matched ingredients resolve to brands

| Ingredient (base) | Brands | First few |
|---|---|---|
| acetaminophen | **79** | Acephen, Acetadryl, Allzital, Anabar |
| guaifenesin | 29 | Allfen CX, Allfen Jr, Ambifed CD |
| phenylephrine | 29 | Alahist D, Benadryl Allergy Plus Congestion, Biorphen |
| simethicone | 27 | Almacone, Bicarsim, Comfort Gel |
| dextromethorphan | 17 | Auvelity, Babee Cof, Bromfed DM |
| chlorpheniramine | 12 | Aller-Chlor, Chlor-Trimeton, Clorrelief |

`PIN → IN` resolution works, so a label printing `Dextromethorphan HBr` now
surfaces **dextromethorphan** — the name a person recognises — and that
ingredient's brands.

---

## The bug that had to be fixed first: a PIN has no brands

`brandsFor()` queried only `has_tradename`. Measured against the real data:

```
PIN  dextromethorphan hydrobromide (102490)  ->  0 brands
IN   dextromethorphan (3289)                 -> 17 brands
```

**Labels print the salt, so three of the four C4 products match a PIN.** The
bridge would have silently returned nothing for most real labels — a bridge that
answers "no related products" for a bottle of Mucinex is worse than no bridge,
because it looks like an answer.

Worse, there was **no path from a PIN back to its IN** in the pruned database. A3
kept four relationship types and none of them connected PIN to IN.

### The fix

`form_of` / `has_form` links them — 18,241 edges in the RxNorm CUI-level rows.
A3 now keeps them, which grew the database from **5.1 MB to 5.5 MB**, still far
under the 25 MB target.

Brands now resolve by three paths, unioned, because which one applies depends on
where the match landed:

| Path | For |
|---|---|
| `IN → BN` via `has_tradename` | a match on the base ingredient |
| `PIN → BN` via `has_precise_ingredient` | the salt's own brands |
| `PIN → IN → BN` via `form_of` then `has_tradename` | the base's brands |

The SQL now lives in `src/db/queries.ts`, used verbatim by both adapters. Edge
direction has caused three silent-zero bugs in this project; duplicating the
queries per adapter was inviting a fourth.

`npm run score` fails if any matched ingredient returns zero brands.

---

## ⚠️ The brand lists contain prescription products — this breaks D4

Dextromethorphan's 17 brands include:

| Brand | What it actually is |
|---|---|
| **Auvelity** | Rx antidepressant (dextromethorphan + bupropion) |
| **Nuedexta** | Rx, for pseudobulbar affect (dextromethorphan + quinidine) |
| **Bromfed DM** | Rx cough syrup |

**D4 scopes v1 to OTC only.** Showing "Auvelity" to someone scanning children's
cough syrup is not noise — it is wrong, and it is alarming in a way that matters
for this audience. An older adult reading that their cough medicine relates to an
antidepressant has been actively misinformed.

RxNorm's `BN` set spans prescription and over-the-counter products with no
distinction in the pruned data, and nothing in `RXNCONSO` flags it.

### This changes what A6 is for, again

A6 was recorded as an editorial job — suppressing registry artefacts like
`Calagel Reformulated Jun 2019`. It is now also a **scope boundary**: the
allowlist is what keeps v1 inside D4.

There may be a programmatic signal rather than pure hand-curation. **DailyMed SPL
records carry a marketing category** — OTC monograph versus NDA/ANDA — so A7's
data pull could tag brands as OTC or Rx instead of relying on recognition alone.
Worth checking when A7 starts, because 79 brands for acetaminophen is more than a
person should have to triage by memory.

Until then the app labels the list honestly: **"N brands, unfiltered — A6
allowlist not yet applied"**. The count is shown on purpose. Hiding it would hide
the problem.

---

## On-device

Confirmed on the API 36 emulator, Mucinex frame:

```
OCR 2164 ms · match 152 ms · section via heading
Dextromethorphan HBr — 5 mg
→ 1.00 PIN dextromethorphan hydrobromide   (not confident)
also in: Auvelity · Babee Cof · Bromfed DM · Buckley's Cough Suppressant · …
17 brands, unfiltered — A6 allowlist not yet applied
```

Index build 443 ms. Brand lookup is a single query and did not measurably change
the timings.

**One operational note:** `SQLiteProvider` copies the asset only when the database
is absent, so a rebuilt database does not reach a device that already has one.
`adb shell pm clear com.kacooper.reko` forces the re-copy. A shipped app will need
a version check in `meta` to handle this — otherwise an update ships new code
against the old data.

---

## What is not done

- **A6 is now blocking real quality**, not just polish. The Rx contamination above
  is the reason.
- The bridge shows brands for the **top candidate only**, and deliberately: three
  of four matches are flagged *not confident*, and bridging from a guess would
  compound a wrong match into a wrong list of products. B3d resolves this by
  asking first.
- No hardware measurement. Emulator only.
- **Database versioning is unhandled** — see the operational note above.
