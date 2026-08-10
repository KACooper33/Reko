# Reko

Point your camera at a medicine label. Find out what's actually in it, in plain language, and which familiar brands contain the same thing.

**Status:** pre-v1. Nothing is built yet. See [`TASKS.md`](./TASKS.md) for current state and locked decisions.

---

## The problem

Brand names are engineered for recall, not comprehension. The same active ingredient ships under dozens of proprietary names, so a person can hold two boxes that share an ingredient and have no way to know it. Diphenhydramine is Benadryl, and it's also in Tylenol PM, and in ZzzQuil, and in a hundred store brands — and nothing on the front of any box says so.

Reko reads the label and answers one question: **what is this, really, and what else is it?**

---

## What Reko does

- Reads the printed label with on-device OCR
- Shows what it found and **asks the user to confirm it** before proceeding
- Normalizes the active ingredients against RxNorm
- Bridges back to recognizable household brand names
- Explains each ingredient in plain language, in large type, read aloud on request
- Cites its sources

---

## What Reko does NOT do

**These are hard product boundaries, not a v1 backlog.** They exist to keep Reko on the factual-composition side of the line and out of clinical judgment. Do not add these features. If a future change starts to look like one of them, stop and revisit the handoff before writing code.

- ❌ **No interaction checking.** Reko will not tell you whether two things are safe to take together.
- ❌ **No dosing advice.** Reko will not tell you how much to take, when, or whether you've had too much.
- ❌ **No safety verdict, score, or rating.** No "this is bad for you." No 0–100. No red/yellow/green.
- ❌ **No diagnosis, no symptom matching, no treatment recommendation.**
- ❌ **No "should I take this?"** Reko answers *what is this*, never *what should you do*.

Reko states facts about composition. A pharmacist, a doctor, or the label itself handles everything else.

### Why this line is drawn here

Two reasons, and both matter:

1. **Regulatory.** Software that analyzes a patient's situation and recommends a course of action starts to look like a medical device. Software that tells you what's printed on a box does not. Staying factual is what keeps Reko shippable by one person without a regulatory program.
2. **Honesty about failure modes.** Existing apps in this space promise safety checking and then misidentify medications — and end up carrying "verify all results with a healthcare professional" disclaimers that concede the promise was too big. Reko should not need that disclaimer, because it should not have made that promise.

---

## Non-negotiables

- **No LLM at runtime.** Plain-language content is generated at build time and human-reviewed before it ships. Every string a user sees has been read by a person. The model never improvises in front of a user.
- **Local-first.** Lookup runs against a bundled database. No account, no cloud sync, no health data leaving the device.
- **Never trust the scan silently.** OCR output is always shown for confirmation before it's used.
- **Always cite the source.** Every claim traces back to RxNorm or DailyMed.
- **Plain, not childish.** Write the way a good pharmacist talks to an adult.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Expo (dev build — not Expo Go) |
| OCR | `expo-ocr-kit` — Apple Vision on iOS, ML Kit on Android |
| Camera | expo-camera — still capture, not live frame processing. See the D1 amendment in `TASKS.md` |
| Local DB | expo-sqlite, prepopulated asset |
| Speech | expo-speech |
| Build & distribution | EAS Build, internal distribution |

Bundle ID / package: `com.kacooper.reko`

v1 targets **Android only**. iOS is deferred pending validation — see D3 in `TASKS.md`.

---

## Data sources

| Source | Use | Notes |
|---|---|---|
| **RxNorm** (NLM) | Ingredient normalization, brand bridging | Requires a free UMLS Metathesaurus License |
| **DailyMed** (FDA/NLM) | Source text for plain-language rewrites | Public SPL labeling |
| **MedlinePlus** | Link-out only | AHFS content is licensed and **may not be ingested** — link to it, never copy it |

> This product uses publicly available data courtesy of the U.S. National Library of Medicine (NLM), National Institutes of Health, Department of Health and Human Services. NLM is not responsible for the product and does not endorse or recommend this or any other product.

---

## Repo layout

```
App.tsx         The B1 screen — wordmark, disabled camera control, nothing else
index.ts        Entry point; registers App.tsx
app.json        Expo config. name/slug, and the android.package from D2
package.json    Expo SDK 57, React Native 0.86
tsconfig.json   TypeScript config from the Expo template
assets/         Placeholder icons from the template
TASKS.md        Current work, locked decisions (D1–D10), open questions
README.md       This file
setup-repo.sh   One-time GitHub labels + milestones setup (requires gh CLI)
.gitignore      Secrets first, then deps, Expo, native builds, and Track A data
docs/           Runbooks — Android emulator setup (Apple Silicon) for B1
AGENTS.md       Template note: read the versioned Expo docs before writing code
CLAUDE.md       One line, imports AGENTS.md
```

`android/` is generated by `expo prebuild` and is **not** committed — regenerate it rather
than editing it. Same for `node_modules/`.

---

## Development

Scaffolded, but **not yet installed on a phone**. The current milestone is **B1**: an Expo dev build that installs on a real Android device via EAS internal distribution, with a disabled camera icon and nothing else. That proves the whole distribution chain before any feature exists.

What exists: the app builds and typechecks, and the Android SDK, two emulators (API 36 and API 28), and the screen are all in place. `minSdk` is 24, so the oldest test device — a Galaxy S8 on Android 9 — is a viable target.

What is left for B1: `eas login`, a cloud build, and installing on the two Android phones. The deliverable is not the build; it is a written account of what the install took on the **S8**. See [`docs/android-emulator-setup.md`](./docs/android-emulator-setup.md) — §6 onward.

```bash
npx expo start --dev-client
```

---

## License

TBD.
