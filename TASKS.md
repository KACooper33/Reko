# Reko — v1 Tasks

Companion to `MedLabel_v1_Handoff.md`. The handoff carries *why*; this carries *what's next*.
Last updated: 2026-08-07

---

## Decisions locked

| # | Decision | Value |
|---|---|---|
| D1 | Stack | Expo dev build + `expo-ocr-kit` (Vision on iOS / ML Kit on Android), EAS Build |
| D2 | Bundle ID / package | `com.kacooper.reko` |
| D3 | Platform for v1 testing | **Android only — holds.** Apple Developer Program deferred until after paper test. See C5: one of the three test devices is an iPhone 17, so this is now a known cost, not an assumption |
| D4 | v1 scope | **OTC only.** v2 = OTC + bundling, v3 = expanded OTC, v4 = Rx |
| D5 | Ingredient scope for v1 | **Top 100 actives.** Expand in v3 |
| D6 | Test devices | 3 identified — Galaxy S8, Galaxy S23, iPhone 17. **Two can run v1**, per D3. The S8 sets the floor at API 28 and is the primary B1 target |
| D7 | LLM placement | **Build time only.** No model call at runtime; every shipped string human-reviewed |
| D8 | Plain-language source | **DailyMed SPL.** MedlinePlus is link-out only — AHFS content may not be ingested |
| D9 | Name | **Reko** |
| D10 | Dev/preview bundle ID | TBD — decide whether `com.kacooper.reko.dev` gets its own profile |

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

- [ ] **A1.** Create UMLS account, accept Metathesaurus license, get UTS API key ← *most time-sensitive item on this list; approval is not instant*
- [ ] **A2.** Download RxNorm full monthly release (RRF)
- [ ] **A3.** Prune to SQLite: ingredients (IN/PIN), brand names (BN), and the relationships between them. Record final file size
- [ ] **A4.** Add FTS index for approximate matching against noisy OCR output
- [ ] **A5.** Extract the Top 100 OTC actives list — **decide the selection basis first** and write it down *(blocks A6–A9)*
- [ ] **A6.** **Curate the brand allowlist by hand.** ~150–250 recognizable US household brands, ranked. Everything else suppressed
  - Test: does diphenhydramine return "Benadryl, ZzzQuil, Tylenol PM" and *not* forty store brands?
- [ ] **A7.** Pull DailyMed SPL text for the Top 100
- [ ] **A8.** Build-time generation pass: SPL text → plain language, per D7
- [ ] **A9.** **Read all 100 personally.** Check tone against handoff §4 — plain, not childish
- [ ] **A10.** Add NLM attribution string to the source line

---

## Track B — App

- [x] **B0.** Repo scaffolding: README (including §5 non-goals stated explicitly), `.gitignore` (`node_modules/`, `.expo/`, `ios/`, `android/`, `*.jks`, `.env`), labels, milestones
  - Labels and milestones are live — `./setup-repo.sh` run 2026-08-07. 8 labels (`agent`, `human`, 3 track, `decision`, `blocked`, `guardrail`), 5 milestones (`v1`, `v1.5`, `v2`, `v3`, `v4`). Script is idempotent; re-run after editing it
- [ ] **B1.** Expo dev build installs on a real Android device via EAS internal distribution. Camera icon present, disabled. *Proves the whole distribution chain before any feature exists*
- [ ] **B2.** Camera capture → OCR → dump raw text on screen, unstyled
- [ ] **B3a.** Locate the "Active ingredient(s)" section boundary within the OCR output
- [ ] **B3b.** Extract candidate ingredient strings + strengths from that section
- [ ] **B3c.** Fuzzy-match candidates against RxNorm, handling OCR noise
- [ ] **B3d.** **Confirmation screen** — show what was found, let the user correct it. Never trust the scan silently (§3)
- [ ] **B4.** Ship the SQLite as a bundled asset; wire lookup → brand bridge *(merge point with Track A)*
- [ ] **B5.** Large type + TTS + source attribution line. **A stage, not polish** — §4 calls these core features

---

## Track C — Validation

- [ ] **C1.** **The paper test.** Printed card for Tylenol PM, Benadryl connection spelled out. Watch the reaction (§9). *No app required — do this before spending $99 on Apple*
- [ ] **C2.** Medicine-cabinet survey — read every Drug Facts panel, OTC included
- [ ] **C3.** Confirm duplicates actually exist in a real household
- [ ] **C4.** **Golden test set** — freeze ~20 real label photos + hand-written correct answers. Include curved bottles, glare, worn print, two-column panels
- [x] **C5.** Confirm what phones the 3 test devices actually are. If target users are on iPhone, D3 needs revisiting sooner
  - **Answered 2026-08-08: Galaxy S8, Galaxy S23, iPhone 17.**
  - **D3 holds.** The iPhone cannot run v1 and EAS iOS distribution needs the $99 program. But C1 is a printed card — no app, no phone — so that user joins the most valuable test at full strength. Decide iOS after C1. The `v1.5` milestone already exists for it
  - **The S8 is the constraint and the priority.** Its final OS is Android 9 (API 28), unsupported since ~2021. That is the v1 floor. Reko serves older adults, and older adults keep old phones — the S8 is what the real user holds, so it leads B1 and B2, not the S23
  - **C4 consequence:** the golden set must include photos shot on the S8. It is the worst realistic capture; the S23 camera will flatter the parser
  - **Open risk:** Expo SDK 57's `minSdkVersion` is set by a Gradle plugin and could not be read from the published package. If the floor is above API 28, the S8 is out and D6 changes. Settle it right after the scaffold — see `docs/android-emulator-setup.md` §5

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
- D10: separate `.dev` bundle ID for preview builds?
- Does `expo-ocr-kit` hold up under real use, or does this become a custom Expo Module? *(Decide after B2 + C4 give a measured number)*
- UPC barcode → NDC lookup as an OCR alternative — still untested (§10)

---

## Competitive notes (from naming research)

Worth keeping — these surfaced while checking name collisions, not from a deliberate competitive scan.

- **Smart Pill ID** (165K downloads, 3.4★) — visual pill identification by photo. Different mechanism, but a useful cautionary comp: marketing promises safety/interaction checking, reviews report frequent misidentification. Carries a "verify with a healthcare professional" disclaimer. Reko should not need that disclaimer if §5 discipline holds.
- **Yuka** (80M users) — barcode → open database → health score, food and cosmetics only. Not a competitor: different mechanism (barcode, not label OCR), different output (score, not translation), and a drug score would hit the §5 device-definition wall.
- **Medicine Cabinet Dispensary** (314 ratings, 4.9★, Lifestyle) — unexamined. Worth a look at what it actually does.
- Nobody found doing composition-first, label-read, brand-recognition-bridge, factual-only. The §1 gap still stands.
