# Reko — v1 Tasks

Companion to `MedLabel_v1_Handoff.md`. The handoff carries *why*; this carries *what's next*.
Last updated: 2026-08-07

---

## Decisions locked

| # | Decision | Value |
|---|---|---|
| D1 | Stack | Expo dev build + `expo-ocr-kit` (Vision on iOS / ML Kit on Android), EAS Build. **Camera is `expo-camera`, not `react-native-vision-camera`** — see below |
| D2 | Bundle ID / package | `com.kacooper.reko` |
| D3 | Platform for v1 testing | **Android only — holds.** Apple Developer Program deferred until after paper test. See C5: one of the three test devices is an iPhone 17, so this is now a known cost, not an assumption |
| D4 | v1 scope | **OTC only.** v2 = OTC + bundling, v3 = expanded OTC, v4 = Rx |
| D5 | Ingredient scope for v1 | **Top 100 actives.** Expand in v3 |
| D6 | Test devices | 3 identified — Galaxy S8, Galaxy S23, iPhone 17. **Two can run v1**, per D3. The S8 sets the floor at API 28 and is the primary B1 target |
| D7 | LLM placement | **Build time only.** No model call at runtime; every shipped string human-reviewed |
| D8 | Plain-language source | **DailyMed SPL.** MedlinePlus is link-out only — AHFS content may not be ingested |
| D9 | Name | **Reko** |
| D10 | Dev/preview bundle ID | TBD — decide whether `com.kacooper.reko.dev` gets its own profile |

### D1 amendment — `expo-camera`, and why vision-camera waits

Decided 2026-08-09. The README stack table said `react-native-vision-camera`. v1 uses **`expo-camera`** instead.

The question that prompted this was a good one: **on a curved bottle the ingredients line can wrap past what one photo holds.** Vision-camera's frame processors are the obvious tool for accumulating text across a rotation. Three things argue against reaching for it now:

- **`expo-ocr-kit` is image-based, not a vision-camera frame-processor plugin.** Its peer dependencies are only `expo`, `react`, and `react-native`. Live OCR is therefore not two packages clicking together — it needs native glue, which *is* the custom Expo Module already listed as an open question. That question says to decide after B2 and C4 give a measured number, and that discipline should hold.
- **Reko's flow is a still photo, not live scanning** — capture, confirm, explain. Multiple stills merged into a union solves the wrap case, and B3d confirms the result regardless. The product never trusts a scan silently, so a missed line is a correctable gap rather than a wrong answer.
- **Vision-camera 5.x pulls in `react-native-nitro-modules` and `react-native-nitro-image`.** Three native dependencies where one will do, on a project whose floor is a nine-year-old phone. Each one can raise `minSdkVersion` above 28 and cost the S8.

Vision-camera stays in reserve, the way Scrivo is held for v4. If C4 measures stills as insufficient on curved bottles, that is the evidence to adopt it — not a guess made in advance.

**Accounts and identifiers**

- **EAS project — linked 2026-08-08.** `@kacooper/reko`, ID `6b9e55ce-906f-4931-951e-617e74c761e8`, owner `kacooper`. Both live in `app.json` (`extra.eas.projectId` and `owner`) and are **committed, not secrets** — see `docs/android-emulator-setup.md` §6
  - Moved out of the `smallbytes` organisation after creation. **The transfer preserved the project ID**, so nothing recorded here went stale
  - The account was also renamed `kacooper33` → `kacooper`. `~/.expo/state.json` still caches the old username; trust `eas whoami`, not the file
  - `eas.json` is committed: `development` and `preview` both build an **APK** under internal distribution. An AAB cannot be sideloaded from a link, which is all B1 does
- **The shipped app holds no secrets.** That follows from D7 (build-time model only) and local-first. The only two secrets in this project are the UMLS UTS API key (A1) and any model key (A8). Both stay on the laptop in `.env`, which `.gitignore` covers. EAS holds the Android signing key

### D9 rationale — why Reko

Nine candidates tested against App Store collision risk. Seven had strikes:

| Candidate | Verdict |
|---|---|
| PillBridge | Taken outright |
| Medicine Cabinet | Keyword healthy, but 4 live apps use the exact phrase in their titles |
| Read the Label | Live collision (food-label app) |
| Clarified | Near-exact live collision (iClarified, News) + root-word overlap in Health & Fitness |
| Common Name | Clean, but generic — describes the mechanism, not the moment |
| Medli | Exact-name live collision in Medical genre ("Medli - Meds Made Simple") |
| Scripta | Exact-name live collision in Medical genre ("Scripta Insights") |
| Scrivo | Clean, but "script-" root is crowded and reads as *prescription* — which v1 doesn't do (D4) |
| **Reko** | **Clean.** No exact match, no adjacent-category collision, no shared-root crowding |

Two notes for anyone revisiting this:
- ASO volume numbers are **not** the deciding factor here. Per handoff §8, an unaware problem generates no search demand by construction, so every honest candidate scores near zero. Collision risk was the real filter.
- Reko's apparent ~1K daily searches is **Roku misspelling traffic**, not real demand. Ignore it.
- Scrivo is held in reserve — it may fit better as a v4 name once Rx is in scope.

### Naming still open
- [ ] Subtitle / short description (carries the keyword weight, not the name)
  - Candidates: "Medicine Label Explainer" · "What's really in it" · "Know what you're taking"
- [ ] iOS keyword field (100 char): medicine, medication, pill, drug, ingredient, OTC, label, dosage, senior
- [ ] Say "Reko" out loud to a pharmacist (handoff §9). Smile or squint?
- [ ] USPTO TESS search
- [ ] `reko.app` / domain availability (optional)

---

## Track A — Data (laptop work, no app required, **start now**)

**This is the long pole and it is not blocked by anything.**

> **A1 and C1 are the only two items that wait on someone else.** A1 waits on UMLS
> approval, which is not instant, and it gates A2 → A3 → A4 → B3c — the longest chain in
> the project. C1 waits on a person to react to a printed card, and it can show the idea
> does not work before any code exists. **Start both today.** Everything else on this list
> waits only on you.

- [x] **A1.** Create UMLS account, accept Metathesaurus license, get UTS API key — **approved and working 2026-08-11.** The key lives in `.env` (gitignored) and downloaded the 03-Aug-2026 release. It gated A2 → A3 → A4 → B3c; all four are now done
- [x] **A2.** Download RxNorm full monthly release (RRF) — **done 2026-08-11**, release 03-Aug-2026, 248 MB. `./scripts/fetch-rxnorm.sh`, which reads `UMLS_API_KEY` from `.env` and never exposes it to `ps`. Only 2 of the 12 RRF files are needed; `RXNSAT.RRF` (533 MB) is never opened
- [x] **A3.** Prune to SQLite: ingredients (IN/PIN), brand names (BN), and the relationships between them. Record final file size — **done 2026-08-11. 5.1 MB**, against a 25 MB target agreed for APK bundling. `python3 scripts/build-rxnorm-db.py`
  - 23,445 concepts — IN 14,663, PIN 3,659, BN 5,123 — and 20,680 edges
  - **The size ceiling is not a constraint.** There is room for A7–A8's plain-language text without approaching it
  - **Two RRF traps, both of which produced silent wrong answers.** `SUPPRESS` is empty on every row of `RXNREL`, not `N` as in `RXNCONSO` — applying the `RXNCONSO` rule kept 0 edges and still reported a plausible database. And RRF rows read **right to left**: `rxcui2 <RELA> rxcui1`, so querying the bridge the intuitive way returns zero rows and looks like missing data. See `docs/a3-a4-findings.md`
- [x] **A4.** ~~Add FTS index for approximate matching against noisy OCR output~~ — **done, but the premise was wrong.** FTS5's trigram tokenizer gives **substring** search, not fuzzy: `MATCH 'smethicone'` returns **no rows**, so it cannot find `simethicone` — the exact deletion B2a measured
  - **What works: trigram set overlap scored across all IN/PIN rows. 19 ms for 18,322 concepts.** No index needed — A3 pruned hard enough that brute force is viable. Laptop number; measure on the S8
  - The FTS index is kept for a different job: substring and prefix search when the user types a correction on B3d
  - **Salt abbreviations need a lookup, not fuzzy matching.** `HBr` and `Hydrobromide` share no trigrams. A three-entry map (`hcl`, `hbr`, and `hci` for the `l`→`I` misread) turns both failing cases into exact 1.00 matches
  - **⚠️ The margins are thin, and both runners-up are real substances.** `Smethicone` scores simethicone 0.64 against dimethicone 0.53; `Dextromethorphan HBr` scores dextromethorphan 0.81 against deudextromethorphan 0.71. **Direct evidence for B3d** — a fuzzy match must never be accepted silently
- [ ] **A5.** Extract the Top 100 OTC actives list — **decide the selection basis first** and write it down *(blocks A6–A9)*
- [ ] **A6.** **Curate the brand allowlist by hand.** ~150–250 recognizable US household brands, ranked. Everything else suppressed
  - **A6's own test has been run for real (2026-08-11). Diphenhydramine returns 54 brands.** The recognisable ones are there — Benadryl, Aleve PM, Excedrin PM, Doans PM, Compoz — alongside `Acetadryl`, `Banophen Cream`, `Dermamycin`, `Diphenhist`, and **`Calagel Reformulated Jun 2019`**, which is a registry artefact rather than a brand any person would recognise
  - **Partly addressed 2026-08-11 by `scripts/tag-otc-brands.py`.** RxNorm supplies candidates, openFDA's NDC directory confirms them as OTC — ingredient-scoped, fuzzy at ≥0.60. 408 of 5,123 brands confirmed. **A6's own acceptance test now passes:** diphenhydramine returns Benadryl, ZzzQuil, Tylenol PM and 13 others, not 54. Auvelity, Nuedexta, Bromfed DM, Apadaz and Bupap are all excluded
    - **It over-suppresses on purpose.** DayQuil Cough and Zicam Cough are genuinely OTC and get dropped; a thinner answer beats a wrong one here. **This is a starting point for A6, not a replacement** — hand curation adds the false negatives back and ranks what remains
    - Confirmation is per brand, not per (brand, ingredient) pair. That imprecision is what took simethicone from 0 to 5 confirmed brands, via co-ingredients. Safe in the direction that matters: a purely-Rx brand is never confirmed anywhere
  - **⚠️ A6 is also a D4 scope boundary, discovered 2026-08-11.** Dextromethorphan's brands include **Auvelity** (Rx antidepressant), **Nuedexta** (Rx) and **Bromfed DM** (Rx cough syrup). D4 scopes v1 to **OTC only**, and RxNorm's `BN` set spans both with no flag in the pruned data. Showing Auvelity to someone scanning children's cough syrup is not noise — it actively misinforms, and this audience is the least able to discount it. **The allowlist is what keeps v1 inside D4**
  - **A7 may give a programmatic signal instead of pure hand-curation:** DailyMed SPL records carry a marketing category (OTC monograph vs NDA/ANDA), so brands could be tagged rather than recognised. Worth checking when A7 starts — 79 brands for acetaminophen is more than anyone should triage from memory
  - **So A6 is an editorial job, not a size one.** At 5.1 MB the database is already comfortable; the allowlist exists to suppress noise like that line. RxNorm cannot do it for you
  - Consequently A6 is **not** on the critical path for the database, and A5 does not block it
  - Test: does diphenhydramine return "Benadryl, ZzzQuil, Tylenol PM" and *not* forty store brands?
- [ ] **A7.** Pull DailyMed SPL text for the Top 100
- [ ] **A8.** Build-time generation pass: SPL text → plain language, per D7
- [ ] **A9.** **Read all 100 personally.** Check tone against handoff §4 — plain, not childish
- [x] **A10.** Add NLM attribution string to the source line — **done 2026-08-11.** Required verbatim by NLM's RxNorm Terms of Service, and now rendered in the app
  - Stored as a row in the database's `meta` table, not as an app constant, so the text travels with the data it describes
  - **A second obligation came with it, which was not in the plan:** a redistributor must either keep the data current *or* clearly disclose that the bundled copy is not the most current from NLM. A SQLite frozen in an APK is stale by definition, so the app shows **"RxNorm data as of 2026-08-03"**, read from `meta` rather than hardcoded
  - The release date is derived from the downloaded zip's filename by `build-rxnorm-db.py`, so it cannot drift from the data

---

## Track B — App

- [x] **B0.** Repo scaffolding: README (including §5 non-goals stated explicitly), `.gitignore` (`node_modules/`, `.expo/`, `ios/`, `android/`, `*.jks`, `.env`), labels, milestones
  - Labels and milestones are live — `./setup-repo.sh` run 2026-08-07. 8 labels (`agent`, `human`, 3 track, `decision`, `blocked`, `guardrail`), 5 milestones (`v1`, `v1.5`, `v2`, `v3`, `v4`). Script is idempotent; re-run after editing it
- [ ] **B1.** Expo dev build installs on a real Android device via EAS internal distribution. Camera icon present, disabled. *Proves the whole distribution chain before any feature exists* — **4 of 6 as of 2026-08-09**, see `docs/android-emulator-setup.md` §9
  - ✅ `minSdk` is **24**, read from the built APK. The S8 is a viable target
  - ✅ Installs and launches on the **Galaxy S23** from the EAS link. Wordmark, disabled camera control, "Not available yet" all render
  - ✅ Runs on both emulators, API 36 and API 28. **Identical rendering on Android 9 and Android 16** — no layout break at the floor. Installed by `adb install`, so this proves the app runs, not that distribution works
  - ⛔ **S8 blocked.** The device was on a minor's account, which cannot install unknown apps — the toggle is absent, not merely off. Factory reset planned
  - ⛔ The S8 install write-up, which is the actual deliverable
  - **Build the `preview` profile, not `development`.** A `development` build has no JS inside it and opens the dev-client launcher unless Metro is running on the Mac. No tester will run Metro. `preview` runs standalone
  - **Done (2026-08-08):** Android SDK installed; two AVDs built and booted (API 36 → Android 16, API 28 → Android 9, both `arm64-v8a`); app scaffolded on Expo SDK 57.0.11 / RN 0.86.2 as `com.kacooper.reko`; `minSdk` confirmed at 24; the disabled-camera screen written and typechecking clean
  - **Left:** `eas login` → `eas init --id` → cloud build → install on the **S8 first**, then the S23 → write up what the S8 install actually took. Steps and acceptance in `docs/android-emulator-setup.md` §6–§9
  - The write-up is the deliverable, not the build
- [x] **B2.** Camera capture → OCR → dump raw text on screen, unstyled — **done 2026-08-11.** B2a, B2b and B2c all complete. Full results: `docs/demo-findings.md`
  - [x] **B2a. Prove the OCR on a still image first — no camera.** ✅ **Done 2026-08-11. `expo-ocr-kit` 0.1.4 works on SDK 57.** All four C4 frames read, no crashes, `localUri` accepted as-is. Full results and the error taxonomy: **`docs/b2a-ocr-findings.md`**
    - Every ingredient name and strength came through on three of four frames. `minSdk` stayed at 24, so the S8 is still safe
    - **The difficulty ordering was wrong.** Mylicon — small print on a narrow cylinder — was the worst frame, and it corrupted both the heading and the drug name. NyQuil's inverted white-on-blue read cleanly. **Print size and curvature predict failure; contrast polarity does not.** C4 selection should follow that
    - Emulator only. Nothing measured on hardware, and nothing on API 28
  - [x] **B2b. Capture with `expo-camera`** — **done.** Permission → viewfinder → capture → OCR → result, verified on the API 36 emulator. `takePictureAsync()` returns a file URI, which is exactly what `recognizeText()` takes, so the chain proven on the C4 fixtures is reused unchanged. `CAMERA` lands in the manifest via the config plugin with no `app.json` entry, and `minSdk` stayed at **24**
    - **No real label has been scanned.** The emulator renders a synthetic scene, so this verifies the plumbing, not recognition. That test needs the S23 and is the one thing the demo rests on
  - See the D1 note below for why not `react-native-vision-camera`
  - [x] **B2c. Multiple stills, merged — proven 2026-08-11** now that Mucinex has two frames. Frame 2's OCR is far worse than the photograph suggested: `Dextromethorphan` arrived as **`Bnebhorphan`** and `Guaifenesin` as **`azsin`**. The union still yields exactly 2 actives, because two mechanisms compose: the 0.30 score floor drops the junk before it is shown, and **deduplication is on the resolved RXCUI rather than the extracted string**, so `Bnebhorphan HBr` collapses into frame 1's dextromethorphan instead of becoming a third ingredient
  - **B2c. Multiple stills, merged.** The user turns the bottle and takes two or three photos; OCR each; take the union of the candidates. This is how the curved-bottle wrap gets solved without live frame processing, and B3d confirms the result anyway
  - Re-run the §5a `minSdk` check after any native module lands. 28 is the S8's ceiling
  - Iterate with `npx expo run:android --device` over USB, ~1 min per rebuild. EAS is 10–20 min and would waste the day. Native changes still need an EAS build before they reach a phone by link
- [x] **B3a.** Locate the "Active ingredient(s)" section boundary within the OCR output — **done 2026-08-11, `src/parse/section.ts`. 4/4 C4 products.** Full results: `docs/b3-findings.md`
  - **Two structural findings, both of which failed silently.** *A block is not a line* — 11 of TopCare's 30 blocks contain embedded newlines, and the actives block holds the heading plus all three ingredients in one string. Joining block text and collapsing whitespace made an anchored regex return **one** active from a three-active product, with no error. And *a row's cells must stay separate*: because photos are rotated 90°, x-order is not reading order, so Mylicon's row concatenated as `"..Antigs Smethicone 20 mg."` with the Purpose cell first. The parser now splits blocks into lines before grouping, and reads row **cells** independently
  - All four products were found via the heading; the shape fallback was not needed. Mylicon's corrupted `Active ingreaiiat` still scored 0.50 against the 0.45 floor
  - **Do not match the heading as a string.** B2a measured `Active ingredient` arriving as `Active ingreaiiat`. Exact match fails, and most loose regexes fail too. Use fuzzy matching on the heading, or find the ingredient lines by *shape* — `<name> <number> <unit>` followed by dotted leaders — and infer the section from them
  - **Use the bounding boxes, not the flat `text` field.** On the two-column TopCare panel the Purpose values land far from their ingredients in the concatenated string. Grouping blocks by `y` reconstructs rows. Every block carries `{x, y, width, height}`
  - Curved labels return few blocks — Mucinex 6, Mylicon 4, against TopCare's 30 — so there is least spatial structure exactly where it is needed most
- [x] **B3b.** Extract candidate ingredient strings + strengths from that section — **done 2026-08-11, `src/parse/actives.ts`.** Every active, strength and basis correct on all four products
  - `cutAtLeaders` had to strip **leading** junk before cutting: Mylicon's Purpose cell begins `..Antigs`, so cutting at the first dot run returned an empty string and dropped the ingredient
  - The `basis` clause needed the same unit canonicalisation as strengths — `(in each 0.3 m!)` → `in each 0.3 mL`. Shared in `src/parse/units.ts`
  - **Cut each line at the run of leader dots.** B2a showed the Purpose column bleeding in: `Dextromethorphan HBr 15 mg....ough suppressant`. The leaders are how the Drug Facts format separates the columns, so they are a reliable cut point
  - **Canonicalise the unit token; do not read it literally.** `mL` came back as `m`, `m!`, and `ml` across three frames. `in each 5 m` is as useless as a bare `5 mg`
  - **Never lift a number from a nearby line.** A bullet glyph merged with a digit and turned `■ 3 or more` into `13 or more`. The same merge beside a strength would turn 5 mg into 15 mg. Every number shown to a user must trace to a matched ingredient
- [x] **B3c.** Fuzzy-match candidates against RxNorm, handling OCR noise — **done 2026-08-11, `src/match/rxnorm.ts`. The merge point is crossed; both tracks met.** 4/4 products matched to the right concept
  - **The confidence rule is doing real work.** All four matched, yet most are flagged *not confident*: a 1.00 score for `dextromethorphan hydrobromide` sits only 0.09 above `deudextromethorphan hydrobromide`, a real and different drug. The rule needs a 0.75 floor **and** a 0.15 margin over the runner-up. **This is the evidence B3d is load-bearing rather than courteous**
  - On-device parity confirmed on the API 36 emulator: identical parses, scores and flags. Match costs **144–164 ms**; the trigram index builds in **509 ms** at startup. Not yet measured on hardware
  - `scripts/check-normalize-parity.ts` proves the TS and Python normalizers agree on **all 23,445** concept names, so the one-function-three-places rule is enforced rather than asserted
  - **B2a gave the real error distribution, so A4's index has a spec now.** Two classes matter: an interior character *deletion* (`Simethicone` → `Smethicone`) and the `l`↔`I` substitution (`HCl` → `HCI`). Trigram or edit-distance matching survives the deletion; exact lookup does not. This is direct evidence A4's FTS design is right
  - **Handle the salt suffixes by lookup, not fuzzy matching.** The vocabulary is short and closed — `HCl`, `HBr`, maleate, citrate, sodium, sulfate. Lowercasing does **not** help: `hci` and `hcl` still differ
- [ ] **B3d.** **Confirmation screen** — show what was found, let the user correct it. Never trust the scan silently (§3)
  - **Partly done 2026-08-11.** The demo asks "Is this what the label says?" before showing anything, and says plainly *"We are not certain about this one"* when the match is low-confidence. "No" retakes the photo
  - **Still missing: correction.** There is no per-ingredient editing, which is what the task actually asks for. Rejecting and rescanning is not the same thing
- [x] **B4.** Ship the SQLite as a bundled asset; wire lookup → brand bridge — **done 2026-08-11.** Full results: `docs/b4-findings.md`
  - `assets/rxnorm.sqlite` committed, loaded via `SQLiteProvider`'s `assetSource`; `metro.config.js` adds `sqlite` to `assetExts`, without which it fails at runtime rather than at build time
  - **8 of 8 matched ingredients resolve to brands.** `PIN → IN` works, so a label printing `Dextromethorphan HBr` surfaces **dextromethorphan** and its 17 brands
  - **A PIN has no brands, and that nearly shipped silently.** `brandsFor()` queried only `has_tradename`, which returns **0** for a PIN — and labels print the salt, so three of four C4 products match a PIN. There was also no PIN→IN path in the pruned data. Fixed by keeping `form_of`/`has_form` in A3 (18,241 edges; database 5.1 → **5.5 MB**), and by unioning three brand paths. SQL now lives once in `src/db/queries.ts` — edge direction has caused three silent-zero bugs here already
  - `npm run score` now fails if any matched ingredient returns zero brands
  - **⚠️ Database versioning is unhandled.** `SQLiteProvider` copies the asset only when the database is absent, so an app update ships new code against old data. Needs a version check against `meta` *Previously labelled the merge point — it is not. The tracks meet at B3c; B4 is only where the database ships inside the app.* Brand bridge quality depends on A6
- [ ] **B5.** Large type + TTS + source attribution line. **A stage, not polish** — §4 calls these core features

---

## Track C — Validation

- [ ] **C1.** **The paper test.** Printed card for Tylenol PM, Benadryl connection spelled out. Watch the reaction (§9). *No app required — do this before spending $99 on Apple*
- [ ] **C2.** Medicine-cabinet survey — read every Drug Facts panel, OTC included
- [ ] **C3.** Confirm duplicates actually exist in a real household
- [ ] **C4.** **Golden test set** — freeze ~20 **products**, each with **one or more frames**, plus hand-written correct answers. Include curved bottles, glare, worn print, two-column panels
  - **⚠️ Do this BEFORE B3a, not after.** C4 is not a test that follows the parser; it is the instrument you build the parser with. Without known answers you cannot tell whether a change to B3a–c helped or hurt
  - Shoot on the **S8** (C5). It is the worst realistic capture; the S23 flatters the parser
  - It also removes the camera from the loop — a file-based input path lets B3a–c run with no device at all. See `docs/android-emulator-setup.md` §10
  - **The unit is the frame set, not the photo.** On a cylinder the ingredients line can wrap past what one frame holds, so for some products the answer needs two frames together
  - **Include several small bottles where no single frame holds the whole ingredients line** — eye drops, children's liquids, 100-count tablets. If that case is absent from the set, you will never measure it
  - **Shoot video, then freeze frames.** One slow rotation captures every angle in seconds. But a fixture must be deterministic: video forces every test run to re-choose frames, and then a parser change cannot be told apart from a framing change. Extract the frames, commit those, keep the video beside them as provenance
  - Test the **UPC barcode** on the same bottles while you are there. See open questions
- [x] **C5.** Confirm what phones the 3 test devices actually are. If target users are on iPhone, D3 needs revisiting sooner
  - **Answered 2026-08-08: Galaxy S8, Galaxy S23, iPhone 17.**
  - **D3 holds.** The iPhone cannot run v1 and EAS iOS distribution needs the $99 program. But C1 is a printed card — no app, no phone — so that user joins the most valuable test at full strength. Decide iOS after C1. The `v1.5` milestone already exists for it
  - **The S8 is the constraint and the priority.** Its final OS is Android 9 (API 28), unsupported since ~2021. That is the v1 floor. Reko serves older adults, and older adults keep old phones — the S8 is what the real user holds, so it leads B1 and B2, not the S23
  - **C4 consequence:** the golden set must include photos shot on the S8. It is the worst realistic capture; the S23 camera will flatter the parser
  - **2026-08-09 — the S8 could not install anything.** It was logged into a minor's account, which is barred from installing unknown apps; the toggle is absent rather than off. Factory reset planned. Real test devices carry real account baggage, and a tester whose phone is managed by a family member cannot sideload at all
  - The S23 installed fine once its warnings were dismissed. **Owner's call: those warnings are the ordinary cost of installing from the internet rather than a store, and are not a product concern.** The S8's block was different in kind — a refusal, not a warning
  - **~~Open risk~~ — RESOLVED 2026-08-08: `minSdk` is 24, so the S8 is a viable target** with four levels of margin. Confirmed against Expo SDK 57.0.11 / RN 0.86.2 from two independent sources (the `expo-root-project` plugin default and React Native's `libs.versions.toml`). D6 stands as written. Re-check when `expo-camera` and `expo-ocr-kit` land at B2 — both add native code, and a camera or ML library is exactly the kind of dependency that raises a floor

---

## Deferred — do not start

- Apple Developer Program enrollment ($99/yr) — revisit after C1
- Rx label grammar (v4) — Scrivo held in reserve as a possible name at that point
- Interaction checking — permanently out (§5)
- Monetization — revisit after v2 is in real hands (§8)
- AGS Beers Criteria licensing email — only if v2 makes it load-bearing

---

## Open questions

- Selection basis for the Top 100 actives (blocks A5)
- **Google Play internal testing track — $25 once. Worth costing, not yet decided.** Testers install from the Play Store, so no unknown-sources toggle and no Play Protect prompt. The case for it is not the warnings — those are dismissible, and the owner has judged them a non-issue (C5). The case is the **restricted-device problem**: the S8 could not install at all on a minor's account, and a tester on a family-managed phone hits the same wall. Sideloading also cannot reach them. Revisit after C1, alongside the deferred $99 Apple decision — a store path costs a quarter of it and removes a hard block rather than a nuisance
- D10: separate `.dev` bundle ID for preview builds?
- ~~Does `expo-ocr-kit` hold up under real use, or does this become a custom Expo Module?~~ **Answered 2026-08-11 — it holds up.** All four C4 frames read on SDK 57 with no crashes, and every ingredient line came through on three of four. No custom Expo Module needed. See `docs/b2a-ocr-findings.md`. **Still unmeasured: hardware, API 28, and accuracy against a scoring harness rather than eyeballs** — reopen only on a measured failure
- **The UPC came back as text, not as a scanned code.** OCR read NyQuil's barcode digits as `227LO,0062`, which is useless. The barcode path needs a real barcode reader; OCR is not a substitute. That is a separate dependency to cost before the barcode question can be answered
- **UPC barcode → NDC lookup as an OCR alternative — still untested (§10). Curved bottles are the strongest argument for it.** A barcode is small, sits on a flat-enough patch, and is designed to be read by a machine, so it sidesteps the wrap problem entirely for any product carrying one. Test it on the same bottles during B2 and C4. **If a barcode resolves a product that OCR could not read, that is a significant finding** — and it would reopen how much OCR accuracy v1 actually needs

---

## Competitive notes (from naming research)

Worth keeping — these surfaced while checking name collisions, not from a deliberate competitive scan.

- **Smart Pill ID** (165K downloads, 3.4★) — visual pill identification by photo. Different mechanism, but a useful cautionary comp: marketing promises safety/interaction checking, reviews report frequent misidentification. Carries a "verify with a healthcare professional" disclaimer. Reko should not need that disclaimer if §5 discipline holds.
- **Yuka** (80M users) — barcode → open database → health score, food and cosmetics only. Not a competitor: different mechanism (barcode, not label OCR), different output (score, not translation), and a drug score would hit the §5 device-definition wall.
- **Medicine Cabinet Dispensary** (314 ratings, 4.9★, Lifestyle) — unexamined. Worth a look at what it actually does.
- Nobody found doing composition-first, label-read, brand-recognition-bridge, factual-only. The §1 gap still stands.
