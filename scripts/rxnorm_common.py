"""
Shared helpers for the Track A scripts.

`normalize` exists here so there is exactly one Python copy. The rule from
`assets/test-labels/README.md` is one normalizer in three places — fixture, OCR
output, RxNorm keys — and `scripts/check-normalize-parity.ts` asserts this matches
the TypeScript twin in `src/ocr/normalize.ts` across all 23,445 concept names.

`trigrams` and `jaccard` mirror `src/ocr/normalize.ts` as well. They produced the
measured scores in `docs/a3-a4-findings.md` (simethicone 0.64, dimethicone 0.53),
so changing the padding or the similarity metric would invalidate every threshold
recorded there.
"""

import unicodedata


def normalize(s: str) -> str:
    """Lowercase, NFKC, collapse whitespace. Deliberately does not repair OCR."""
    s = unicodedata.normalize("NFKC", s)
    return " ".join(s.lower().split())


def trigrams(s: str) -> set[str]:
    """Space-padded trigram set, so word starts and ends carry weight."""
    padded = f"  {s} "
    return {padded[i : i + 3] for i in range(len(padded) - 2)}


def jaccard(a: set[str], b: set[str]) -> float:
    """Similarity of two trigram sets. 1.0 is identical."""
    shared = len(a & b)
    union = len(a) + len(b) - shared
    return shared / union if union else 0.0
