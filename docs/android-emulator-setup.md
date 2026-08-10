# Android emulator setup — Apple Silicon (M2)

Runbook for getting a Reko dev build onto an Android emulator on an M2 MacBook.
This covers the emulator half of **B1**. The real-device half is the same APK — see §7.

> ### ⚠️ Status: not yet walked end to end
>
> **§1–§4 are done and verified on the real machine** (2026-08-08). The SDK is installed
> via the Homebrew path, both AVDs exist, and **both images boot on the M2** — API 28
> reports Android 9, API 36 reports Android 16, both `arm64-v8a`. Cold boot for API 36 was
> about 90 seconds, headless.
>
> **Verified offline:** the §5 `rsync` command, tested against a simulated repo with its
> own `.git`; every fenced shell block, via `bash -n`; all package versions; and the
> `arm64-v8a` image availability in §2, against Google's repository manifest.
>
> **§5 and §5a are also done** (2026-08-08). The app exists: Expo SDK 57.0.11, React
> Native 0.86.2, package `com.kacooper.reko`. **`minSdk` is 24, so the Galaxy S8 is a
> viable target** — the gate passed. `npx tsc --noEmit` is clean.
>
> **§6 and §7 are done** (2026-08-09). The project is linked as `@kacooper/reko`, `eas.json`
> is committed, and a **`preview` build finished and installs**. Verified on the Galaxy S23
> from the EAS link, and on both emulators by `adb install`. The screen renders identically
> on Android 9 and Android 16 — no layout break at the floor.
>
> **Still unverified:** §8 (no local `expo run:android` yet) and §10 (camera passthrough
> untested).
>
> **§9 stands at 4 of 6.** Both remaining rows need the S8, which is blocked — see §9.
>
> Correct this file as you walk it. Delete this banner when §9 passes.

## Test devices (C5)

| Device | OS | Role in B1 |
|---|---|---|
| **Galaxy S8** | Android 9 — **API 28** | The floor, and the **primary** target. Test it first |
| **Galaxy S23** | Modern Android | Development convenience. Flatters everything |
| iPhone 17 | iOS | **Not in v1** per D3. Joins at C1, which needs no app |

The S8 governs this document. It is nine years old and unsupported since ~2021, and it is
the closest thing you have to what the real user holds. Every "does this work" question
means *on the S8*.

---

## Preflight — state of this machine

Checked 2026-08-08 on the M2 MacBook. You are at step 0: the Node/Java side is ready,
the Android side is not installed at all.

| Thing | State | Needed by |
|---|---|---|
| Apple M2, macOS 26.5 | ✅ | — |
| Node | ✅ v26.4.0 | §5 |
| JDK 21 (Temurin + Oracle, both arm64) | ✅ | §8 local builds only |
| Android Studio | ❌ not installed | §1 |
| Android SDK (`~/Library/Android/sdk`) | ❌ missing | §2 |
| `$ANDROID_HOME` | ❌ unset | §3 |
| `eas-cli` | ❌ not installed | §6 |
| App itself (`package.json`, `app.json`) | ❌ does not exist yet | §5 |

**There is no app to build yet.** The repo is B0 scaffolding — four docs and a shell
script. §5 is where the app starts existing, and it is the step with the sharp edge.

Current versions, if you want to pin rather than float: `expo` 57.0.11, `eas-cli`
21.7.0, `react-native-vision-camera` 5.2.2, `expo-ocr-kit` **0.1.4**.

> That `0.1.4` deserves a look. D1 rests on `expo-ocr-kit`, and a pre-1.0 version number
> is consistent with the open question already in `TASKS.md` — whether it holds up or
> becomes a custom Expo Module. Nothing to decide now; B1 doesn't install it. But don't
> be surprised later.

**Node 26 caveat:** v26 is Current, not LTS. Expo tests against LTS lines. If §5 or §8
fails in a way that makes no sense — a bundler crash, a native module refusing to
resolve — drop to Node 22 or 24 via `nvm` before debugging anything else.

---

## 0. The one thing that matters on M2

**Pick an `arm64-v8a` system image, not `x86_64`.**

The emulator has been Apple Silicon-native since Android Studio Bumblebee. An x86_64
image will still boot, but it runs under translation and gives up most of the speed
advantage that makes the emulator usable at all. Every other step here is standard.

---

## 1. Install Android Studio

Download the **Apple Silicon** build from https://developer.android.com/studio
(the download page offers Intel and Apple Silicon `.dmg` files — take the latter).

Studio's GUI is the path of least resistance for §2 and §4, and the Device Manager is
genuinely the easiest way to create an AVD. If you'd rather not install a 1.5 GB IDE to
get an emulator, the SDK is available standalone and every step below has a CLI
equivalent:

```bash
brew install --cask android-commandlinetools
sdkmanager "platform-tools" "emulator" "platforms;android-36" \
           "system-images;android-36;google_apis;arm64-v8a"
avdmanager create avd -n Pixel_6_API_36 \
           -k "system-images;android-36;google_apis;arm64-v8a" -d pixel_6
```

Note that Homebrew puts the SDK somewhere other than `~/Library/Android/sdk`, so adjust
`$ANDROID_HOME` in §3 accordingly (`brew --prefix android-commandlinetools` will tell
you). Everything downstream is identical.

If you only ever build on EAS (§7), nothing compiles on your Mac and the JDK is
irrelevant. If you build locally (§8 — and for emulator work you will want to), you need
a JDK: **17 or 21**. You already have 21 on arm64, so this is a non-issue either way.
Android Studio also ships its own JBR 21 for Gradle's use.

---

## 2. SDK components

> ✅ **Done on this machine via the CLI, not Android Studio.** Android Studio was never
> installed. The Homebrew path in §1 was used instead, and it worked. This is the exact
> command that ran, and it took about 15 minutes for 8.7 GB:
>
> ```bash
> yes | sdkmanager --install \
>   "platform-tools" "emulator" "build-tools;36.0.0" \
>   "platforms;android-36" "platforms;android-28" \
>   "system-images;android-36;google_apis;arm64-v8a" \
>   "system-images;android-28;google_apis;arm64-v8a"
> ```
>
> `yes |` accepts the licence prompts. Installed and verified: `adb` 1.0.41, emulator
> 37.1.11.0, `build-tools;36.0.0`, both platforms, both `arm64-v8a` images. `sdkmanager`
> 22.0 ran fine on JDK 21.

If you prefer the GUI: Android Studio → **Settings → Languages & Frameworks → Android SDK**

**SDK Platforms** tab — check *Show Package Details*, then install:

- **Android 16 (API 36)** — and its **Google APIs ARM 64 v8a System Image**
- **Android 9 (API 28)** — and its **Google APIs ARM 64 v8a System Image**

Two API levels, because you have two Android test devices and they are six years apart.
API 36 tracks the S23; API 28 is the S8's final OS and therefore the v1 floor. See §4.

> ⚠️ **Pin API 36. Do not take "the newest offered".** Google's repository lists a
> `platforms;android-37` entry with **no system image behind it** — not arm64, not even
> x86_64. Install API 37 and you get a platform the emulator cannot boot. Verified
> against Google's repository manifest on 2026-08-08: `arm64-v8a` Google APIs images
> exist for API 24–36, and 36 is the ceiling.

**SDK Tools** tab:

- Android SDK Platform-Tools
- Android Emulator
- Android SDK Build-Tools

Prefer the "Google APIs" image over "Google Play" — Reko needs no Play services, and
the Google APIs image gives you a writable system and root `adb`.

---

## 3. Shell environment

> ✅ **Already in `~/.zshrc` on this machine**, appended 2026-08-08. The original file was
> backed up to `~/.zshrc.bak-before-android-20260808` first.

**The SDK is not at `~/Library/Android/sdk`.** That is the Android Studio location.
Homebrew's `android-commandlinetools` puts it here, and this is the verified path:

```bash
export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
# Gradle reads JAVA_HOME for the local builds in §8
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
```

Then `source ~/.zshrc`. Verify:

```bash
adb --version
emulator -list-avds
```

> ⚠️ **`~/.zshrc` loads for interactive shells only.** A script that runs `zsh -c` or
> `bash -c` will not see these variables, so a check like `zsh -l -c 'echo $ANDROID_HOME'`
> prints nothing even when the file is correct — `-l` is a login shell, not an interactive
> one. Test with `zsh -i -c` instead. If you later need these in scripts, move the block to
> `~/.zprofile`.

---

## 4. Create the AVD

Android Studio → **More Actions → Virtual Device Manager → Create Virtual Device**

**Make two.** They mirror the two real Android test devices:

> ✅ **Both AVDs exist on this machine and both boot.** Created 2026-08-08. Verified from
> inside each one: API 28 reports Android 9, API 36 reports Android 16, both `arm64-v8a`.

| AVD | Device profile | System image | Mirrors | Resolution |
|---|---|---|---|---|
| `Pixel_6_API_36` | `pixel_6` | API 36, `arm64-v8a` | Galaxy S23 — the comfortable case | 1080×2400 |
| `S8_API_28` | `pixel_3` | API 28, `arm64-v8a` | **Galaxy S8 — the floor** | 1080×2160 |

`pixel_3` is the S8 stand-in for two reasons: its 18:9 ratio is the closest offered to the
S8's 18.5:9, and the real Pixel 3 shipped on Android 9. No Galaxy profile exists in
`avdmanager list device`. The screen is 1080 wide against the S8's 1440, so **check text
size on the real phone, not here** — §5's large-type work is exactly where that matters.

For each: confirm the ABI reads `arm64-v8a` before continuing. RAM default is fine; 16 GB
host RAM makes this comfortable.

Develop against API 36 because it is faster and the tooling complains less. **Check
against API 28 before you believe anything works.** A layout or an API that is fine on
36 can fail on 9, and the S8 is the device your actual user holds.

Boot one from the Device Manager and let it settle. Leave it running.

```bash
adb devices        # should list emulator-5554
```

CLI equivalent, if you took the Homebrew path in §1:

These are the commands that actually created them:

```bash
echo "no" | avdmanager create avd -n Pixel_6_API_36 \
  -k "system-images;android-36;google_apis;arm64-v8a" -d pixel_6
echo "no" | avdmanager create avd -n S8_API_28 \
  -k "system-images;android-28;google_apis;arm64-v8a" -d pixel_3
```

`echo "no" |` declines the custom-hardware-profile prompt.

**Ignore the `devices.xml` errors.** Both commands print
`Error: Could not load devices from .../system-images/.../devices.xml`, several times, and
then succeed anyway. `avdmanager` looks for an optional file inside each system image and
complains when it is absent. Check `emulator -list-avds` rather than trusting the exit
noise.

To boot one headless — no window, useful when you only need `adb`:

```bash
emulator -avd S8_API_28 -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect &
adb -s emulator-5554 wait-for-device
adb -s emulator-5554 shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 2; done'
```

Cold boot for API 36 measured about **90 seconds** headless on the M2. API 28 was faster.

> ⚠️ **Always pass `-s emulator-PORT` when scripting.** A killed emulator lingers in
> `adb devices` as `offline` for a few seconds, so a bare `adb wait-for-device` returns
> immediately by matching the *dying* one, and the next command fails with
> `adb: more than one device/emulator`. The first emulator takes 5554, the second 5556.

---

## 5. Scaffold the Expo app

> **Snag:** the repo already contains `README.md`, `TASKS.md`, and `.gitignore`.
> `create-expo-app` refuses to scaffold into a directory with conflicting files, and
> would overwrite our `.gitignore` if it did. Scaffold to a temp dir and copy in.

> ⚠️ **Do not use `cp -R . ~/Git/Reko/` for this.** `create-expo-app` runs `git init`, so
> the temp dir has its own `.git/`. A dot-glob copy merges that `.git/` into ours —
> overwriting `HEAD`, `config`, `refs/`, and the index with a fresh repo's versions, on
> top of real history and the `origin` remote. Recoverable, but a bad afternoon. Exclude
> `.git/` explicitly, which is what `rsync` below is for.

```bash
cd ~/Git
npx create-expo-app@latest reko-tmp --template blank-typescript

# Copy in everything EXCEPT .git and the files we already maintain.
# Trailing slashes matter to rsync — src/ means "contents of", not "the dir itself".
rsync -av \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'README.md' \
  --exclude '.gitignore' \
  --exclude 'LICENSE' \
  ~/Git/reko-tmp/ ~/Git/Reko/

cd ~/Git/Reko
npm install                    # cheaper than rsyncing 100k files
rm -rf ~/Git/reko-tmp
```

> ⚠️ **`--exclude 'LICENSE'` is not optional.** The template ships Expo's own MIT licence:
> *"Copyright (c) 2015-present 650 Industries, Inc. (aka Expo)"*. Copy it in and you have
> silently put Expo's copyright on Reko and answered the README's "License: TBD" without
> deciding anything. Verified present in the SDK 57 template on 2026-08-08.

**Four other files the template now ships**, none of which the exclude list blocks. All
four were kept deliberately here:

| File | What it is | Verdict |
|---|---|---|
| `AGENTS.md` | Three lines: read the versioned Expo docs before writing code | Keep — accurate and useful |
| `CLAUDE.md` | One line, `@AGENTS.md` | Keep. **Note it changes how future Claude sessions behave in this repo** |
| `.claude/settings.json` | Enables the official Expo plugin | Keep. It does *not* collide with `settings.local.json` |
| `assets/*.png` | Placeholder icons | Keep — the build needs an icon |

`.claude/settings.local.json` holds local permission grants and is covered by the global
`~/.gitignore_global`, so it stays out of the repo on its own.

Then confirm the repo survived and that nothing unwanted is staged — `node_modules/` and
`.expo/` should not appear, because `.gitignore` already covers them:

```bash
git log --oneline -1 && git remote -v && git status --short
```

Then set the package name in `app.json`, per D2:

```json
{
  "expo": {
    "name": "Reko",
    "slug": "reko",
    "android": { "package": "com.kacooper.reko" }
  }
}
```

**Do not install `expo-ocr-kit` or `react-native-vision-camera` yet.** B1 is a
distribution test, not a feature. Adding native camera deps now means a build failure
can't be cleanly attributed to the pipeline vs. the dependency — which is the whole
thing B1 is trying to isolate.

### 5a. Check the Android floor — do this immediately

**This is the one check that can invalidate a test device, so do it before anything
else.** The Galaxy S8's final OS is Android 9 (API 28). If Expo's minimum is above 28,
the S8 cannot run Reko at all, and D6 needs rewriting.

> ## ✅ ANSWERED: `minSdk` is **24**. The S8 is in, with four levels of margin.
>
> Checked 2026-08-08 against Expo SDK 57.0.11 / React Native 0.86.2. Two independent
> sources agree:
>
> - `ExpoRootProjectPlugin.kt` — `setIfNotExist("minSdkVersion") { … ?: "24" }`
> - `node_modules/react-native/gradle/libs.versions.toml` — `minSdk = "24"`
>
> Read from source, not yet from Gradle's own output. The first local build (§8) prints an
> authoritative `[ExpoRootProject] Using the following versions:` block — confirm there.

**Do not grep `android/build.gradle` for this.** It is not there. `android/app/build.gradle`
says `minSdkVersion rootProject.ext.minSdkVersion`, and that `ext` is populated at
configuration time by the `expo-root-project` plugin, which reads a version catalog and
falls back to hardcoded defaults. The real values live in two places:

```bash
npx expo prebuild -p android

# The plugin's fallbacks:
grep -nE 'minSdk|compileSdk|targetSdk' \
  node_modules/expo-modules-autolinking/android/expo-gradle-plugin/expo-autolinking-plugin/src/main/kotlin/expo/modules/plugin/ExpoRootProjectPlugin.kt

# The catalog that overrides them:
sed -n '1,10p' node_modules/react-native/gradle/libs.versions.toml
```

Read the number:

| Result | Meaning |
|---|---|
| **≤ 28** | The S8 is in. Proceed |
| **> 28** | **Stop.** The S8 cannot run v1. Record it in `TASKS.md`, revisit D6, and decide whether to pin an older Expo SDK or drop the device |

### What else that catalog decides

Check these at the same time — they tell you which SDK packages §2 actually needed:

| Value | SDK 57 / RN 0.86.2 | Installed in §2? |
|---|---|---|
| `compileSdk` / `targetSdk` | 36 | ✅ `platforms;android-36` |
| `buildTools` | 36.0.0 | ✅ `build-tools;36.0.0` |
| `ndkVersion` | 27.1.12297006 | ❌ **not installed** |

The NDK is absent on this machine. A stock Expo build with no custom native code usually
does not need it. **If §8 fails asking for NDK 27.1.12297006**, install it and re-run:

```bash
sdkmanager --install "ndk;27.1.12297006"
```

`react-native-vision-camera` inherits this value from the app rather than setting its
own, so re-run this check when you add it at B2. A camera library is exactly the kind of
dependency that raises a floor.

---

## 6. Configure EAS

> ✅ **Done on this machine, 2026-08-08.** The project is linked and `eas.json` is
> committed. `eas project:info` reports `fullName @kacooper/reko`, ID
> `6b9e55ce-906f-4931-951e-617e74c761e8`.
>
> The project was moved from the `smallbytes` organisation to the `kacooper` account after
> creation. **The transfer preserved the project ID** — the same UUID linked without
> complaint, so nothing recorded here went stale.

The Expo project **already exists** — created 2026-08-08, linked to GitHub. So link to it;
do not create a second one.

```bash
npm install -g eas-cli
eas login                                            # already done; verify with eas whoami
eas init --id 6b9e55ce-906f-4931-951e-617e74c761e8 --non-interactive
eas project:info                                     # confirm fullName and ID
printf '\n\n' | eas build:configure -p android       # writes eas.json
```

> `eas init` accepts `--non-interactive`. **`eas build:configure` does not** — it fails with
> `Nonexistent flag`. Pipe newlines into it instead, as above, so it cannot block waiting
> for input.

> **Use `--id`.** Plain `eas init` *creates* a project. Run it against an account that
> already has one and you get two, then build against the wrong one and wonder why the
> install link is stale.

`eas init --id` writes the value into `app.json` under `extra.eas.projectId`. **Commit it.**
It is not a secret — Expo publishes it, it appears in build URLs, and EAS's own servers
need to read it from the repo. Do not move it to an environment variable; a clean checkout
must be able to build.

**`eas init` writes the `owner` field itself.** It resolved to `"owner": "kacooper"` here
without being asked. Verify it rather than adding it by hand — a wrong value makes builds
fail to resolve the project, and that matters when you own more than one account.

Also check `eas whoami` if two accounts are in play. It reports the live account names, and
they can change: this account was renamed from `kacooper33` to `kacooper` mid-project.
`~/.expo/state.json` keeps caching the old username, so trust the CLI, not the file.

### eas.json

`build:configure` generates a working file. **Two edits are still needed** — add
`android.buildType: "apk"` to `development` and `preview`. This is the committed result:

```json
{
  "cli": {
    "version": ">= 21.7.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "production": { "autoIncrement": true }
  },
  "submit": { "production": {} }
}
```

Two things the generator adds that older examples omit, both worth keeping:

- **`appVersionSource: "remote"`** — EAS tracks `versionCode` server-side, so you never
  hand-bump it or collide with yourself.
- **`version: ">= 21.7.0"`** — pins the CLI floor to what actually generated the file.

`buildType: "apk"` keeps Android development builds as APK rather than AAB. Internal
distribution already leans this way, but stating it removes the doubt — and an AAB cannot
be sideloaded from a link, which is the whole of B1.

---

## 7. Build and install

```bash
eas build --platform android --profile development
```

Cloud build, roughly 10–20 minutes on the free tier. When it finishes the CLI asks
whether to install to a running emulator — press **Y**.

Then start the bundler and open the dev client on the emulator:

```bash
npx expo start --dev-client
```

**The same APK installs on a physical device.** No separate profile, no rebuild — scan
the QR from the EAS build page on your own phone, or `adb install` the downloaded file.
That's the real-device half of B1, and it's where you'll meet the Play Protect
"Unsafe app blocked" prompt that the emulator never shows you.

---

## 8. The fast loop — build locally for emulator work

§7 is a cloud build: 10–20 minutes, plus queue time on the free tier. That is a fine way
to produce **one** artifact you hand to a tester. It is a miserable way to iterate on a
parser, and B2/B3 is going to be a lot of iterating.

Because §2 and §3 already installed the SDK and §1's JDK is present, you can compile on
the Mac instead:

```bash
npx expo run:android
```

First run is 5–15 minutes — Gradle downloads the world. **Subsequent runs are ~1 minute.**
It runs `prebuild`, compiles, installs to the running emulator, and starts the bundler,
all in one command. The M2 is genuinely fast at this.

This generates a native `android/` directory. That's expected and already gitignored
(`/android`) — it's a build artifact, regenerate it rather than committing it. After
adding or upgrading any native dependency:

```bash
npx expo prebuild --clean -p android
```

### Which build for which purpose

| | Local `run:android` | EAS `--profile development` |
|---|---|---|
| Emulator iteration (B2, B3a–d) | ✅ use this | too slow |
| Signing | debug key | proper internal-distribution build |
| Giving to a tester | ❌ never | ✅ this is the point |
| **B1 real-device acceptance** | ❌ doesn't test the thing | ✅ required |

That last row matters. **B1's real-device half must be the EAS build**, not a local APK
sideloaded over USB. B1 exists to prove the *distribution chain* — EAS internal
distribution, the install link, Play Protect's warnings — before any feature exists. A
local `adb install` skips exactly the part being tested and would let you check B1 off
without having learned anything.

---

## 9. B1 acceptance

B1 is done when all six hold. **Status 2026-08-09: 4 of 6.**

- [x] `minSdkVersion` is ≤ 28, so the S8 is a viable target (§5a) — **24**, read from the
      built APK with `apkanalyzer manifest min-sdk`, not just from source
- [x] Build installs and launches on both emulators — API 36 and API 28. Installed with
      `adb install`, so this proves the app *runs* at both API levels. It does **not** test
      distribution; only a real phone does that
- [ ] Build installs and launches on the **Galaxy S8** via the EAS link — **blocked**, see
      below
- [x] Build installs and launches on the **Galaxy S23** via the EAS link
- [x] A camera icon is visible and visibly disabled — confirmed on the S23 and both
      emulators
- [ ] You've written down what the install flow looked like **on the S8** — **blocked**

### Build the `preview` profile, not `development`

The original wording said "dev build". That is wrong for this purpose, and it cost a
false start.

A `development` build carries no JavaScript. It fetches the bundle from Metro on your Mac,
so on a phone it opens the dev-client launcher asking for a development server — not Reko.
No tester will run Metro.

```bash
eas build --platform android --profile preview
```

`preview` bundles the JS and runs standalone. Install behaviour is identical between the
two profiles, so observations about taps and warnings hold either way. Use `development`
later, for the B2 iteration loop where fast reload matters.

### The S8 is blocked, and the reason is the finding

The S8 was logged into a **minor's account**, which cannot install unknown apps. The
*Install unknown apps* toggle is absent or greyed out rather than merely off — this is a
hard block, not a warning to dismiss. A factory reset is planned.

Record this as a distribution result, not a detour. **A tester whose phone is managed by a
family member cannot sideload at all**, and no amount of instruction changes that.

### On the S23's warnings

The S23 installed once the warnings were dismissed. Owner's assessment, recorded as the
call: **these are the ordinary consequence of installing an app from the internet rather
than a store, and are not a product concern.** Reasonable — they are standard, expected,
and dismissible by a competent adult.

What survives that judgement is the paragraph above. The S8's block was categorically
different: not a warning, but a refusal.

### Still the deliverable

The last checkbox. The build working is assumed; the question B1 answers is whether the
distribution path is walkable by the people who'll test it — on the oldest phone in the
set, not the newest.

**Do the S8 before the S23** when the reset is done. Android 9's sideload flow is the
oldest and the most confusing.

The iPhone 17 is not part of B1. Per D3 it cannot run v1, and EAS iOS distribution needs
the $99 Apple Developer Program. That user joins at C1 instead, which is a printed card
and needs no app at all.

Minimal screen for the icon, in `app/index.tsx` or `App.tsx`:

```tsx
import { View, Text, Pressable } from 'react-native';

export default function Index() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 }}>
      <Text style={{ fontSize: 32, fontWeight: '600' }}>Reko</Text>
      <Pressable
        disabled
        accessibilityLabel="Scan a label. Not available yet."
        style={{ opacity: 0.4, padding: 24, borderWidth: 2, borderRadius: 16 }}
      >
        <Text style={{ fontSize: 20 }}>📷  Scan a label</Text>
      </Pressable>
      <Text style={{ fontSize: 16, opacity: 0.6 }}>Not available yet</Text>
    </View>
  );
}
```

---

## 10. Ahead of B2 — the emulator cannot see a label

Worth knowing now, before you build a workflow on top of the emulator.

The emulator's back camera does not default to anything real. It renders **VirtualScene**,
a synthetic 3D room. Point Reko at it and you get a tasteful sofa. There is no medicine
box to read, so B2 (capture → OCR → dump text) has nothing to operate on out of the box.

Three ways around it, in increasing order of how much I'd recommend them:

**a. Webcam passthrough** — point the emulator at the MacBook's own camera:

```bash
emulator -avd Pixel_6_API_36 -camera-back webcam0
```

(Also settable per-AVD in Device Manager → edit → *Back camera: Webcam0*, and live via
Extended Controls → Camera.) macOS will ask for camera permission the first time. Then
hold a real box up to the lid. Works, but the FaceTime camera has no macro focus and
tops out low — small print sits right at the edge of legibility, so a failure tells you
nothing about whether OCR is any good.

**b. Custom virtual-scene poster** — put a label image on the fake room's wall by editing
`$ANDROID_HOME/emulator/resources/Toren1BD.posters` to point a poster entry at your own
PNG. Fiddly, but deterministic and repeatable — reasonable as a smoke test.

**c. Skip the camera. ← do this one**

Feed a static image straight into the OCR call behind a debug-only path, and push the
golden set onto the device:

```bash
adb push ~/reko-golden/. /sdcard/Download/
```

This is the right shape regardless of the emulator, because **C4 already calls for ~20
frozen label photos with hand-written correct answers.** That's a test fixture, and
fixtures need a deterministic input seam — not a camera. Build "OCR from a file path"
as a first-class internal entry point and three things follow: B3a–c become testable
with no device in the loop, C4 turns into a regression suite instead of a manual ritual,
and a parser change can be measured against 20 known answers in seconds.

**The caveat that governs all three:** OCR accuracy measured on an emulator is
meaningless. Glare, curved bottles, worn print, two-column panels — C4's own list — are
properties of real capture on real hardware. The emulator is for building the parser.
The decision about whether `expo-ocr-kit` survives (that open question in `TASKS.md`) can
only be settled on a real phone.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `INSTALL_FAILED_NO_MATCHING_ABIS` | x86_64 AVD, or an APK built without `arm64-v8a`. Recreate the AVD with an ARM image |
| Emulator missing from the EAS install prompt | Emulator wasn't running, or `adb devices` doesn't list it. Check `$ANDROID_HOME` in §3 |
| `adb: command not found` | `~/.zshrc` not sourced, or SDK is somewhere other than `~/Library/Android/sdk` |
| Emulator very slow | Almost always an x86_64 image on ARM. Check the AVD's ABI |
| Bundler can't reach the app | Use `npx expo start --dev-client`, not plain `expo start` — Expo Go can't load a dev build |
| `SDK location not found` | `$ANDROID_HOME` unset or wrong — §3. On this machine it is `/opt/homebrew/share/android-commandlinetools`, **not** `~/Library/Android/sdk`. Local builds also accept an `android/local.properties` with `sdk.dir=`, but fix the env var instead; `local.properties` is gitignored for a reason |
| `$ANDROID_HOME` empty in a script, but right in your terminal | `~/.zshrc` loads for interactive shells only. Test with `zsh -i -c`, not `zsh -l -c`. Move the block to `~/.zprofile` if scripts need it — §3 |
| `avdmanager` prints `Could not load devices from .../devices.xml` | Harmless. The file is optional and absent from the system images. The AVD is still created — confirm with `emulator -list-avds` — §4 |
| `adb: more than one device/emulator` right after killing one | The dead emulator lingers as `offline` for a few seconds. Target the port: `adb -s emulator-5556 …` — §4 |
| `expo run:android` finds no device | Emulator must already be booted. `adb devices` first |
| Gradle fails on a Java version | Point `JAVA_HOME` at JDK 21: `export JAVA_HOME=$(/usr/libexec/java_home -v 21)` |
| Camera shows a living room, not a label | Working as designed — §10 |
| Play Protect: "Unsafe app blocked" on a real phone | Expected for internal distribution. Don't paper over it — how many taps this costs is a **B1 deliverable** (§9) |
| Inexplicable bundler or native-resolution failure | Node 26 is Current, not LTS. Drop to Node 22/24 before debugging further — see Preflight |
| `git status` shows a huge diff after §5 | The `.git/` clobber. `git remote -v` and `git log` will look wrong too. Restore from `origin` — nothing local is unpushed |
| Phone shows the dev-client launcher, not Reko | You built `development`, which carries no JS. Build `preview`, or run `npx expo start --dev-client` on the Mac — §9 |
| *Install unknown apps* is greyed out or missing entirely | The account is a minor's, supervised, or otherwise restricted. This is a hard block, not a setting you can flip. Switch to the owner user, or reset the device — §9 |
| `adb shell monkey -p <pkg>` installs but never launches | Happened here: `monkey` reported success and left the home screen up. Use `adb shell am start -W -n <pkg>/.MainActivity`, resolving the activity with `cmd package resolve-activity --brief` |
| `aapt2 dump badging` prints no `sdkVersion` line | Use `apkanalyzer manifest min-sdk <apk>` instead. It returns the number alone, and it is the authoritative read of a built APK |
