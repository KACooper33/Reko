# B3a–B3c findings — the parser, measured

Measured 2026-08-11 against the four C4 products, on frozen OCR output and again
on the API 36 emulator. Both agree.

```bash
npm run score            # laptop, against frozen OCR
npm run check:normalize  # TS/Python parity
```

---

## Result: 4 of 4 products, every active

| Product | Actives | Section found via | Basis |
|---|---|---|---|
| TopCare DayTime Cold & Flu | 3/3 | heading | ok |
| Mucinex Cough | 2/2 | heading | ok |
| NyQuil Kids Cold and Cough | 2/2 | heading | ok |
| Infants Mylicon | 1/1 | heading | ok |

The shape-based fallback was **not needed** on any of the four. Mylicon's heading
corrupts to `Active ingreaiiat`, and fuzzy matching still scored it 0.50 — above
the 0.45 floor. The fallback stays because one frame passing is not evidence it
never will be.

---

## Three bugs the fixtures caught, all of which failed silently

### 1. A block is not a line

**11 of TopCare's 30 blocks contain embedded newlines.** The actives block holds
the heading and all three ingredients in one string:

```
'Active ingredients (in each softgel)\nAcetaminophen 325 mg.....\n
 Dextromethorphan HBr 10 mg....\nPhenylephrine HCI 5 mg...'
```

The first row-builder joined block text and collapsed whitespace, which destroyed
the newlines. An anchored strength regex then matched only the first ingredient.

**Every product returned exactly one active, and nothing errored.** A three-active
cold medicine silently reported one. That is the worst possible failure shape for
this product — a confident, incomplete answer.

Blocks are now split into lines *before* spatial grouping, with each line's
vertical position interpolated inside the block's bounding box so the two-column
grouping still works.

### 2. A row's cells must stay separate

Mylicon's ingredient shares a visual row with the Purpose column. Because the
photo is rotated 90 degrees, **x-order is not reading order**, so the row
concatenated as:

```
"..Antigs Smethicone 20 mg."     ← Purpose cell first
```

Rather than detect rotation, the parser now evaluates each row **cell**
independently. That sidesteps orientation entirely and handles column bleed at
the same time. It is also why TopCare's match scores rose from 0.33–0.58 to 1.00:
the concatenated text had been polluting the ingredient names.

### 3. Leader-dot cutting must strip leading junk first

`cutAtLeaders` cut at the first run of dots. Mylicon's Purpose cell *begins*
`..Antigs`, so the cut landed at position 0 and returned an empty string —
dropping the ingredient.

Leading junk is now stripped before the cut.

### Also: the basis needed the same unit treatment as strengths

`(in each 0.3 m!)` was canonicalised to `in each 0.3 mL!` — the `\b` in the unit
pattern forced a backtrack that matched only `m` and left the `!` behind. B2a had
already established that `mL` arrives as `m`, `m!` and `ml`; the fix was applying
that knowledge to the basis clause, not only to strengths.

---

## The confidence rule is doing real work

All four products matched. **Most matches are still flagged `not confident`:**

| OCR gave | Top match | Runner-up | Margin | Confident? |
|---|---|---|---|---|
| `Smethicone` | simethicone 0.64 | dimethicone 0.53 | 0.11 | **no** |
| `Dextromethorphan HBr` | dextromethorphan hydrobromide 1.00 | deudextromethorphan hydrobromide 0.91 | 0.09 | **no** |
| `Acetaminophen` | acetaminophen 1.00 | — | — | yes |
| `Guaifenesin` | guaifenesin 1.00 | — | — | yes |

A score of 1.00 is not enough on its own. `deudextromethorphan hydrobromide` is a
real, different drug sitting 0.09 away, so the rule requires a 0.15 margin over
the runner-up as well as a 0.75 floor.

**This is the evidence that B3d is load-bearing rather than courteous.** The
parser is at 4/4 and still declines to assert two of its four products without
asking.

---

## On-device parity, and timings

The emulator produced identical parses to the laptop harness, including the
corrected basis and the same scores and confidence flags.

| Measurement | API 36 emulator |
|---|---|
| Index build — 18,322 IN/PIN concepts into trigram sets | **509 ms**, once at startup |
| OCR per frame | 1,579–2,119 ms |
| Match per frame | **144–164 ms** |

Match cost is comfortable. The index build is the number to watch, because it
happens before the first scan can run.

**Still unmeasured on real hardware.** The S23 should be faster; the S8 is the
one that decides, and it is waiting on the factory reset.

---

## Confirmed: one normalize(), three places

`scripts/check-normalize-parity.ts` runs the TypeScript `normalize()` over every
concept name and compares it against the `name_norm` column that
`build-rxnorm-db.py` wrote. **All 23,445 rows agree.** The rule from the fixture
README is now enforced rather than asserted.

---

## What is not done

- **B2c's merge is implemented but unproven.** The harness takes the union of
  actives across a product's frames, and no product in the set yet *requires* two
  frames, so the logic has nothing to fail against. Mucinex needs a second frame.
- **The brand bridge is not wired into the UI.** `brandsFor()` exists and is
  tested; nothing calls it on screen. That is B4's remaining half.
- **The TopCare barcode frame has no frozen OCR.** It carries no actives, so the
  parser does not need it; it is the frame reserved for the barcode question,
  which needs a real barcode reader rather than OCR.
- **No hardware measurement.** Emulator only.
- Four products is not twenty. Worn print and glare are still absent from C4, and
  nothing has been shot on the S8.
