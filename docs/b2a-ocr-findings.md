# B2a findings — OCR on still images

Measured 2026-08-11. `expo-ocr-kit` 0.1.4, Expo SDK 57.0.11, RN 0.86.2, ML Kit
`text-recognition:16.0.1`. Run on the **API 36 emulator**, headless, software GPU.

No camera involved. Four C4 frames read from bundled files via `expo-asset`.

---

## Headline: the module works

| Frame | Chars | Blocks | Time | Ingredient lines correct? |
|---|---|---|---|---|
| TopCare DayTime (flat panel) | 2971 | 30 | 3491 ms | 3 of 3 names, **1 salt wrong** |
| Mucinex Cough (curved bottle) | 1182 | 6 | 2652 ms | 2 of 2 |
| Infants Mylicon (narrow cylinder) | 859 | 4 | 1712 ms | **name corrupted** |
| NyQuil Kids (inverted, translucent) | 949 | 18 | 2521 ms | 2 of 2 |

No crashes, no missing-native-module errors, no `file://` scheme problem — `localUri`
worked as-is on all four.

**This answers the D1 open question for now.** `expo-ocr-kit` holds up on real labels at
SDK 57. No custom Expo Module is needed yet. Re-open the question only if a measured
failure demands it.

Timings are emulator numbers with software rendering. A real S23 should be faster. **Not
yet measured on hardware.**

---

## The difficulty ordering was wrong

The harness labelled NyQuil "hardest" — inverted white-on-blue, curved, translucent,
shadowed. It read cleanly.

**Infants Mylicon was the worst frame**, and it looks like the easiest kind of photo.

```
Active ingreaiiat (in each 0.3 m!)     ← the HEADING is corrupted
Smethicone 20 mg.                      ← the drug NAME lost a letter
```

So the property that predicts OCR failure is **print size and surface curvature, not
contrast polarity**. A small narrow cylinder beats a high-contrast inverted panel.

C4's selection should follow that. Small-print bottles are the hard cases worth
collecting; inverted colour is not the threat it appears to be.

---

## Error taxonomy, with evidence

Five classes, ordered by how much damage each does.

### 1. The section heading itself corrupts — worst for B3a

```
Active ingreaiiat (in each 0.3 m!)      Mylicon
```

B3a's whole job is to locate the "Active ingredient(s)" boundary. Here the heading is
unrecognisable to an exact match and to most loose regexes.

**Consequence for B3a:** heading detection cannot be string equality, and probably cannot
be regex either. It needs fuzzy matching against the heading, or a fallback that finds the
ingredient lines by shape — `<name> <number> <unit>` followed by dotted leaders — and
infers the section from them.

### 2. Characters drop inside drug names — worst for B3c

```
Smethicone 20 mg.                       Mylicon → Simethicone
```

A missing interior letter. Not a case problem, not a substitution — a deletion.

**Consequence for B3c:** this is exactly what A4's FTS index is for. Trigram or edit
distance survives a single deletion; exact lookup does not. Good evidence A4's design is
right.

### 3. `l` → `I`, as predicted

```
Phenylephrine HCI 5 mg...               TopCare → HCl
```

Confirmed on the control frame — the easiest image in the set. Note that the hand-written
answer file made **the same error** before it was caught, which is how it survived a
read-through.

`HCI` is not in RxNorm. **Lowercasing does not fix this** — `hci` and `hcl` still differ.
The salt vocabulary is short and closed (`HCl`, `HBr`, maleate, citrate, sodium, sulfate),
so a canonical lookup beats generic fuzzy matching here.

### 4. Unit suffixes truncate — corrupts `basis`

```
(in each 5 m) Purasa                    Mucinex → 5 mL
(in each 0.3 m!)                        Mylicon → 0.3 mL
(in each 15 ml) Purpose                 NyQuil  → 15 mL  (acceptable)
```

The trailing `L` of `mL` is systematically lost or mangled. C4 requires `basis` because
`5 mg` alone is meaningless — and `in each 5 m` is equally meaningless.

**Consequence for B3b:** the unit token needs canonicalising against a known set, not
reading literally. Treat `m`, `m!`, `ml`, `mL` as the same token when it follows a number
in a basis clause.

### 5. Adjacent columns bleed into the ingredient line

```
Dextromethorphan HBr 10 mg....          clean
Dextromethorphan HBr 5 mg......ough sugyesS
Dextromethorphan HBr 15 mg....ough suppressant
```

The dotted leaders run into the Purpose column, so the line carries trailing junk from a
different column.

**Consequence for B3b:** cut the line at the run of leader dots. Everything after it
belongs to Purpose, not to the ingredient. This is reliable because the leaders are how
the Drug Facts format separates the two columns.

### 6. Bullet glyphs become digits — the dangerous one

```
13 or more alcoholic drinks every day    TopCare → "■ 3 or more"
```

A bullet merged with the following digit and produced a different number. It happened in a
warning here, not in a dose.

**It is the mechanism that matters.** The same merge next to a strength would turn 5 mg
into 15 mg. Any number that reaches the user must be traceable to a matched ingredient,
never lifted from a nearby line — and B3d shows the user what was found precisely so a
corrupted number can be corrected.

---

## Block order is not reading order

On the TopCare panel the Purpose values —
`.Pain reliever/fever reducer`, `.Cough suppressant`, `.Nasal decongestant` — appear far
down the flat `text` string, separated from the ingredients they belong to. `nasal
congestion` surfaced immediately after the actives, where it does not belong.

**The flat `text` field is spatially jumbled on two-column panels. B3a must use the
bounding boxes, not the concatenated string.**

That is the good news in the API: every block carries `{x, y, width, height}`. Grouping by
`y` reconstructs rows, and that is what makes a two-column panel tractable.

Note the block counts, though: TopCare gave 30 blocks, Mucinex 6, Mylicon 4. **Curved
labels merge into a few large blobs**, so there is less spatial structure to exploit
exactly where it is needed most.

---

## Noise to expect

Rotated text elsewhere on the package produces garbage lines:

```
aVNISOTOENEIYSANON                      TopCare — "CONVENIENT RECLOSING TAB" upside down
227LO,0062                              NyQuil  — the UPC digits read as text
LOT3276171911  EXPO912 025              NyQuil  — lot and expiry
```

Harmless, but a parser must not treat every numeric string as a strength.

The NyQuil barcode came through as **text**, not as a scanned code. The barcode question
(UPC → NDC) still needs a real barcode reader; OCR is not a substitute.

---

## What this does not answer

- **Nothing was run on hardware.** All four numbers are emulator numbers.
- **Nothing was run on the S8** or on API 28. The floor is untested for OCR.
- **No frame here needs two frames merged**, so B2c's merge logic still has nothing to
  prove itself against. Mucinex needs a second frame.
- **Accuracy is unmeasured.** These are eyeball comparisons against four answer files.
  There is no scoring harness yet.
