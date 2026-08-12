---
product: Mucinex Cough
basis: in each 5 mL
frames:
  - mucinex_cough_1.jpg
  - mucinex_cough_2.jpg
actives:
  - printed: Dextromethorphan HBr
    ingredient: Dextromethorphan
    strength: 5 mg
  - printed: Guaifenesin
    ingredient: Guaifenesin
    strength: 100 mg
notes: >
  Curved bottle, text rotated 90 degrees and foreshortened where the label wraps out of
  frame. This is the case that motivated the frame-set rule in C4, and the first product in
  the set that genuinely needs two frames.

  Frame 1 holds the full ingredient names. Frame 2 is the wrapped continuation: the
  strengths survive but the names are cut off at the label edge — "omethorphan HBr 5 mg"
  and "aifenesin 100 mg". So neither frame alone is complete, which is exactly what B2c's
  merge has to handle. Expect the naive union to treat the truncations as additional
  ingredients until it dedupes by resolved RXCUI rather than by extracted string.
---
