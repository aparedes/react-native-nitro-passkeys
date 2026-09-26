# react-native-nitro-passkeys v1 Orchestration Plan

**Date:** 2026-09-26 · **Branch:** main · **Commit:** none (repo has no commits yet; the empty-tree hash `4b825dc642cb6eb9a060e54bf8d69288fbee4904` is the diff base) · **Research:** `tasks/2026-09-25-nitro-passkeys-v1/research.md` (commit: none — reference repos stamped inside it; re-checked 2026-09-26, no drift in any cited file)

## Overview

Build `react-native-nitro-passkeys` v1 from scratch in this empty repo: a Nitro HybridObject
that brings WebAuthn passkeys (JSON in, JSON out, byte-compatible with `@simplewebauthn/server`
v14) to bare React Native on iOS 16+ and Android minSdk 28. The canonical spec is
`/Volumes/CaseSensitive/GitHub/football/wc2018/tasks/2026-09-25-mobile-app-nitro-first/specs/react-native-nitro-passkeys.md`
(called **SPEC** below, 757 lines); the research doc's two `## Follow-up` sections override it
where they disagree.

Path shorthands used in every phase:
- **SPEC** = the spec path above
- **ASPEC** = `/Volumes/CaseSensitive/GitHub/football/wc2018/tasks/2026-09-25-mobile-app-nitro-first/specs/react-native-nitro-apple-sign-in.md` (sibling spec; source of the error format, anchor, in-flight guard and bun test patterns)
- **IP** = `/Volumes/CaseSensitive/GitHub/react-native-nitro-image-pipeline` (scaffold template, commit `7c96c4b`)
- **SHIM** = `/Volumes/CaseSensitive/GitHub/react-native-nitro-shimmer-text` (RN 0.87.1 UIScene example template, commit `2fdef1a`)
- **WC** = `/Volumes/CaseSensitive/GitHub/football/wc2018` (the consumer; its `apps/web/app/api/_flows.ts` and `_webauthn.ts` are the reference server flows)

## Current State Analysis

- The repo is empty: `main` has no commits; the only content is `tasks/`.
- Everything is copied from IP (library scaffold) and SHIM (example app lifecycle), renamed
  `NitroImagePipeline`/`nitroimagepipeline` → `NitroPasskeys`/`nitropasskeys`, with image-pipeline's
  domain deps (NitroImage, Nuke, Coil, Cronet, blur C++) dropped.
- IP has **no** bun tests, JUnit, XCTest, `consumerProguardFiles` or hard-coded minSdk — all of
  those are new here.
- Toolchain on this machine: Xcode 27.0 (iPhoneOS27.0 SDK), only an **iOS 27.0** simulator
  runtime, an `iPhone 17` simulator exists. CI stays on Xcode 26.4 / iOS 26.4.

## Desired End State

- `bun install && bun run build` produces `lib/`; `bun test src`, `bun run typecheck`,
  `bunx oxlint --deny-warnings`, `bunx oxfmt --check` all pass.
- The example app (`example/`, RN 0.87.1, UIScene lifecycle, iOS 16.0 / Android minSdk 28)
  builds on both platforms and can register + log in against `example/server`.
- iOS XCTest target and Android JUnit tests cover every native row of SPEC §6 and the Base64URL
  edge cases; harness suites cover the JS → Nitro → native path without system sheets.
- README covers all eight SPEC §8 items (with the research-follow-up deviations).

Key Discoveries:
- `IP/nitro.json` has exactly the autolinking shape SPEC §2 shows.
- `IP/android/build.gradle:45` reads minSdk via `getExtOrIntegerDefault("minSdkVersion")` — SPEC requires a literal `28` instead.
- Nitro 0.37.1 `Promise.async` exists on both platforms; Kotlin's takes an optional `CoroutineScope` first argument (`NM/.../core/Promise.kt:141-143`); Swift has a manual `Promise<T>()` + `resolve(withResult:)` / `reject(withError:)` API.
- A native rejection message reaches JS verbatim (possibly with a `"<funcName>: "` prefix for sync throws, and fbjni text on Android) — the token regex matches anywhere.
- `@simplewebauthn/server` 14.0.2 `generateAuthenticationOptions` always sets the `rpId` key, `undefined` when no `rpID` is passed — validation must treat `undefined` as missing.
- iOS: `ASAuthorizationError` 1006 (`matchedExcludedCredential`) is iOS 18+; `excludedCredentials` is iOS 17.4+; `attachment` is iOS 16.6+; assertion `rawAuthenticatorData`/`signature` are non-null `Data`.
- `credentials-play-services-auth` 1.6.0 already ships the R8 keep rule; the module ships **no** `consumer-rules.pro`.

### Decisions that override SPEC (from research follow-ups)

| Topic | Decision |
|---|---|
| R8 rule | **No** `android/consumer-rules.pro`, no `consumerProguardFiles` line, no `files` entry for it. Rely on the rule `credentials-play-services-auth` ships. |
| `JSONException` row | **Keep** it in `PasskeyErrorToken.kt` as defensive mapping → `invalidOptions`. |
| fbjni text in Android messages | `PasskeyError.from` does **not** strip it; it only removes the `[Passkeys:<token>]` marker. |
| iOS enum raw values | Use `(rawValue:)` as SPEC says; the XCTest **asserts** that `"discouraged"/"preferred"/"required"` and `"none"/"direct"/"indirect"/"enterprise"` round-trip. |
| Non-null `rawAuthenticatorData`/`signature` | Check for **empty** `Data` and reject `[Passkeys:unknown] …`. |
| Nitro version | `0.37.1` everywhere (library devDeps, example, peer `>=0.37.1 <0.38.0`). |
| Tests | harness (integration, no sheets) + JUnit + XCTest (native rows) + manual `example/server` runs (successful ceremonies, `canceled`, `alreadyRegistered`, fixture capture). |
| Example iOS | Xcode 27, UIScene lifecycle (`SceneDelegate` owns the window), deployment target **16.0** in Podfile and `IPHONEOS_DEPLOYMENT_TARGET`. |
| CI Xcode | Keep IP's `xcode-version: 26.4`; harness iOS version from `process.env.HARNESS_IOS_VERSION ?? '26.4'` (local runs use `27.0`). |

### Shared fixture format (used by Phase 2's `roundtrip.test.ts` and Phase 5's `--record`)

Files: `src/__tests__/fixtures/{ios,android}-{registration,authentication}.json`. Each is:

```jsonc
{
  "platform": "ios",                 // "ios" | "android"
  "kind": "registration",            // "registration" | "authentication"
  "options": { /* the options JSON the server sent */ },
  "raw": "<the response JSON string exactly as the app posted it>",
  "expectedChallenge": "<base64url>",
  "expectedOrigin": ["https://<rpID>", "android:apk-key-hash:<hash>"],
  "expectedRPID": "<rpID>",
  "registrationFixture": "ios-registration.json" // authentication only: the registration it chains from
}
```

## What We're NOT Doing

- No direct security-key (USB/NFC) API, no conditional UI / autofill, no extension inputs on iOS.
- No `android/consumer-rules.pro` (decision above), and no lower-minSdk mode — minSdk 28 is final.
- No npm publish / `semantic-release` run; `release.yml` is added but never triggered.
- No changes outside this repo: not `WC/apps/mobile`, not HoloCatch, not the SPEC file itself.
- No CI automation of a successful create/get ceremony (OS sheets can't be driven); those stay manual.
- No committed fixtures produced by an agent — fixtures come only from a real manual `--record` run.
- No `CLAUDE.md`, `post-script.ts`, `.zed/`, `docs/plans/`, `PLAN.md` or fixture server from IP.

## Implementation Approach

Scaffold first so every later phase has a building example app to verify against; then the
pure-TS layer (fast, fully unit-testable, defines the error-token contract both natives
target); then each native platform in its own phase (different model needs and verification
toolchains); then the example flows, server and harness suites that exercise everything
together; then the README; then the mandatory doc drift sweep.

## Orchestration

**Orchestrator model:** `sonnet` — balanced tier. The phases are tightly specified. The
orchestrator briefs subagents, checks diffs against the plan, re-runs verification, and
settles toolchain drift (CLI template output, CocoaPods and Gradle versions). None of that
is design work. This line is static.

**Commit convention:** one commit per phase, directly on `main` (the repo has no commits yet,
so Phase 1's commit is the root commit). Stage the phase's changes **plus** the updated
`tasks/2026-09-25-nitro-passkeys-v1/` files (Phase 1's commit includes `research.md` and this
plan). Messages are Conventional Commits, because semantic-release parses them:
- Phase 1: `chore: scaffold nitro module and example app (phase 1)`
- Phase 2: `feat: typescript api, validation and PasskeyError (phase 2)`
- Phase 3: `feat(ios): passkey create/get via AuthenticationServices (phase 3)`
- Phase 4: `feat(android): passkey create/get via Credential Manager (phase 4)`
- Phase 5: `feat(example): demo flows, webauthn test server and harness suites (phase 5)`
- Phase 6: `docs: README (phase 6)`
- Phase 7: `docs: fix doc drift (phase 7)`

Each message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Lefthook
pre-commit hooks run; do not bypass them. Don't push.

---

## Phase 1: Scaffold library, codegen and example app

### Overview
Create the complete buildable skeleton: library config, the verbatim HybridObject spec,
committed nitrogen output, stub native classes, lint/release/CI config, and a fresh RN 0.87.1
example app on the UIScene lifecycle that links the library locally. The phase ends with the
example app building on both platforms. It comes first because every later phase verifies
against this build.

### Recommended model
`sonnet` — mostly mechanical copy-and-rename, but it touches many toolchains (bun, nitrogen,
CocoaPods, Gradle, Xcode).

### Effort
high (briefing guidance) — many files, and CocoaPods and Gradle fail in non-obvious ways (the
deployment target, the minSdk manifest merge, hoisted `node_modules`).

### Changes Required

#### 1. Root package and tooling files
**Files**: repo root
**Changes**:
- [x] Copy verbatim from IP: `.gitignore`, `.oxfmtrc.json`, `.watchmanconfig`, `babel.config.js`, `bunfig.toml` (`[install] linker = "hoisted"`), `lefthook.yml`, `release.config.cjs`, `LICENSE`, `.oxlint/react-native-plugin.mjs`, `scripts/hooks/swiftlint.sh`, `.github/dependabot.yml`
- [x] Copy IP `.oxlintrc.json` verbatim (its `ignorePatterns` already cover `lib/**`, `nitrogen/generated/**`, `example/ios/**`, `example/android/**`)
- [x] Copy IP `.swiftlint.yml`, changing `included:` entry `example/ios/NitroImagePipelineExample` → `example/ios/NitroPasskeysExample`
- [x] Create `CHANGELOG.md` containing only `# Changelog\n`
- [x] Create `nitro.json` exactly as SPEC §2 "`nitro.json`" (SPEC lines 75-100)
- [x] Create `package.json` from the ASPEC `package.json` block (ASPEC lines ~94-173), changing:
  > Deviation: kept IP's `overrides` block (`lodash-es`, `typescript: $typescript`); `@simplewebauthn/server` resolved to 14.0.3. Example CLI leftovers `.eslintrc.js`, `.prettierrc.js`, `__tests__/` deleted. `bun install` ran `lefthook install` (git hooks now active).
  - `"name": "react-native-nitro-passkeys"`, `"version": "0.0.0-development"`
  - `"description": "WebAuthn passkeys for bare React Native, built with Nitro Modules"`
  - `repository`/`homepage`/`bugs`/`author`/`license`/`keywords`: copy IP `package.json`'s fields, replacing `react-native-nitro-image-pipeline` with `react-native-nitro-passkeys`
  - keep the ASPEC `scripts` (including `"test": "bun test src"`) and the `files` list exactly (it already has `"!src/**/__tests__"`; **do not** add `android/consumer-rules.pro`)
  - devDependencies: the ASPEC list **plus** `"@simplewebauthn/server": "^14.0.2"`
  - `react-native-builder-bob.targets`: `["commonjs", "module", ["typescript", { "project": "tsconfig.build.json" }]]`
- [x] Copy IP `tsconfig.json` verbatim, and add `"types": ["bun"]` to `compilerOptions`. Tests stay type-checked by `tsc --noEmit`.
- [x] Create `tsconfig.build.json`, which bob uses so that tests and `types-compat.ts` are left out of `lib/`:
  ```json
  {
    "extends": "./tsconfig.json",
    "exclude": ["**/node_modules", "**/lib", "src/**/__tests__"]
  }
  ```

#### 2. HybridObject spec and placeholder entry
**Files**: `src/specs/nitro-passkeys.nitro.ts`, `src/index.ts`
**Changes**:
- [x] Create `src/specs/nitro-passkeys.nitro.ts` **verbatim** from SPEC §3.1 (SPEC lines 160-171)
  > Deviation: `oxfmt` re-wrapped the `extends HybridObject<{…}>` line (whitespace only); nitrogen output identical.
- [x] Create `src/index.ts` containing only `export {};`. Phase 2 replaces it.
  > Deviation: file is `export {};` preceded by `// oxlint-disable-next-line unicorn/require-module-specifiers` (plain `export {};` fails `oxlint --deny-warnings`). Phase 2 replaces it.

#### 3. iOS pod and stub
**Files**: `NitroPasskeys.podspec`, `ios/Bridge.h`, `ios/HybridNitroPasskeys.swift`
**Changes**:
- [x] Create `NitroPasskeys.podspec` from `IP/NitroImagePipeline.podspec` with:
  > Deviation: `s.version` is `package["version"]` with any `-…` prerelease suffix stripped (CocoaPods cannot resolve an unpinned dep on `0.0.0-development`); git tag keeps the full npm version.
  - `s.name = "NitroPasskeys"`
  - `s.platforms = { :ios => '16.0' }` (drop visionOS)
  - the source git URL repo name changed to `react-native-nitro-passkeys`
  - `s.source_files = ["ios/**/*.{swift}", "ios/**/*.{m,mm}"]` (no `cpp/`)
  - `s.frameworks = 'AuthenticationServices'`
  - `load 'nitrogen/generated/ios/NitroPasskeys+autolinking.rb'` then `add_nitrogen_files(s)`
  - keep `s.dependency 'React-jsi'`, `s.dependency 'React-callinvoker'`, `install_modules_dependencies(s)`
  - remove `NitroImage` and the Nuke `spm_dependency`
- [x] Create `ios/Bridge.h` with only `#pragma once` (IP's header comment names an old project; drop it)
- [x] Create the stub `ios/HybridNitroPasskeys.swift` (Phase 3 replaces the bodies):
  ```swift
  import NitroModules

  class HybridNitroPasskeys: HybridNitroPasskeysSpec {
    var isSupported: Bool { true }

    func create(creationOptionsJson: String) throws -> Promise<String> {
      Promise.rejected(withError: RuntimeError.error(withMessage: "[Passkeys:unknown] Not implemented"))
    }

    func get(requestOptionsJson: String) throws -> Promise<String> {
      Promise.rejected(withError: RuntimeError.error(withMessage: "[Passkeys:unknown] Not implemented"))
    }
  }
  ```
  Match the exact method signatures in the generated `nitrogen/generated/ios/swift/HybridNitroPasskeysSpec.swift`. If they differ from the snippet (e.g. `throws`), follow the generated file.

#### 4. Android library and stub
**Files**: `android/**`
**Changes**:
- [x] Copy `IP/android/fix-prefab.gradle` verbatim
- [x] Create `android/gradle.properties`:
  ```properties
  NitroPasskeys_kotlinVersion=2.1.20
  NitroPasskeys_minSdkVersion=28
  NitroPasskeys_targetSdkVersion=36
  NitroPasskeys_compileSdkVersion=36
  NitroPasskeys_ndkVersion=27.1.12297006
  ```
  compileSdk is raised from IP's 34 because androidx.credentials 1.6.0 needs a recent compileSdk. The value is only used when the host sets no `rootProject.ext`.
- [x] Create `android/build.gradle` from `IP/android/build.gradle`:
  - in `getExtOrDefault()` and `getExtOrIntegerDefault()` (IP `:30-36`), change the `NitroImagePipeline_` property prefix to `NitroPasskeys_`
  - change the autolinking `apply from` (IP `:23`) to `'../nitrogen/generated/android/NitroPasskeys+autolinking.gradle'`
  - change `namespace` (IP `:39`) to `"com.margelo.nitro.nitropasskeys"`
  - in `defaultConfig` (IP `:45`), replace `minSdkVersion getExtOrIntegerDefault("minSdkVersion")` with a literal `minSdkVersion 28`, plus the comment `// Hard-coded: hosts below 28 must fail the manifest merge (no lower-minSdk mode).`. Do **not** add `consumerProguardFiles`.
  - replace the `dependencies {}` block (IP `:132-150`) with:
    ```gradle
    dependencies {
      //noinspection GradleDynamicVersion
      implementation "com.facebook.react:react-native:+"
      implementation project(":react-native-nitro-modules")
      implementation "androidx.credentials:credentials:1.6.0"
      implementation "androidx.credentials:credentials-play-services-auth:1.6.0"
      implementation "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2" // CredentialManager APIs are suspend funs
    }
    ```
  - in the trailing `react {}` block, use `libraryName = "NitroPasskeys"` and `codegenJavaPackageName = "com.margelo.nitro.nitropasskeys"`
- [x] Create `android/CMakeLists.txt` from IP's:
  - `project(NitroPasskeys)` and `set (PACKAGE_NAME NitroPasskeys)`
  - `add_library(${PACKAGE_NAME} SHARED src/main/cpp/cpp-adapter.cpp)`
  - `include(${CMAKE_SOURCE_DIR}/../nitrogen/generated/android/NitroPasskeys+autolinking.cmake)`
  - `include_directories("src/main/cpp")`
  - `find_library(LOG_LIB log)`
  - `target_link_libraries(${PACKAGE_NAME} ${LOG_LIB} android)`
  - remove the blur sources, `jnigraphics`, `../cpp` and `find_package(react-native-nitro-image)`
- [x] Create `android/src/main/AndroidManifest.xml`, an empty `<manifest>`, as in IP
- [x] Create `android/src/main/cpp/cpp-adapter.cpp` from IP's: include `"NitroPasskeysOnLoad.hpp"` and call `margelo::nitro::nitropasskeys::registerAllNatives();`
- [x] Create `android/src/main/java/com/margelo/nitro/nitropasskeys/NitroPasskeysPackage.kt` from `IP/.../NitroImagePipelinePackage.kt`: package `com.margelo.nitro.nitropasskeys`, class `NitroPasskeysPackage`, and the companion `init` calling `NitroPasskeysOnLoad.initializeNative()`
- [x] Create the stub `android/src/main/java/com/margelo/nitro/nitropasskeys/HybridNitroPasskeys.kt`. Phase 4 replaces the bodies:
  ```kotlin
  package com.margelo.nitro.nitropasskeys

  import androidx.annotation.Keep
  import com.facebook.proguard.annotations.DoNotStrip
  import com.margelo.nitro.core.Promise

  @DoNotStrip
  @Keep
  class HybridNitroPasskeys : HybridNitroPasskeysSpec() {
    override val isSupported: Boolean
      get() = true

    override fun create(creationOptionsJson: String): Promise<String> =
      Promise.rejected(Error("[Passkeys:unknown] Not implemented"))

    override fun get(requestOptionsJson: String): Promise<String> =
      Promise.rejected(Error("[Passkeys:unknown] Not implemented"))
  }
  ```
  If `IP/.../HybridNitroImagePipeline.kt` has no `@DoNotStrip`/`@Keep`, drop them too. Match the generated `nitrogen/generated/android/kotlin/.../HybridNitroPasskeysSpec.kt` signatures.

#### 5. Codegen
- [x] Run `bun install`, then `bun run codegen`. It runs nitrogen, then typecheck and `bob build`. Commit all of `nitrogen/generated/` and `bun.lock`. Never hand-edit generated files.
- [x] If the generated Swift fails to compile because of nitrogen 0.37.1's `RuntimeError.from(cppError:)` codegen, copy `/Volumes/CaseSensitive/GitHub/holocatch/patches/nitrogen@0.37.1.patch` into `patches/`, add `"patchedDependencies"` to `package.json`, and record a `> Deviation:` note.

#### 6. Example app (RN 0.87.1, UIScene, iOS 16.0, minSdk 28)
**Files**: `example/**`
**Changes**:
- [x] Generate the app: `bunx @react-native-community/cli@20.2.0 init NitroPasskeysExample --version 0.87.1 --directory example --package-name com.nitropasskeysexample --skip-install --skip-git-init`. The CLI's flags may have changed; check them with `--help`. Delete any `example/.git`, `example/yarn.lock` or `example/package-lock.json` it creates.
- [x] Set up `example/package.json` from `SHIM/example/package.json`:
  - `"name": "react-native-nitro-passkeys-example"`
  - add `"react-native-nitro-modules": "0.37.1"` to `dependencies`
  - `react-native-harness` and `@react-native-harness/{platform-android,platform-apple,ui}` at `^1.4.0`
  - add `babel-plugin-module-resolver ^5.0.2`
  - the scripts `test:harness:ios` (`react-native-harness --harnessRunner iphone-17`), `test:harness:android` (`react-native-harness --harnessRunner medium_phone_api_36.1`), `pod` (`bundle install && bundle exec pod install --project-directory=ios`) and `ios` (`react-native run-ios --simulator='iPhone 17'`)
- [x] Copy the local-linking files from IP, changing only the package name where needed: `example/react-native.config.js`, `example/babel.config.js`, `example/metro.config.js`, and `example/tsconfig.json` (with `paths` of `{"react-native-nitro-passkeys": ["../src"]}`)
- [x] Copy `SHIM/example/rn-harness.config.mjs`, changing `appRegistryComponentName` to `'NitroPasskeysExample'` and both `bundleId`s to `'com.nitropasskeysexample'`. Keep `process.env.HARNESS_IOS_VERSION ?? '26.4'`. Also copy `IP/example/jest.harness.config.mjs` and `IP/example/.harness/{manifest.js,setup.ts}`. Adjust `setup.ts` if it references image-pipeline code.
  > Deviation: hoisted node_modules: `example/android/settings.gradle` includeBuild paths, and `reactNativeDir`/`codegenDir`/`cliFile`/`hermesCommand` in `example/android/app/build.gradle`, point at `../../node_modules/...` (as SHIM). Copied from IP commit `7c96c4b` via `git show` (IP working tree is dirty).
- [x] **UIScene lifecycle**:
  - Replace `example/ios/NitroPasskeysExample/AppDelegate.swift` with `SHIM/example/ios/NitroShimmerTextExample/AppDelegate.swift`, verbatim. It creates no window.
  - Add `SceneDelegate.swift` from SHIM, with `withModuleName: "NitroPasskeysExample"`.
  - Add the `UIApplicationSceneManifest` block from `SHIM/.../Info.plist:40-56` to `example/ios/NitroPasskeysExample/Info.plist`.
  - Register `SceneDelegate.swift` in the app target's Sources build phase. Use the `xcodeproj` Ruby gem that ships with CocoaPods (`ruby -e 'require "xcodeproj"; …'`); never hand-edit `project.pbxproj`.
- [x] **Deployment target 16.0**: in `example/ios/Podfile`, change `platform :ios, min_ios_version_supported` to `platform :ios, '16.0'`. Set every `IPHONEOS_DEPLOYMENT_TARGET` in `example/ios/NitroPasskeysExample.xcodeproj/project.pbxproj` to `16.0`.
- [x] **Android minSdk 28**: in the `buildscript.ext` block of `example/android/build.gradle`, set `minSdkVersion = 28`. The module hard-codes 28, so 24 would fail the manifest merge.
- [x] Run `bun install` at the root, then `bun run --cwd example pod`, and commit `example/ios/Podfile.lock`.

#### 7. CI workflows (build-only for now)
**Files**: `.github/workflows/{static-checks,release,ios,android}.yml`
**Changes**:
- [x] Copy `IP/.github/workflows/static-checks.yml` and `release.yml` verbatim
- [x] Copy `IP/.github/workflows/ios.yml` with these changes:
  > Deviation: also removed IP-only `bun run verify:blur` step and `cpp/**`, `scripts/verify-blur*`, `GaussianBlur` path filters in the workflows; left `HARNESS_ENABLED`/`workflow_dispatch` input/"Note skipped harness tests" step for Phase 5.
  - `NitroImagePipelineExample` → `NitroPasskeysExample` everywhere
  - keep `runs-on: macos-26` and `xcode-version: 26.4`
  - **delete** the fixture-server step (`bun run fixtures` and the `localhost:8082/health` poll) and the `react-native-harness` action step; Phase 5 re-adds harness
  - rename the job display name to `Build (iOS)`
- [x] Copy `IP/.github/workflows/android.yml` with these changes:
  - `NitroImagePipelineExample`/`nitroimagepipelineexample` → `NitroPasskeysExample`/`nitropasskeysexample`
  - keep the `assembleDebug` step
  - **delete** the fixture-server step and the emulator-runner harness step
  - rename the job display name to `Build (Android)`

### Success Criteria

#### Automated Verification:
- [x] Install: `bun install`
- [x] Build (typecheck + bob): `bun run build`
- [x] Lint: `bunx oxlint --deny-warnings`
- [x] Format: `bunx oxfmt --check`
- [x] Nitrogen output is committed and current: `bunx nitrogen --logLevel="debug"` followed by `git status --porcelain nitrogen/` prints nothing new
- [x] Pods: `bun run --cwd example pod`
- [x] iOS build: `xcodebuild -workspace example/ios/NitroPasskeysExample.xcworkspace -scheme NitroPasskeysExample -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' build`
- [x] Android build: `example/android/gradlew -p example/android assembleDebug`

#### Manual Verification:
- [ ] `bun run --cwd example ios` launches the example on the iPhone 17 simulator (iOS 27.0), and the RN screen renders through `SceneDelegate`
- [ ] `bun run --cwd example android` launches on an emulator

---

## Phase 2: TypeScript layer and bun tests

### Overview
Implement the whole JS surface from SPEC §3.2–§3.4 and §6: the WebAuthn JSON types, shared
validation, response parsing, `PasskeyError`, and the public entry. Add every bun test from
SPEC §7 plus a wrapper test. This comes before the native phases because it fixes the error
token contract that Swift and Kotlin both emit.

### Recommended model
`sonnet` — well-specified pure TypeScript with exhaustive rules to transcribe and test.

### Effort
high (briefing guidance). The validation edge cases (base64url padding, `rpId: undefined`)
and two-way type assignability are easy to get subtly wrong. A mistake here breaks
credential lookup on the server.

### Depends on prior phases
- `package.json` has scripts `test: bun test src`, `typecheck: tsc --noEmit`, `build: bun run typecheck && bob build`, and devDependency `@simplewebauthn/server ^14.0.2`
- `tsconfig.build.json` excludes `src/**/__tests__` and is bob's typescript project
- `src/specs/nitro-passkeys.nitro.ts` exports `interface NitroPasskeys` with `readonly isSupported: boolean`, `create(creationOptionsJson: string): Promise<string>`, `get(requestOptionsJson: string): Promise<string>`
- `src/index.ts` is a placeholder (`export {};`)
- `.github/workflows/static-checks.yml` exists with steps `bun install --frozen-lockfile`, `bunx oxlint --deny-warnings`, `bunx oxfmt --check`, `bun run typecheck`

### Changes Required

#### 1. Types
**File**: `src/types.ts`
- [x] Create it **verbatim** from the SPEC §3.2 code block (SPEC lines 189-293), including the two deviation comments

#### 2. Validation
**File**: `src/validate.ts` (pure TS; no Node or React Native imports)
- [x] Export `isBase64URL(value: unknown): value is string`. It returns true only when `value` is a non-empty string, matches `/^[A-Za-z0-9_-]+={0,2}$/`, has an unpadded length with `% 4 !== 1`, and, when `=` padding is present, has a total length `% 4 === 0`. It rejects `+`, `/` and whitespace.
- [x] Export `base64URLByteLength(value: string): number` = `Math.floor(unpaddedLength * 3 / 4)`
- [x] Export `validateCreationOptions(options: unknown): string | undefined`. It returns a human-readable reason for the first failing rule, or `undefined`. The rules are exactly SPEC §3.4 "Creation options" (SPEC lines 363-371):
  > Deviation: stricter than spelled out: non-array `pubKeyCredParams`/`excludeCredentials`/`allowCredentials` are rejected; response `id`/`rawId`/`response.*` must be non-empty strings. `parse*Response` uses `??= {}` (a `null` `clientExtensionResults` also becomes `{}`).
  - `rp.id` missing, not a string or empty. A non-object `options` or `rp` also fails.
  - `challenge`, `user.id` or `user.name` missing or empty
  - `challenge`, `user.id` or any `excludeCredentials[].id` not base64url
  - `user.id` decodes to 0 bytes or more than 64 bytes
  - `pubKeyCredParams` is a non-empty array with no entry where `alg === -7`. An absent or empty array passes.
- [x] Export `validateRequestOptions(options: unknown): string | undefined`, covering SPEC lines 373-378:
  - `rpId` missing, `undefined` or empty. `{ rpId: undefined }` must fail.
  - `challenge` missing, empty or not base64url
  - any `allowCredentials[].id` not base64url
- [x] Export `validateRegistrationResponse(value: unknown): string | undefined` and `validateAuthenticationResponse(value: unknown): string | undefined`, covering SPEC lines 380-386: `id`/`rawId` missing or `id !== rawId`; `type !== 'public-key'`; missing required `response.*` fields

#### 3. Response parsing (the single path used by the entry and by `roundtrip.test.ts`)
**File**: `src/response.ts` (not re-exported from `index.ts`)
- [x] Export `parseRegistrationResponse(raw: string): RegistrationResponseJSON` and `parseAuthenticationResponse(raw: string): AuthenticationResponseJSON`. Each does the following:
  1. Run `JSON.parse`. On failure, throw `new PasskeyError('unknown', 'Malformed registration response: not JSON')` (or `authentication`).
  2. Run the matching `validate*Response`. On failure, throw `new PasskeyError('unknown', \`Malformed registration response: ${reason}\`)`.
  3. If `clientExtensionResults` is missing, set it to `{}`. This is the only change; don't add, remove or re-encode anything else.

#### 4. Error class
**File**: `src/PasskeyError.ts`
- [x] Implement it as specified in SPEC §3.3 and §6:
  ```ts
  export type PasskeyErrorCode =
    | 'canceled' | 'noCredentials' | 'alreadyRegistered' | 'domainNotAssociated'
    | 'unsupported' | 'invalidOptions' | 'unknown';

  const CODES: ReadonlySet<string> = new Set<PasskeyErrorCode>([/* all 7 */]);
  const TOKEN_RE = /\[Passkeys:([A-Za-z0-9-]+)\]\s?/;

  export class PasskeyError extends Error {
    readonly code: PasskeyErrorCode;
    constructor(code: PasskeyErrorCode, message: string) {
      super(message);
      this.name = 'PasskeyError';
      this.code = code;
    }
    /** Never throws. */
    static from(error: unknown): PasskeyError { /* see rules */ }
  }
  ```
  `from()` rules:
  - an existing `PasskeyError` is returned as the **same instance**
  - `message` is `error.message` for an `Error`, `String(error)` for a string, and `'Unknown error'` otherwise
  - token mapping:
    - `asauth-1001` → `canceled`
    - `asauth-1006` → `alreadyRegistered`
    - any other `asauth-<n>` → `unknown`
    - a named token that is in `CODES` → itself
    - anything else, or no token → `unknown`
  - the resulting message is the original with the `[Passkeys:<token>] ` marker removed. Keep any Nitro `"create: "` prefix and any fbjni text; don't strip anything else. If the result is empty, use the original.
  - wrap the whole body in `try/catch`, returning `new PasskeyError('unknown', 'Unknown error')` on the impossible path

#### 5. Public entry
**File**: `src/index.ts` (replace the placeholder)
- [x] Implement SPEC §3.3:
  ```ts
  import { NitroModules } from 'react-native-nitro-modules';
  import { PasskeyError } from './PasskeyError';
  import { parseAuthenticationResponse, parseRegistrationResponse } from './response';
  import type { NitroPasskeys } from './specs/nitro-passkeys.nitro';
  import type { /* option + response types */ } from './types';
  import { validateCreationOptions, validateRequestOptions } from './validate';

  const native = NitroModules.createHybridObject<NitroPasskeys>('NitroPasskeys'); // NOT exported

  export function isPasskeySupported(): boolean { return native.isSupported; }

  export async function createPasskey(options: PublicKeyCredentialCreationOptionsJSON): Promise<RegistrationResponseJSON> {
    if (!isPasskeySupported()) throw new PasskeyError('unsupported', 'Passkeys are not supported on this device');
    const reason = validateCreationOptions(options);
    if (reason) throw new PasskeyError('invalidOptions', reason);
    let raw: string;
    try { raw = await native.create(JSON.stringify(options)); } catch (e) { throw PasskeyError.from(e); }
    return parseRegistrationResponse(raw);
  }
  // getPasskey: same shape with validateRequestOptions / native.get / parseAuthenticationResponse

  export { PasskeyError } from './PasskeyError';
  export type { PasskeyErrorCode } from './PasskeyError';
  export type * from './types';
  ```
  Because the functions are `async`, a synchronous native throw still becomes a rejected promise carrying a `PasskeyError`.

#### 6. Bun tests
**Files**: `src/__tests__/*`
- [x] `PasskeyError.test.ts` covers every JS-mapped row of SPEC §6 (SPEC lines 554-575):
  - `asauth-1000`, `1001`, `1002`, `1003`, `1004`, `1005` and `1006`
  - an unknown numeric token (`asauth-1099` → `unknown`)
  - every named token, including `alreadyRegistered` and `domainNotAssociated`
  - an unknown named token (`bogus` → `unknown`)
  - a token after a Nitro prefix (`"create: [Passkeys:asauth-1001] The operation couldn't be completed."` → `canceled`, and the message keeps `"create: "` without the marker)
  - a token inside fbjni-style text (`"java.lang.Exception: [Passkeys:noCredentials] No credentials"`)
  - no token, which keeps the message
  - non-`Error` values (`undefined`, a string, `42`)
  - the same instance returned for a `PasskeyError`
- [x] `validate.test.ts` covers every §3.4 rule, both passing and failing. Build the passing cases from real simplewebauthn output (`import { generateRegistrationOptions, generateAuthenticationOptions } from '@simplewebauthn/server'`), mirroring WC's option sets:
  > Deviation: the "without rpID" case casts `{ allowCredentials: [] }` through `unknown` since v14 types require `rpID`.
  - registration: `rpID: 'example.com'`, `attestationType: 'none'`, `authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' }`, and a non-empty `excludeCredentials`
  - authentication: `allowCredentials: []` with `rpID`
  - authentication: `userVerification: 'required'` with a non-empty `allowCredentials`
  - padded and unpadded base64url
  - a 64-byte user id passes, while 65 bytes and 0 bytes fail
  - `generateAuthenticationOptions` without `rpID`, which must fail. It yields `rpId: undefined`.
  - `pubKeyCredParams: [{alg: -8, type: 'public-key'}]` fails; the default `[-8, -7, -257]` passes
  - `+`, `/` and whitespace in a challenge fail
- [x] `index.test.ts` tests the wrappers with no device, using the ASPEC `wrappers.test.ts` pattern (ASPEC lines ~464-484):
  - call `mock.module('react-native-nitro-modules', () => ({ NitroModules: { createHybridObject: () => fake } }))` **before** `const mod = await import('../index')`
  - `fake` has `isSupported` and `mock()`-backed `create`/`get`
  - cases:
    - `isSupported: false` → `unsupported`, and native is not called
    - invalid options → `invalidOptions`, and native is not called
    - a native rejection `"[Passkeys:asauth-1001] …"` → a `PasskeyError` with code `canceled`
    - a synchronous native throw → rejected with a `PasskeyError`
    - a non-JSON native result → `unknown`
    - a response with `id !== rawId` → `unknown`
    - a missing `clientExtensionResults` becomes `{}`
    - extra fields (`publicKey`, `publicKeyAlgorithm`, `authenticatorData`) pass through untouched
    - `JSON.stringify(options)` is what native receives
- [x] `roundtrip.test.ts`:
  > Deviation: uses Bun APIs (`Bun.Glob`, `Bun.file().json()`) instead of `node:fs`/`node:path`, which oxlint `no-nodejs-modules` rejects.
  - For each `fixtures/*-registration.json`, `parseRegistrationResponse(fixture.raw)` deep-equals `JSON.parse(fixture.raw)`, with `clientExtensionResults ?? {}` applied. `verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin, expectedRPID, requireUserVerification: false })` gives `verified: true`.
  - For each `*-authentication.json`, load its `registrationFixture`, verify that first, and build `credential: { id: registrationInfo.credential.id, publicKey: registrationInfo.credential.publicKey, counter: registrationInfo.credential.counter }`. Then `verifyAuthenticationResponse(...)` gives `verified: true`.
  - The fixture format is in this plan's "Shared fixture format" section; copy that JSON shape into a comment at the top of the test.
  - **When `src/__tests__/fixtures/` has no files, the suite registers a single `test.skip('no fixtures recorded yet — run example/server --record', …)`.** It must not fail. Don't create fixtures.
- [x] `types-compat.ts` (not a test file; checked by `tsc --noEmit`) asserts assignability at compile time, as in SPEC §7.4 (SPEC lines 645-651):
  > Deviation: uses `declare const` + exported bindings rather than `{} as` casts; all four types import from the `@simplewebauthn/server` root.
  ```ts
  import type * as SWA from '@simplewebauthn/server';
  import type * as Ours from '../types';
  const a = {} as SWA.PublicKeyCredentialCreationOptionsJSON; const _a: Ours.PublicKeyCredentialCreationOptionsJSON = a;
  const b = {} as SWA.PublicKeyCredentialRequestOptionsJSON;  const _b: Ours.PublicKeyCredentialRequestOptionsJSON = b;
  const c = {} as Ours.RegistrationResponseJSON;   const _c: SWA.RegistrationResponseJSON = c;
  const d = {} as Ours.AuthenticationResponseJSON; const _d: SWA.AuthenticationResponseJSON = d;
  export {};
  ```
  To satisfy `noUnusedLocals`, export the bindings or use `void`. If simplewebauthn doesn't re-export a type from its root, import it from `@simplewebauthn/server/esm/types` (check `WC`'s installed copy for the path).
- [x] Create an empty `src/__tests__/fixtures/.gitkeep`

#### 7. CI
**File**: `.github/workflows/static-checks.yml`
- [x] Add a `Test (bun)` step running `bun test src` after `Typecheck`, and add `'bunfig.toml'` to both `paths:` filters

### Success Criteria

#### Automated Verification:
- [x] Tests: `bun test src` (the roundtrip suite reports as skipped)
- [x] Typecheck, including `types-compat.ts`: `bun run typecheck`
- [x] Build: `bun run build`, and `ls lib/typescript/src` shows no `__tests__`
- [x] Lint: `bunx oxlint --deny-warnings`
- [x] Format: `bunx oxfmt --check`

#### Manual Verification:
- [ ] Review `src/index.ts` and confirm the HybridObject isn't exported and `export type * from './types'` exists

---

## Phase 3: iOS native implementation and XCTest target

### Overview
Replace the Swift stub with the real AuthenticationServices implementation (SPEC §4) and the
pure helpers. Add an XCTest target to the example app covering Base64URL, every iOS §6 row,
and the enum raw-value assumption.

### Recommended model
`opus` — delegate lifetimes, main-thread dispatch, Nitro's Swift `Promise` across concurrency
boundaries, and availability gating all need careful reasoning.

### Effort
high (briefing guidance). If the promise never settles or resolves twice, users get hangs or
crashes. Wrong base64url output breaks server credential lookup.

### Depends on prior phases
- `nitrogen/generated/ios/swift/HybridNitroPasskeysSpec.swift` declares `isSupported: Bool { get }`, `create(creationOptionsJson:) -> Promise<String>` and `get(requestOptionsJson:) -> Promise<String>`. Use its exact signatures.
- `ios/HybridNitroPasskeys.swift` exists as a stub that rejects with `[Passkeys:unknown] Not implemented`
- `NitroPasskeys.podspec` has `s.platforms = { :ios => '16.0' }`, `s.frameworks = 'AuthenticationServices'` and source glob `ios/**/*.{swift}`
- `example/ios/NitroPasskeysExample.xcworkspace`, the scheme `NitroPasskeysExample` and `example/ios/Podfile` (with `platform :ios, '16.0'` and `target 'NitroPasskeysExample' do … end`) exist, and the app builds for `iPhone 17`
- JS maps tokens as follows (`src/PasskeyError.ts`): `asauth-1001` → `canceled`, `asauth-1006` → `alreadyRegistered`, other `asauth-<n>` → `unknown`; named tokens are the `PasskeyErrorCode` members

### Changes Required

#### 1. Base64URL codec
**File**: `ios/Base64URL.swift`
- [x] Add `enum Base64URL` with:
  - `static func encode(_ data: Data) -> String`: `base64EncodedString()`, then `+`→`-` and `/`→`_`, then strip every `=`
  - `static func decode(_ string: String) -> Data?`:
    - returns `nil` for input that is empty or contains any character outside `[A-Za-z0-9_-=]`, which includes `+`, `/` and whitespace
    - strips trailing `=`
    - returns `nil` when the unpadded length is `% 4 == 1`
    - maps `-`→`+` and `_`→`/`, re-pads to a multiple of 4, then calls `Data(base64Encoded:)`

#### 2. Option and response JSON
**File**: `ios/PasskeyJSON.swift`
- [x] `Decodable` structs for the fields iOS uses (unknown keys are ignored by default):
  - `CreationOptions { rp: RP; user: User; challenge: String; excludeCredentials: [Descriptor]?; authenticatorSelection: Selection?; attestation: String? }`
  - `RP { id: String? }`
  - `User { id: String; name: String; displayName: String? }`
  - `Descriptor { id: String }`
  - `Selection { userVerification: String? }`
  - `RequestOptions { challenge: String; rpId: String?; allowCredentials: [Descriptor]?; userVerification: String? }`
- [x] `Encodable` response structs matching the JSON in SPEC §4 step 7 (SPEC lines 430-442) and `get` step 5 (SPEC lines 464-477). Make `userHandle` a `String?`: the synthesized `encodeIfPresent` omits it when it is `nil`. Encode with `JSONEncoder` and `outputFormatting = [.withoutEscapingSlashes]`.

#### 3. Error token mapper
**File**: `ios/PasskeyErrorToken.swift`
- [x] Add `enum PasskeyErrorToken`, a pure mapper with no UI, with `static func token(for error: Error) -> String`:
  - `let ns = error as NSError`
  - if `ns.domain == ASAuthorizationError.errorDomain`:
    - if `ns.code == ASAuthorizationError.Code.failed.rawValue` (1004) **and** `isDomainNotAssociated(ns)`, return `"domainNotAssociated"`
    - otherwise return `"asauth-\(ns.code)"`. There is no availability check; 1006 comes through as `asauth-1006`.
  - otherwise return `"unknown"`
- [x] Add `static func isDomainNotAssociated(_ error: NSError) -> Bool`. It returns true if `"is not associated with domain"` appears in `error.localizedDescription`, in `error.userInfo[NSLocalizedFailureReasonErrorKey] as? String`, or, applied recursively, in `error.userInfo[NSUnderlyingErrorKey] as? NSError`. Keep this string match in this one place.
- [x] Add `static func message(token: String, _ text: String) -> String`, which returns `"[Passkeys:\(token)] \(text)"`

#### 4. Hybrid object
**File**: `ios/HybridNitroPasskeys.swift` (replace the stub bodies)
- [x] `var isSupported: Bool { true }`
- [x] **In-flight guard.** Use a private `NSLock` and a `private var active: PasskeyRequest?`.
  - `create` and `get` first take the lock. If `active != nil`, return a rejected promise with `[Passkeys:unknown] A passkey request is already in progress`, without cancelling the first request.
  - Otherwise, store the new helper in `active` before any async work. This also retains the helper, because the controller holds its delegate weakly.
  - Clear `active` exactly once, when the request settles.
- [x] **Decoding.**
  > Deviation: option parsing lives in Sendable `RegistrationParameters`/`AssertionParameters` structs in `ios/PasskeyJSON.swift` (validated on the calling thread, before `active` is set); `RP` type renamed `RelyingParty` and response body structs un-nested (SwiftLint). Helper is `@MainActor` (both AS protocols are UI-actor isolated in the iOS 27 SDK). `HybridNitroPasskeys` is `@unchecked Sendable`, `active` only touched under the lock.
  - A `JSONDecoder` failure, or a `Base64URL.decode` that returns `nil` for the challenge, the user id or any excluded or allowed id, rejects with `[Passkeys:invalidOptions] …`.
  - A missing or empty `rp.id` (create) or `rpId` (get) also rejects with `invalidOptions`.
- [x] **create**, per SPEC §4 `create` steps 1–7 (SPEC lines 403-450):
  1. `ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpID)`, then `createCredentialRegistrationRequest(challenge:name:userID:)`
  2. set `displayName` if it is non-empty
  3. `userVerificationPreference = .init(rawValue: uv)` when `authenticatorSelection.userVerification` is present
  4. `attestationPreference = .init(rawValue: attestation ?? "none")`
  5. `if #available(iOS 17.4, *) { request.excludedCredentials = ids.map { ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: $0) } }`, only when the list is non-empty
  6. ignore `timeout`, `hints`, `attestationFormats`, `extensions`, `residentKey`, `requireResidentKey` and `authenticatorAttachment`
  7. On success, cast to `ASAuthorizationPlatformPublicKeyCredentialRegistration`; a different class → `[Passkeys:unknown] Unexpected credential type`.
     - If `rawAttestationObject` is `nil` or empty → `[Passkeys:unknown] Missing attestation object`.
     - Otherwise resolve with the encoded JSON: `id == rawId == Base64URL.encode(credentialID)`, `transports: ["internal","hybrid"]` and `clientExtensionResults: {}`.
     - `authenticatorAttachment`: when `#available(iOS 16.6, *)`, `.platform` → `"platform"`, `.crossPlatform` → `"cross-platform"`, and any other value → `"platform"`. Below 16.6 it is always `"platform"`.
- [x] **get**, per SPEC §4 `get` steps 1–5 (SPEC lines 454-481):
  1. `createCredentialAssertionRequest(challenge:)`
  2. `allowedCredentials` only if the list is non-empty
  3. set the UV preference in the same way as create
  4. ignore `timeout`, `hints` and `extensions`
  5. Cast to `ASAuthorizationPlatformPublicKeyCredentialAssertion`; a different class → `unknown`.
     - If `rawAuthenticatorData` or `signature` is **empty** `Data`, reject `[Passkeys:unknown] Missing authenticator data` or `… signature`. These properties are non-null in the SDK.
     - Omit `userHandle` when `userID` is `nil` or empty.
     - `authenticatorAttachment` follows the same rule as create.
- [x] **Helper**: add a `private final class PasskeyRequest: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding`. It holds the `Promise<String>`, the anchor window, an `onSettle` closure that clears `active`, and a `settled` flag so the promise resolves or rejects at most once.
  - `didCompleteWithAuthorization` builds the JSON as above.
  - `didCompleteWithError` rejects with `PasskeyErrorToken.message(token: PasskeyErrorToken.token(for: error), error.localizedDescription)`.
- [x] **Main thread and anchor**:
  - Return `Promise<String>()` (the manual API) and do all UI work inside `DispatchQueue.main.async { … }`.
  - Resolve the anchor first. Use the key window of the first `UIWindowScene` with `activationState == .foregroundActive`. If there is none, fall back to the first window of any connected `UIWindowScene`. If there is still none, reject with `[Passkeys:unknown] No window to present on` and clear `active`.
  - Then create `ASAuthorizationController(authorizationRequests: [request])`, set the helper as both `delegate` and `presentationContextProvider`, and call `performRequests()`. Don't use `.preferImmediatelyAvailableCredentials`.
  - `presentationAnchor(for:)` returns the stored window.

#### 5. XCTest target
**Files**: `scripts/add-ios-test-target.rb`, `example/ios/Podfile`, `example/ios/NitroPasskeysExampleTests/*.swift`
- [x] Write `scripts/add-ios-test-target.rb` using the `xcodeproj` gem, and commit it. It adds a `NitroPasskeysExampleTests` unit-test bundle target to `example/ios/NitroPasskeysExample.xcodeproj`:
  > Deviation: also sets `SWIFT_OBJC_INTEROP_MODE = objcxx` and `HEADER_SEARCH_PATHS += "${PODS_ROOT}/Headers/Private/NitroModules"` on the test target (C++-interop Swift modules); removes the pinned `Foundation.framework` ref the gem adds; deletes a stale `NitroPasskeysExampleTests` testable left in the scheme by the RN template before adding the real one.
  - host application `NitroPasskeysExample`, with `TEST_HOST` and `BUNDLE_LOADER` set
  - `IPHONEOS_DEPLOYMENT_TARGET = 16.0`
  - `GENERATE_INFOPLIST_FILE = YES`
  - `SWIFT_VERSION` equal to the app target's
  - a `NitroPasskeysExampleTests` group holding the test files
  - the target added to the `TestAction` testables of the shared `NitroPasskeysExample.xcscheme`

  Make the script idempotent: it exits 0 if the target already exists. Run it with `ruby scripts/add-ios-test-target.rb`.
- [x] In `example/ios/Podfile`, nest inside `target 'NitroPasskeysExample' do`:
  > Deviation: uses `inherit! :search_paths` instead of `:complete`: `:complete` linked every static pod into the test bundle twice, registering the NitroPasskeys HybridObject twice (abort). The test bundle resolves symbols via `BUNDLE_LOADER`.
  ```ruby
  target 'NitroPasskeysExampleTests' do
    inherit! :complete
  end
  ```
  In the existing `post_install`, after `react_native_post_install(...)`, enable testability on the pod:
  ```ruby
  installer.pods_project.targets.each do |t|
    next unless t.name == 'NitroPasskeys'
    t.build_configurations.each { |c| c.build_settings['ENABLE_TESTABILITY'] = 'YES' if c.name == 'Debug' }
  end
  ```
- [x] Add `example/ios/NitroPasskeysExampleTests/Base64URLTests.swift`, using `@testable import NitroPasskeys`:
  > Deviation: `EnumRawValueTests` passed, so `(rawValue:)` stays (no switch fallback). Test target links with two `ld` warnings (XCTest built for iOS 17.0 vs deployment 16.0); harmless.
  - an encode round-trip for data lengths 0–6, which covers every remainder
  - no `=` in the output
  - `+` and `/` never appear in the output (use bytes `0xfb 0xff 0xbf`)
  - decode accepts both padded and unpadded input
  - decode rejects `+`, `/`, whitespace and length `% 4 == 1`
- [x] Add `PasskeyErrorTokenTests.swift`:
  - `NSError(domain: ASAuthorizationError.errorDomain, code: n)` for n = 1000…1006 gives `asauth-<n>`. 1006 must give `asauth-1006`.
  - code 1004 with `NSLocalizedDescriptionKey` `"Application with identifier ABCDE.com.x is not associated with domain example.com"` → `domainNotAssociated`
  - the same text in `NSLocalizedFailureReasonErrorKey` → `domainNotAssociated`
  - the same text in an underlying error → `domainNotAssociated`
  - code 1004 with other text → `asauth-1004`
  - a non-ASAuthorization `NSError` → `unknown`
- [x] Add `EnumRawValueTests.swift`. It asserts that `ASAuthorizationPublicKeyCredentialUserVerificationPreference(rawValue: s) == .discouraged/.preferred/.required` for the matching WebAuthn string, and that `ASAuthorizationPublicKeyCredentialAttestationKind(rawValue:)` gives `.none/.direct/.indirect/.enterprise`. **If any assertion fails:** switch `HybridNitroPasskeys.swift` to an explicit `switch` mapping from the WebAuthn strings to those constants, keep the test (it now documents why), and record a `> Deviation:` note.
- [x] Run `bun run --cwd example pod`

#### 6. CI
**File**: `.github/workflows/ios.yml`
- [x] After the build step, add a step `Unit tests (XCTest)` that runs the same `xcodebuild` invocation with `test` instead of `build`, keeping the workspace, the scheme and the `iPhone 17` destination.

### Success Criteria

#### Automated Verification:
- [x] Pods: `bun run --cwd example pod`
- [x] XCTest: `xcodebuild test -workspace example/ios/NitroPasskeysExample.xcworkspace -scheme NitroPasskeysExample -destination 'platform=iOS Simulator,name=iPhone 17'`
- [x] The JS layer is unaffected: `bun test src`
- [x] Swift lint: `scripts/hooks/swiftlint.sh` (skip if `swiftlint` isn't installed, and say so)

#### Manual Verification:
- [ ] Reading the code confirms the in-flight guard rejects a second call without cancelling the first, and every exit path clears `active`

---

## Phase 4: Android native implementation and JUnit tests

### Overview
Replace the Kotlin stub with the Credential Manager implementation from SPEC §5. JSON passes
through untouched in both directions. Add the pure `PasskeyErrorToken.kt` mapper for every
Android row of SPEC §6, and JVM unit tests for it.

### Recommended model
`sonnet` — the logic is a straight pass-through plus a table-driven exception mapper.

### Effort
high (briefing guidance). Exception-class ordering matters, e.g. a DOM exception with
`InvalidStateError` means different things on create and on get, and the in-flight guard has
to release on every path.

### Depends on prior phases
- `android/build.gradle` has namespace `com.margelo.nitro.nitropasskeys`, a literal `minSdkVersion 28`, and the dependencies `androidx.credentials:credentials:1.6.0`, `androidx.credentials:credentials-play-services-auth:1.6.0` and `org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2`
- `android/src/main/java/com/margelo/nitro/nitropasskeys/HybridNitroPasskeys.kt` exists as a stub extending the generated `HybridNitroPasskeysSpec()`. Use the generated signatures in `nitrogen/generated/android/kotlin/com/margelo/nitro/nitropasskeys/HybridNitroPasskeysSpec.kt`.
- `example/android` builds with `assembleDebug`, and its `settings.gradle` includes the library as project `:react-native-nitro-passkeys`. Confirm with `example/android/gradlew -p example/android projects`.
- JS recognises these named tokens: `canceled`, `noCredentials`, `alreadyRegistered`, `domainNotAssociated`, `unsupported`, `invalidOptions`, `unknown`

### Changes Required

#### 1. Error token mapper
**File**: `android/src/main/java/com/margelo/nitro/nitropasskeys/PasskeyErrorToken.kt`
- [x] Add `object PasskeyErrorToken` with `fun token(error: Throwable): String`, a pure function with no Android framework calls. Check in this order, so each case is matched before the more general ones:
  1. `CreatePublicKeyCredentialDomException`:
     - `domError` `InvalidStateError` → `"alreadyRegistered"`
     - otherwise map with `domToken(domError)`
  2. `GetPublicKeyCredentialDomException`:
     - `domError` `InvalidStateError` → `"unknown"`
     - otherwise map with `domToken(domError)`
  3. `GetCredentialCancellationException` and `CreateCredentialCancellationException` → `"canceled"`
  4. `NoCredentialException` → `"noCredentials"`
  5. these → `"unsupported"`:
     - `CreateCredentialProviderConfigurationException`
     - `GetCredentialProviderConfigurationException`
     - `CreateCredentialNoCreateOptionException`
     - `CreateCredentialUnsupportedException`
     - `GetCredentialUnsupportedException`
  6. `IllegalArgumentException` and `org.json.JSONException` → `"invalidOptions"`. Keep the `JSONException` branch as a defensive mapping.
  7. anything else, including the `*InterruptedException` and `*UnknownException` classes → `"unknown"`

  `private fun domToken(d: DomError)`:
  - `NotAllowedError`, `AbortError` and `TimeoutError` → `"canceled"`
  - `SecurityError` → `"domainNotAssociated"`
  - `NotSupportedError` → `"unsupported"`
  - `DataError`, `EncodingError` and `SyntaxError` → `"invalidOptions"`
  - anything else → `"unknown"`

  The classes live in `androidx.credentials.exceptions.*`, `androidx.credentials.exceptions.publickeycredential.*` and `androidx.credentials.exceptions.domerrors.*`.
- [x] Add `fun message(error: Throwable): String`, which returns `"[Passkeys:${token(error)}] ${error.message ?: error.javaClass.simpleName}"`

#### 2. Hybrid object
**File**: `android/src/main/java/com/margelo/nitro/nitropasskeys/HybridNitroPasskeys.kt` (replace the stub bodies)
- [x] `override val isSupported: Boolean get() = Build.VERSION.SDK_INT >= 28`
- [x] Add `private val inFlight = AtomicBoolean(false)` and `private val mainScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)`
- [x] `create(creationOptionsJson)`:
  > Deviation: the `inFlight` guard, `Promise.async(mainScope)`, `[Passkeys:` passthrough and rethrow live in one private `runExclusive(block)` shared by `create` and `get`; behaviour as specified. A coroutine `CancellationException` is caught as `Throwable` and rethrown as `[Passkeys:unknown]`.
  - If `!inFlight.compareAndSet(false, true)`, return `Promise.rejected(Error("[Passkeys:unknown] A passkey request is already in progress"))`.
  - Otherwise return `Promise.async(mainScope) { try { … } finally { inFlight.set(false) } }`. Inside the `try`:
    - `val activity = NitroModules.applicationContext?.currentActivity ?: throw Error("[Passkeys:unknown] No current Activity")`
    - build `CreatePublicKeyCredentialRequest(requestJson = creationOptionsJson)` inside the `try`, because its constructor can throw `IllegalArgumentException`
    - call `CredentialManager.create(activity).createCredential(activity, request)`
    - cast to `CreatePublicKeyCredentialResponse` and return `registrationResponseJson` **verbatim**; a different type → `Error("[Passkeys:unknown] Unexpected response type")`
  - Catch `Throwable` and rethrow `Error(PasskeyErrorToken.message(e))`, but rethrow an error whose message already contains `[Passkeys:` as-is.
- [x] `get(requestOptionsJson)` has the same structure:
  - `GetCredentialRequest(listOf(GetPublicKeyCredentialOption(requestJson = requestOptionsJson)))`, then `getCredential(activity, request)`
  - `result.credential as? PublicKeyCredential ?: throw Error("[Passkeys:unknown] Unexpected credential type")`, then return `authenticationResponseJson` verbatim
- [x] Don't parse or rewrite the JSON in Kotlin

#### 3. JVM unit tests
**Files**: `android/build.gradle`, `android/src/test/java/com/margelo/nitro/nitropasskeys/PasskeyErrorTokenTest.kt`
- [x] In `android/build.gradle`:
  - add `testImplementation "junit:junit:4.13.2"`
  - add `testImplementation "org.json:json:20240303"`, because Android's `org.json` is a stub on the JVM
  - add `android { testOptions { unitTests.returnDefaultValues = true } }`
- [x] In `PasskeyErrorTokenTest.kt`, write one JUnit test per Android row of SPEC §6 (SPEC lines 564-572):
  - `CreatePublicKeyCredentialDomException(InvalidStateError(), "x")` → `alreadyRegistered`
  - `GetPublicKeyCredentialDomException(InvalidStateError(), "x")` → `unknown`
  - `NotAllowedError`, `AbortError` and `TimeoutError` on both the create and the get DOM exception → `canceled`
  - `SecurityError` → `domainNotAssociated`
  - `NotSupportedError` → `unsupported`
  - `DataError`, `EncodingError` and `SyntaxError` → `invalidOptions`
  - another DOM error (e.g. `NetworkError`) → `unknown`
  - both cancellation exceptions → `canceled`
  - `NoCredentialException` → `noCredentials`
  - each of the five unsupported classes → `unsupported`
  - `IllegalArgumentException` and `JSONException` → `invalidOptions`
  - `CreateCredentialInterruptedException`, `GetCredentialInterruptedException`, `CreateCredentialUnknownException`, `GetCredentialUnknownException` and `RuntimeException` → `unknown`
  - `message()` formats as `[Passkeys:<token>] <msg>`

#### 4. CI
**File**: `.github/workflows/android.yml`
- [x] Before `assembleDebug`, add a step `Unit tests (JUnit)` that runs `./gradlew :react-native-nitro-passkeys:testDebugUnitTest --no-daemon` from `example/android`

### Success Criteria

#### Automated Verification:
- [x] JUnit: `example/android/gradlew -p example/android :react-native-nitro-passkeys:testDebugUnitTest`
- [x] Android build: `example/android/gradlew -p example/android assembleDebug`
- [x] The JS layer is unaffected: `bun test src`
- [x] ktfmt check: `ktfmt --dry-run --set-exit-if-changed android/src` (skip if `ktfmt` isn't installed, and say so)

#### Manual Verification:
- [ ] Reading the code confirms `inFlight` is released on every path, including when the constructor throws and when there is no Activity

---

## Phase 5: Example flows, WebAuthn test server and harness suites

### Overview
Make the example app a real demo: a Bun `@simplewebauthn/server` script (SPEC §7
"example/server"), an `App.tsx` that registers and then logs in and shows the server's
verdict, Associated Domains entitlements, and harness suites for everything that needs no
system sheet. Then re-enable harness in CI.

### Recommended model
`sonnet` — standard app, server and test code with clear references (the WC flows and the IP
harness setup).

### Effort
medium (briefing guidance). This is typical implementation work; the only real uncertainty
is the spike cases, which the phase drops if needed.

### Depends on prior phases
- The public API in `src/index.ts`: `isPasskeySupported()`, `createPasskey(options)`, `getPasskey(options)`, `PasskeyError` (with `.code`) and the exported types
- `src/__tests__/roundtrip.test.ts` reads `src/__tests__/fixtures/{ios,android}-{registration,authentication}.json` in the "Shared fixture format" of this plan, and skips when there are none
- iOS and Android natives are fully implemented. Native errors arrive as `[Passkeys:<token>]` and map to `PasskeyError.code`.
- `example/` is RN 0.87.1 with bundle and package id `com.nitropasskeysexample`, links the library locally, has `rn-harness.config.mjs` (runners `iphone-17` and `medium_phone_api_36.1`), `jest.harness.config.mjs` and `.harness/setup.ts`, and has the `test:harness:{ios,android}` scripts
- `.github/workflows/ios.yml` and `android.yml` are build and unit-test only (the harness steps were removed)
- `@simplewebauthn/server ^14.0.2` is a root devDependency

### Changes Required

#### 1. Test server
**File**: `example/server/index.ts` (plus `example/server/README.md`)
- [x] Write a Bun script (`Bun.serve`) modelled on `WC/apps/web/app/api/_flows.ts` (the flows at `:116-120,182-194,232-251,306-334`) and `_webauthn.ts:40-49`:
  > Deviation: server sets `userDisplayName` to the username; `--record` fixture `options` is the options object the server sent, matched by challenge.
  - Env:
    - `RP_ID` (required)
    - `PORT` (default `8787`)
    - `EXPECTED_ORIGINS` (comma-separated; default `https://${RP_ID}` plus the computed Android origin)
    - `APPLE_APP_ID` (`TEAMID.com.nitropasskeysexample`)
    - `ANDROID_PACKAGE` (default `com.nitropasskeysexample`)
    - `ANDROID_CERT_SHA256` (colon hex; if unset, run `keytool -list -v -keystore example/android/app/debug.keystore -alias androiddebugkey -storepass android` and parse the `SHA256:` line)
  - At startup, print the computed `android:apk-key-hash:<base64url(sha256 bytes)>` origin, converted hex → bytes → unpadded base64url, exactly as `_webauthn.ts:45-46` does
  - Keep users and credentials in memory, and store the pending challenge per user
  - `POST /register/options` with `{ username }` calls `generateRegistrationOptions({ rpName, rpID, userName, attestationType: 'none', authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' }, excludeCredentials: <the user's stored credentials> })`
  - `POST /register/verify` calls `verifyRegistrationResponse({ …, requireUserVerification: false })`, stores `credential.id` verbatim, and returns `{ verified, … }`
  - `POST /login/options` calls `generateAuthenticationOptions({ rpID, allowCredentials: [], userVerification: 'preferred' })`
  - `POST /login/verify` finds the credential by exact `id` and calls `verifyAuthenticationResponse`
  - Print every verify result
  - `GET /.well-known/apple-app-site-association` returns `{"webcredentials":{"apps":[APPLE_APP_ID]}}` as `application/json`, with no redirect
  - `GET /.well-known/assetlinks.json` returns the SPEC §8.4 JSON (SPEC lines 709-718) for `ANDROID_PACKAGE` and the fingerprint
  - `--record`: after each successful verify, write `src/__tests__/fixtures/<platform>-<registration|authentication>.json` in this plan's "Shared fixture format". `platform` comes from the request body field `platform` that the app sends. `raw` is `JSON.stringify(<the response body the app posted>)`, and `registrationFixture` is set for authentication.
  - Document running it from the repo root with `bun example/server/index.ts --record` and exposing it over HTTPS at `RP_ID` with a tunnel
- [x] Add a root `package.json` script `"example:server": "bun example/server/index.ts"`

#### 2. Example app UI
**Files**: `example/App.tsx`, `example/src/config.ts`
- [x] `example/src/config.ts` exports `SERVER_URL` (default `'https://passkeys.example.com'`, with a comment saying to set it to `https://<RP_ID>`)
- [x] `App.tsx`:
  - a username `TextInput`
  - a **Register** button: `POST /register/options`, then `createPasskey(options)`, then `POST /register/verify` with `{ username, platform: Platform.OS, response }`
  - a **Log in** button, following the same pattern with `getPasskey`
  - show `isPasskeySupported()`, the server's verdict JSON and, on failure, `e instanceof PasskeyError ? e.code : 'non-PasskeyError'` plus the message
  - registering the same user twice is the manual `alreadyRegistered` check. Remove the `@react-native/new-app-screen` usage.

#### 3. iOS Associated Domains
**Files**: `example/ios/NitroPasskeysExample/NitroPasskeysExample.entitlements`, the project build settings
- [x] Create the entitlements file with `com.apple.developer.associated-domains` = `["webcredentials:$(PASSKEYS_RP_ID)?mode=developer"]`
- [x] In the app target's build settings, set `CODE_SIGN_ENTITLEMENTS` to that file and a user-defined `PASSKEYS_RP_ID = passkeys.example.com`, using the `xcodeproj` gem via a `ruby -e` one-off (not a committed script)
- [x] The iOS simulator build must still succeed with the default `PASSKEYS_RP_ID`

#### 4. Harness suites
**File**: `example/__tests__/passkeys.harness.ts`
- [x] Using `describe`/`it`/`expect` from `react-native-harness` (see `IP/example/__tests__/nitro-image-pipeline.harness.ts` for a non-UI example):
  - `isPasskeySupported()` returns `true`
  - `createPasskey` with an empty `rp.id` rejects with a `PasskeyError` whose code is `invalidOptions`
  - `getPasskey` with `rpId: undefined` → `invalidOptions`
  - an unpadded or invalid challenge (`'a+b'`) → `invalidOptions`
  - a user id over 64 bytes → `invalidOptions`
  - every rejection is `instanceof PasskeyError`
- [x] **Spike cases, where a sheet should not appear.** Race each against a 15-second timeout.
  - (iOS) `createPasskey` with `rp.id: 'nitro-passkeys-unassociated.invalid'` and valid other fields rejects with `domainNotAssociated`
  - (Android) `getPasskey` with `rpId: 'nitro-passkeys-unassociated.invalid'` rejects with one of `noCredentials`, `domainNotAssociated` or `unsupported` (assert the code is in that set)
  > Deviation: the Android spike was DELETED: on the Pixel_API_36 emulator it opened `CredentialChooserActivity` (a system sheet) and hung the run, so that path stays manual. The iOS spike is kept (`createPasskey` with an unassociated rp.id → `domainNotAssociated`, ~8 s, no sheet, passed 3/3 runs); the file records this in a comment.

  Run each spike locally. **If a case shows a system sheet or times out, delete it** and record a `> Deviation:` note saying the path stays manual. Don't commit a flaky test.

#### 5. CI harness
**Files**: `.github/workflows/ios.yml`, `.github/workflows/android.yml`
- [x] Re-add the harness steps from `IP/.github/workflows/ios.yml` and `android.yml` after the build and unit-test steps, renamed to `NitroPasskeysExample` and `com.nitropasskeysexample`:
  > Deviation: harness steps are gated on the existing `HARNESS_ENABLED` (var + `workflow_dispatch` input from IP), which already implements the `RUN_HARNESS_TESTS` kill-switch; the "Note skipped harness tests" steps remain. CI edits are unexecuted.
  - the `callstackincubator/react-native-harness@v1.2.0` action pointed at the built `.app` (iOS)
  - the `reactivecircus/android-emulator-runner@v2` block (Android)
  - the `RUN_HARNESS_TESTS` kill-switch

  **Leave out** the fixture-server start and poll steps, and the `adb reverse` for port 8082 (keep 8081). Rename the job display names back to `Harness Tests (iOS)` and `Harness Tests (Android)`.

### Success Criteria

#### Automated Verification:
- [x] Typecheck the root and the example: `bun run typecheck`, then `bunx tsc --noEmit -p example`
  > Deviation: TS 7.0.2 errors on `baseUrl` (TS5102), so `"baseUrl": "."` was removed from `example/tsconfig.json` (relative `paths` still resolve) and `server` added to its `exclude`; root `tsconfig.json` `include` gained `example/server/**/*` so the server is typechecked with bun types.
- [x] Lint and format: `bunx oxlint --deny-warnings` and `bunx oxfmt --check`
- [x] Bun tests still pass (roundtrip still skipped): `bun test src`
- [x] iOS build with entitlements: `xcodebuild -workspace example/ios/NitroPasskeysExample.xcworkspace -scheme NitroPasskeysExample -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' build`
- [x] Android build: `example/android/gradlew -p example/android assembleDebug`
- [x] The server starts and serves AASA: `env RP_ID=localhost ANDROID_CERT_SHA256=00:11 bun example/server/index.ts` in the background, then `curl -s localhost:8787/.well-known/apple-app-site-association` returns JSON; stop the server afterwards
- [x] iOS harness (app installed on the simulator first, via `bun run --cwd example ios`): `env HARNESS_IOS_VERSION=27.0 bun run --cwd example test:harness:ios`
- [x] Android harness (emulator `Medium_Phone_API_36.1` running with the app installed): `bun run --cwd example test:harness:android`
  > Deviation: ran on `Pixel_API_36` (5/5 passed, 2 runs) because `Medium_Phone_API_36.1` is ~92% full (`INSTALL_FAILED_INSUFFICIENT_STORAGE`); committed `rn-harness.config.mjs` still names `Medium_Phone_API_36.1` (CI uses a fresh AVD). iOS harness ran with `HARNESS_METRO_PORT=8082` (another Metro held 8081): 6/6 passed, 3 runs.

#### Manual Verification:
- [ ] Run the server over an HTTPS tunnel with `--record`, set `PASSKEYS_RP_ID` and `SERVER_URL` to its host, then register and log in on an iOS device. The server prints `verified: true` for both.
- [ ] Repeat on an Android device or emulator with Google Password Manager: register and log in, and both verify
- [ ] Dismiss the sheet and check the app shows `canceled`. Register the same user again and check for `alreadyRegistered` on iOS 18+, and on Android if the provider honours it.
- [ ] Commit the four recorded fixtures. `bun test src` then runs `roundtrip.test.ts` for real and passes.

---

## Phase 6: README

### Overview
Write the package README with all eight SPEC §8 items, adjusted for the decisions recorded in
this plan.

### Recommended model
`sonnet` — technical writing from a precise spec.

### Effort
medium (briefing guidance). The content is fully specified; the care needed is in accuracy
(the origin hash recipe, and which platform does what).

### Depends on prior phases
- The public API in `src/index.ts`: `isPasskeySupported`, `createPasskey`, `getPasskey`, `PasskeyError`, `PasskeyErrorCode` (7 members, including `alreadyRegistered`), and the exported WebAuthn types
- `android/build.gradle` hard-codes `minSdkVersion 28`; there is **no** `android/consumer-rules.pro`
- `NitroPasskeys.podspec` is iOS 16.0
- `example/server/index.ts` exists and is run with `bun run example:server`; `example/server/README.md` exists
- The error mapping is the SPEC §6 table (SPEC lines 554-575)

### Changes Required

#### 1. README
**File**: `README.md`
- [x] Write sections 1–8 exactly as SPEC §8 lists them (SPEC lines 686-749):
  > Deviation: README adds a 7-row error-code summary table before the condensed SPEC §6 table, documents the in-flight rejection and the extra iOS-ignored fields in Platform notes, and shows `bun run example:server --record` (no `--`). `oxfmt` ignores `README.md` (no target files), so it was hand-formatted, not formatter-checked. The iOS "Settings > Developer > Associated Domains Development" menu name was not verified against Apple docs.
  1. Install
  2. rpID equals domain
  3. iOS Associated Domains
  4. Android Digital Asset Links
  5. Android origin, with the hex → bytes → unpadded base64url recipe and a code snippet like `_webauthn.ts:45-46`
  6. Usage, showing simplewebauthn server calls with `rpID` passed to **both** option generators
  7. Errors: the §6 table plus the `catch` idiom, and `alreadyRegistered` guidance
  8. Platform notes
- [x] Deviation from SPEC: under Install, note that **no R8 rule is needed**, because `credentials-play-services-auth` ships its own. Don't mention a `consumer-rules.pro`.
- [x] Add a short "Example app & test server" section linking to `example/server/README.md`, including the `?mode=developer` note and how to set `PASSKEYS_RP_ID`
- [x] Add a "Development" section listing the real commands: `bun test src`, `bun run typecheck`, `bun run build`, `bun run codegen`, the XCTest `xcodebuild test …` command, `./gradlew :react-native-nitro-passkeys:testDebugUnitTest` (from `example/android`), and the `test:harness:*` scripts with `HARNESS_IOS_VERSION`

### Success Criteria

#### Automated Verification:
- [x] Every command in the README's "Development" section exists: `bun run` lists `typecheck`, `build`, `codegen`, `test` and `example:server`

#### Manual Verification:
- [ ] The README reads correctly against SPEC §8, and every code sample is valid

---

## Final Phase (Phase 7): Doc Drift Check

### Overview
After all feature phases are complete, reconcile the documentation with what was actually
built. Diff the whole run and update every doc statement it invalidated, and only those. This
is not a general doc cleanup. The plan and research files are a historical record and stay
untouched.

### Recommended model
`sonnet` — a mechanical comparison of the docs against the diff.

### Effort
medium — standard.

### Depends on prior phases
- All feature phases (1–6) are complete and committed on `main`
- Diff base: the repo had no commits when planning started, so diff against the empty tree with `git diff 4b825dc642cb6eb9a060e54bf8d69288fbee4904 HEAD`, which is the whole repo. The briefing carries the run's accumulated `> Deviation:` and `> Fix-up:` notes (for example, a dropped harness spike, an explicit enum mapping, or a nitrogen patch), so check docs against what was *actually* built.

### Changes Required

#### 1. Documentation sweep
**Files**: `README.md`, `example/server/README.md`, `example/README.md` (CLI-generated boilerplate), comments in `src/*.ts`, `ios/*.swift` and `android/src/**/*.kt`, and `.github/workflows/*.yml` comments
**Changes**:
- [ ] Check every `README.md` statement against the deviation notes. Examples: harness coverage (if a spike case was dropped), iOS enum handling, the nitrogen patch, and the actual server env var names and defaults.
- [ ] Update `example/server/README.md` to match `example/server/index.ts`: env vars, port, endpoints and the `--record` output paths
- [ ] Replace the CLI boilerplate in `example/README.md` with a short pointer to the root README's example section. It describes a generic app, which is stale.
- [ ] Update the CI workflow header comments copied from IP that mention image-pipeline, the fixture server or picsum
- [ ] Sweep the run's full diff for other stale docs, such as source comments describing changed behaviour or leftover image-pipeline names (`git grep -n -i 'image.pipeline\|NitroImage\|shimmer'`). Update them, or record "no further drift".

### Success Criteria

#### Automated Verification:
- [ ] No leftover template names: `git grep -n -i 'imagepipeline\|image-pipeline\|shimmer' -- ':!tasks/'` prints nothing (or only intentional attributions, noted)
- [ ] Format still clean: `bunx oxfmt --check`

#### Manual Verification:
- [ ] The updated docs read correctly and match the implemented behaviour

---

## Testing Strategy

### Unit Tests
- `src/__tests__/PasskeyError.test.ts`: the token → code mapping, prefix and fbjni tolerance, non-`Error` values, instance identity
- `src/__tests__/validate.test.ts`: every §3.4 rule against real simplewebauthn output; padding; the 64-byte cap; `rpId: undefined`
- `src/__tests__/index.test.ts`: the wrappers with a mocked HybridObject; the only normalisation is `clientExtensionResults`
- `src/__tests__/roundtrip.test.ts`: replays the recorded fixtures through the real parse path and simplewebauthn verify (skipped until fixtures exist)
- `src/__tests__/types-compat.ts`: two-way type assignability (`tsc`)
- `PasskeyErrorTokenTest.kt` (JVM): every Android §6 row
- `NitroPasskeysExampleTests` (XCTest): Base64URL, every iOS §6 row including 1006 and the domain string, enum raw values

### Integration Tests
- `example/__tests__/passkeys.harness.ts` on the simulator and emulator: loading, `isPasskeySupported`, JS validation through the real entry, and `PasskeyError` across the bridge, plus the unassociated-domain spikes where they work without a sheet

### Manual Testing Steps
1. Run `bun example/server/index.ts --record` behind an HTTPS tunnel, and set `PASSKEYS_RP_ID` and `SERVER_URL` to the tunnel host
2. iOS device: register, then log in. Both are verified; the fixtures are written.
3. Android: the same. The origin printed by the server matches the `clientDataJSON` origin.
4. Cancel the sheet → `canceled`. Register the same user twice → `alreadyRegistered` (iOS 18+ / supporting providers).
5. Commit the fixtures and run `bun test src`; roundtrip now runs.

## Performance Considerations
None significant: one request at a time; JSON pass-through; the Kotlin work runs on `Dispatchers.Main` only to hand off to suspend APIs that don't block.

## Rollback Strategy
Each phase is one commit on `main`; `git revert <sha>` undoes a phase. Phases 3 and 4 are independent of each other and can be reverted separately (the stubs return). Nothing is published, so there is nothing external to roll back.

## References
- Research: `tasks/2026-09-25-nitro-passkeys-v1/research.md` (no repo commit at planning time; reference repos stamped inside)
- Spec: `WC/tasks/2026-09-25-mobile-app-nitro-first/specs/react-native-nitro-passkeys.md`; sibling: `…/react-native-nitro-apple-sign-in.md`
- Templates: IP `7c96c4b`, SHIM `2fdef1a`
- Consumer flows: `WC/apps/web/app/api/_flows.ts`, `WC/apps/web/app/api/_webauthn.ts`
