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
  - **Done (2026-08-08):** Android SDK installed; two AVDs built and booted (API 36 → Android 16, API 28 → Android 9, both `arm64-v8a`); app scaffolded on Expo SDK 57.0.11 / RN 0.86.2 as `com.kacooper.reko`; `minSdk` confirmed at 24; the disabled-camera screen written and typechecking clean
  - **Left:** `eas login` → `eas init --id` → cloud build → install on the **S8 first**, then the S23 → write up what the S8 install actually took. Steps and acceptance in `docs/android-emulator-setup.md` §6–§9
  - The write-up is the deliverable, not the build
- [ ] **B2.** Camera capture → OCR → dump raw text on screen, unstyled
- [ ] **B3a.** Locate the "Active ingredient(s)" section boundary within the OCR output
- [ ] **B3b.** Extract candidate ingredient strings + strengths from that section
- [ ] **B3c.** Fuzzy-match candidates against RxNorm, handling OCR noise — **⚠️ this is the real merge point with Track A.** Blocked by A3 (the SQLite) and A4 (the FTS index). Track B stops here until Track A delivers
- [ ] **B3d.** **Confirmation screen** — show what was found, let the user correct it. Never trust the scan silently (§3)
- [ ] **B4.** Ship the SQLite as a bundled asset; wire lookup → brand bridge. *Previously labelled the merge point — it is not. The tracks meet at B3c; B4 is only where the database ships inside the app.* Brand bridge quality depends on A6
- [ ] **B5.** Large type + TTS + source attribution line. **A stage, not polish** — §4 calls these core features

---

## Track C — Validation

- [ ] **C1.** **The paper test.** Printed card for Tylenol PM, Benadryl connection spelled out. Watch the reaction (§9). *No app required — do this before spending $99 on Apple*
- [ ] **C2.** Medicine-cabinet survey — read every Drug Facts panel, OTC included
- [ ] **C3.** Confirm duplicates actually exist in a real household
- [ ] **C4.** **Golden test set** — freeze ~20 real label photos + hand-written correct answers. Include curved bottles, glare, worn print, two-column panels
  - **⚠️ Do this BEFORE B3a, not after.** C4 is not a test that follows the parser; it is the instrument you build the parser with. Without known answers you cannot tell whether a change to B3a–c helped or hurt
  - Shoot the photos on the **S8** (C5). It is the worst realistic capture; the S23 flatters the parser
  - It also removes the camera from the loop — a file-based input path lets B3a–c run with no device at all. See `docs/android-emulator-setup.md` §10
- [x] **C5.** Confirm what phones the 3 test devices actually are. If target users are on iPhone, D3 needs revisiting sooner
  - **Answered 2026-08-08: Galaxy S8, Galaxy S23, iPhone 17.**
  - **D3 holds.** The iPhone cannot run v1 and EAS iOS distribution needs the $99 program. But C1 is a printed card — no app, no phone — so that user joins the most valuable test at full strength. Decide iOS after C1. The `v1.5` milestone already exists for it
  - **The S8 is the constraint and the priority.** Its final OS is Android 9 (API 28), unsupported since ~2021. That is the v1 floor. Reko serves older adults, and older adults keep old phones — the S8 is what the real user holds, so it leads B1 and B2, not the S23
  - **C4 consequence:** the golden set must include photos shot on the S8. It is the worst realistic capture; the S23 camera will flatter the parser
  - **~~Open risk~~ — RESOLVED 2026-08-08: `minSdk` is 24, so the S8 is a viable target** with four levels of margin. Confirmed against Expo SDK 57.0.11 / RN 0.86.2 from two independent sources (the `expo-root-project` plugin default and React Native's `libs.versions.toml`). D6 stands as written. Re-check when `react-native-vision-camera` lands at B2 — it inherits the floor rather than setting one, so a camera library is exactly what could raise it

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
