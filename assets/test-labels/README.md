# Golden test set (C4)

Frozen label frames with hand-written correct answers. This is the instrument the parser
is built with, not a test that grades it afterwards — see C4 in `TASKS.md`.

**A wrong answer file is worse than no answer file.** It reports failure when the code is
right. Two real examples caught during setup: `Dextromethorphane` for *Dextromethorphan*,
and `HCI` (capital i) for *HCl* (lowercase L). Neither string exists in RxNorm, so both
would have made a correct match look like a bug.

---

## Format

One `.md` per **product**, not per image. The frame set is the unit, because on a curved
bottle the answer can need two frames together.

```yaml
---
product: Mucinex Cough
basis: in each 5 mL          # exactly as printed — "in each softgel", "in each 15 mL"
frames:
  - mucinex_cough.jpg        # one or more, in the order a user would shoot them
actives:
  - printed: Dextromethorphan HBr   # verbatim label text  → measures B3b (extraction)
    ingredient: Dextromethorphan    # RxNorm base name     → measures B3c (matching)
    strength: 5 mg
notes: >
  Why this frame is hard. Written for the person debugging a failure on it.
---
```

### Why `printed` and `ingredient` are separate

They measure different failures. Collapse them and a matching bug looks like an
extraction bug.

| Field | Question it answers |
|---|---|
| `printed` | Did OCR and the parser read the label correctly? |
| `ingredient` | Did the result match the right RxNorm concept? |

RxNorm separates these too — `IN` for the base ingredient, `PIN` for the salt form. A3
prunes both. `Chlorpheniramine maleate` is the `PIN`; `Chlorpheniramine` is the `IN`.

### `basis` is not optional

`5 mg` alone is meaningless. The same number means different things per 5 mL, per 15 mL,
and per softgel. B3b extracts strengths, so without the basis you cannot tell a correct
extraction from a wrong one.

---

## Comparison rules

**Normalize for comparison. Never for storage.** `printed` stays verbatim — Reko shows
the user what it found (B3d), so display needs the real string, and debugging needs the
evidence of what the label actually said.

Use **one** `normalize()` in exactly three places: reading a fixture, reading OCR output,
and building RxNorm keys. If those three drift apart, every comparison lies.

For now it needs only: Unicode NFKC, lowercase, trim, collapse whitespace runs.

**Lowercasing does not fix the errors that will actually bite.** `HCl` and `HCI` lowercase
to different strings. The real confusions are `l`↔`I`↔`1`, `0`↔`O`, `5`↔`S`, and `rn`↔`m`.
Those need either confusion-aware fuzzy matching or a small canonical vocabulary for salt
and unit tokens — a closed, short set for the Top 100.

**Do not build that mapping yet.** Wait until B2a shows what ML Kit actually gets wrong.
A4's FTS index is already the planned tool for approximate matching, and guessing the
error distribution in advance is how this gets over-built.

---

## Image rules

- **OTC only. Never a prescription label.** This repo is public, and an Rx label carries a
  patient name, a prescriber, and an Rx number. v1 is OTC-only per D4, so this costs
  nothing — but git history is permanent.
- **Lowercase `.jpg`.** Metro's asset extensions are lowercase, and EAS builds on Linux,
  which is case-sensitive. An uppercase `.JPG` can work on macOS and fail in the cloud.
- **Freeze what you test.** Resizing changes what OCR returns, so if you downscale, do it
  *before* committing. The committed file must be the exact one measured against.
- **Shoot video, commit frames.** A rotation captures every angle in seconds, but a
  fixture must be deterministic. Video forces each run to re-choose frames, which makes a
  parser change indistinguishable from a framing change.

### Size

Five frames at 4032×3024 are ~12 MB. Twenty products with frame sets will pass 100 MB in
a public repo. Decide the downscale policy before the set grows.

---

## Current set

| Product | Frames | Actives | Why it is here |
|---|---|---|---|
| TopCare DayTime Cold & Flu | 2 | 3 | Flat panel, two-column. **The control case** |
| Mucinex Cough | 1 | 2 | Curved bottle, panel wraps out of frame. Needs a 2nd frame |
| NyQuil Kids Cold and Cough | 1 | 2 | Inverted contrast, curved, translucent, shadow. **Hardest** |
| Infants Mylicon | 1 | 1 | Narrow cylinder. Heading is **singular** — "Active ingredient" |

All four were read from the physical labels and cross-checked against the photographs.

### Gaps to fill

- ~16 more products.
- A second frame for Mucinex, so at least one product genuinely needs two frames merged.
- Worn or faded print. Nothing in the set is damaged yet.
- Glare on a glossy carton.
- Frames shot on the **S8** once it is reset. Everything here is S23, which flatters the
  parser.
