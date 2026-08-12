# Demo cut — findings

Measured 2026-08-11. Camera capture, a product screen with a confirm step, and
OTC-only brands. RxNorm release 2026-08-03, openFDA NDC export 2026-08-11.

```bash
npm run score   # 4/4 products · brands resolve · no phantoms
```

---

## The OTC filter: neither source works alone

D4 scopes v1 to OTC. B4 showed the brand bridge offering **Auvelity**, an Rx
antidepressant, to someone scanning children's cough syrup.

| | RxNorm `BN` | openFDA OTC |
|---|---|---|
| dextromethorphan | 17 brands, normalised, readable | **1,353**, incl. `12 hr relief cough dm` twice and an ingredient list with typos as a brand |
| Rx contamination | Auvelity, Nuedexta, Bromfed DM | none — clean by construction |

A global join fails: **7%** of RxNorm's 5,123 brand names match an openFDA OTC brand
exactly, **50% match nothing**, and the no-match bucket contains both `Bromfed DM`
(Rx) and `Robafen Cough` (OTC). Absence proves nothing either way.

**What works:** RxNorm supplies candidates, openFDA confirms them — scoped to the
ingredient, fuzzy at ≥0.60. `scripts/tag-otc-brands.py`. 408 of 5,123 brands
confirmed, 270 exactly and 138 fuzzily.

```
diphenhydramine   54 → 16   Benadryl, ZzzQuil, Tylenol PM, Nytol, Sominex, Aleve PM
dextromethorphan  17 →  5   Delsym, Robafen Cough, Chloraseptic
acetaminophen     79 → 22   Tylenol, Tylenol PM, Panadol, Excedrin
simethicone       27 →  5   Gelusil, Tums with Gas Relief, Imodium Multi-Symptom
guaifenesin       29 →  5   Bronkaid, Mucinex, Robafen
```

**A6's own acceptance test now passes.** Auvelity, Nuedexta, Bromfed DM, Apadaz and
Bupap are all `confirmed=0`.

Two things to be honest about:

- **It over-suppresses.** DayQuil Cough and Zicam Cough are genuinely OTC and get
  dropped. The bias is deliberate: a thinner answer beats a wrong one here.
- **Confirmation is per brand, not per (brand, ingredient) pair.** A brand confirmed
  via one ingredient counts as OTC everywhere. This is what rescued simethicone from
  0 to 5 — openFDA has no simethicone OTC ingredient entry, but those brands are
  confirmed via a co-ingredient and genuinely contain simethicone. Imprecise, but
  safe in the direction that matters: a purely-Rx brand is never confirmed anywhere.

**This remains a starting point for A6, not a replacement.** Hand curation adds the
false negatives back and ranks what is left.

---

## A trap worth knowing: `SQLiteProvider` freezes its children

Routing was written as:

```tsx
<SQLiteProvider …>
  {showHarness ? <Harness /> : <Scan />}
</SQLiteProvider>
```

The link to the harness did nothing. Not a coordinate problem — instrumenting the
handler proved `onPress` fired and the setter ran. **`SQLiteProvider` does not
re-render children when its parent re-renders**, so the branch was frozen at mount.
Cold starts behaved identically, ruling out Fast Refresh.

The fix is to put the routing state *below* the provider, in a `Router` component,
so the provider's `children` element is stable.

Worth recording because the symptom is silent: no error, no warning, a button that
simply does nothing.

---

## B2c measured: the union works, for a reason worth understanding

Mucinex is now two frames, and frame 2 is the wrapped continuation. Its OCR is far
worse than the photograph suggested:

```
frame 1 (via heading)        frame 2 (via shape)
  Dextromethorphan HBr 5mg     "tie ngredients (in each" 5mL  → NO MATCH
  Guaifenesin 100mg            "Bnebhorphan HBr" 5mg          → 0.54 dextromethorphan
                               "azsin" 100mg                  → NO MATCH
```

`Dextromethorphan` arrived as **`Bnebhorphan`** and `Guaifenesin` as **`azsin`**.

The merged result is still exactly 2 actives, because two mechanisms happen to
compose correctly:

- The 0.30 score floor drops `azsin` and the heading fragment before they are shown.
- Deduplication is on the **resolved RXCUI**, not the extracted string, so
  `Bnebhorphan HBr` collapses into frame 1's dextromethorphan rather than becoming a
  third ingredient.

Note that `Bnebhorphan` at 0.54 still resolves to the *right* ingredient. That is
luck as much as design, and it is flagged `not confident`, so B3d asks.

---

## Two gaps this exposed, both now closed

**A corrupted heading was being extracted as an ingredient.** `tie ngredients (in
each 5 mL) Purposes` carries a number and a unit, so it satisfied the strength-line
shape. It matched nothing and was harmless — but a corrupted heading that *did*
fuzzy-match an ingredient would become a phantom, and B3d would then ask the user to
confirm something fabricated. `looksLikeStrength` now rejects anything scoring ≥0.35
against the heading.

**The harness measured recall but never precision.** It checked that every expected
ingredient was found, and would have said nothing about inventing extras. For a
medicines app an invented ingredient is arguably worse than a missed one. It now
reports phantoms — extracted ingredients that would be *shown* but appear on no
answer file — and fails the run if any exist. Currently zero.

---

## Camera flow, verified on the emulator

Permission prompt → viewfinder → capture → OCR → *"We could not read that label"*
with a retry. No crash. The emulator renders a synthetic scene, so this exercises
the plumbing, not recognition.

`takePictureAsync()` returns a file URI, which is exactly what `recognizeText()`
takes, so the chain proven against the C4 fixtures is reused unchanged.

`minSdk` re-checked after `expo-camera`: still **24**. The S8 survives. `CAMERA`
permission is added to the manifest by the config plugin with no `app.json` entry.

---

## Not done

- **No real label has been scanned.** The emulator cannot. This is the one thing
  the demo rests on and it needs the S23.
- **B3d confirms but does not correct.** "No" retakes the photo; there is no
  per-ingredient editing. The task asks for correction, so B3d is partial.
- Full-resolution capture is fed straight to OCR. The fixtures were 4032×3024 at
  1.6–2.2 s; if a live capture is slower on the S23, downscaling first is the lever.
- A6's hand curation, C4 beyond five frames, the S8 reset, B5's large type and TTS,
  and the database-versioning problem recorded in B4.
