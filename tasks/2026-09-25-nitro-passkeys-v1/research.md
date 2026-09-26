# Research: building `react-native-nitro-passkeys` v1 from its spec

**Date:** 2026-09-25 · **Branch:** main · **Commit:** none (empty repo, no commits yet)

Reference repos read (stamp these to detect drift):

| Repo | Path | Commit / branch |
|---|---|---|
| Template | `/Volumes/CaseSensitive/GitHub/react-native-nitro-image-pipeline` | `7c96c4b` |
| Consumer + specs | `/Volumes/CaseSensitive/GitHub/football/wc2018` | `311adb9` on `mobile-app/phase-3-v1-data-api` |
| Nitro 0.37.1 source | `/Volumes/CaseSensitive/GitHub/react-native-nitro-shimmer-text/node_modules/react-native-nitro-modules` (+ `nitrogen`) | installed 0.37.1 |
| iOS SDK | `iPhoneOS27.0.sdk` (Xcode 27.0, 27A266a) | — |
| androidx.credentials | Google Maven `credentials{,-play-services-auth}-1.6.0` sources/AARs | 1.6.0 |

In this doc:
- `WC` = `/Volumes/CaseSensitive/GitHub/football/wc2018`
- `IP` = the image-pipeline repo
- `NM` = the nitro-modules 0.37.1 package
- `SPEC` = `WC/tasks/2026-09-25-mobile-app-nitro-first/specs/react-native-nitro-passkeys.md`, the canonical spec, 757 lines
- `ASPEC` = the sibling `…/specs/react-native-nitro-apple-sign-in.md`
- `PLAN` = `WC/tasks/2026-09-25-mobile-app-nitro-first/orchestration-plan.md`

## Question

Research what the `react-native-nitro-passkeys` spec (`SPEC`, passed verbatim as the task) needs
before it is built. This repo is empty, so the research covers the templates it copies, the
consumer it must satisfy, and the external APIs it depends on.

## Summary

- **The repo is greenfield.** `git log` reports that `main` has no commits, and the working tree
  holds only `.git`.
- **Scaffolding comes from image-pipeline**, which the spec names as its template: `nitro.json`,
  podspec, `build.gradle` with `fix-prefab.gradle`, CMake, the cpp adapter, the `*Package.kt`
  shell, bob, semantic-release, lefthook, oxlint/oxfmt and the four workflows. Apart from its
  domain dependencies, image-pipeline is generic Nitro boilerplate.
- **Several things the spec asks for have no precedent in image-pipeline:**
  - bun unit tests under `src/__tests__`
  - the `[Prefix:token]` error wire format
  - `consumerProguardFiles`
  - a hard-coded `minSdkVersion`
  - XCTest and JUnit targets

  The sibling `ASPEC` defines the error format, the window anchor, the in-flight guard and the
  bun `mock.module` test pattern.
- **The consumer is `WC/apps/web`, which uses `@simplewebauthn/server` 14.0.2.**
  - All three non-admin option builders pass `rpID`.
  - Credential IDs are stored verbatim as base64url and looked up by exact string match.
  - `expectedOrigins()` already adds `android:apk-key-hash:` origins.
  - The simplewebauthn 14.0.2 type definitions match `SPEC` §3.2 field for field.
- **The external API facts the spec relies on hold up**, with small differences noted under
  Open questions:
  - Nitro 0.37.1 `Promise.async` on both platforms
  - `NitroModules.applicationContext`
  - the rejection message reaching JS verbatim
  - iOS SDK error 1006 (iOS 18)
  - `excludedCredentials` from iOS 17.4 through a category
  - `attachment` from iOS 16.6
  - the androidx.credentials 1.6.0 class names and `domError`

## How it works

### 1. Template: image-pipeline scaffolding (`IP`)

**`nitro.json`** (`IP/nitro.json:1-24`). It has exactly the shape `SPEC` §2 shows, including the
nested `autolinking.<Name>.{ios,android}.{language,implementationClassName}` and
`"ignorePaths": ["**/node_modules"]`.

**`package.json`:**
- **Entry fields** (`IP/package.json:5-9`):
  - `"main": "./lib/commonjs/index.js"`
  - `"module": "./lib/module/index.js"`
  - `"types": "./lib/typescript/src/index.d.ts"`
  - `"react-native": "src/index"`
  - `"source": "src/index"`
  - There is no `exports` field.
- **Scripts** (`:10-22`):
  - `typecheck: tsc --noEmit`
  - `lint: oxlint && oxfmt --check`
  - `lint:fix`, `format`, `clean`
  - `prepare: lefthook install || true`
  - `release: semantic-release`
  - `build: bun run typecheck && bob build`
  - `codegen: nitrogen --logLevel="debug" && bun run build`
  - There is no `test` script.
- **`files`** (`:32-52`) lists `react-native.config.js` and `app.plugin.js`, but neither file
  exists at the repo root.
- **Workspaces**: `["example"]` (`:53-55`).
- **Peers** (`:83-88`) are all `*`. Image-pipeline also peers on `react-native-nitro-image`.
- **devDependencies** (`:65-82`) pin `nitrogen 0.37.0`, `react-native-nitro-modules 0.37.0`,
  `react-native-builder-bob ^0.43.0`, `typescript ^7.0.2` and `semantic-release ^25.0.9`.
- **bob config** (`:93-106`): targets `commonjs`, `module`, and
  `typescript {project: tsconfig.json}`.
- It has no `packageManager` field. Bun's settings come from `bunfig.toml`, which contains
  `linker = "hoisted"`.

**Podspec** (`IP/NitroImagePipeline.podspec`):
- `s.platforms = { :ios => min_ios_version_supported, :visionos => 1.0 }`
- Source globs: `ios/**/*.{swift}`, `ios/**/*.{m,mm}` and `cpp/**/*.{hpp,cpp}`.
- Nitrogen is loaded with `load 'nitrogen/generated/ios/NitroImagePipeline+autolinking.rb'`
  followed by `add_nitrogen_files(s)`.
- The file ends with `install_modules_dependencies(s)`.
- The `NitroImage` dependency and the `spm_dependency` on Nuke are specific to image-pipeline.

**Android:**
- **Namespace**: `IP/android/build.gradle:39` sets
  `namespace "com.margelo.nitro.nitroimagepipeline"`.
- **SDK levels**: `getExtOrIntegerDefault()` at `IP/android/build.gradle:34-36` reads
  `rootProject.ext`, falling back to the `NitroImagePipeline_<name>` property. It supplies
  `minSdkVersion` at `:45`:
  `minSdkVersion getExtOrIntegerDefault("minSdkVersion")`. `SPEC` §2 explicitly moves away from
  this pattern and hard-codes 28.
- **Plugin order** (`:21-24`): `com.android.library`, then `org.jetbrains.kotlin.android`, then
  `apply from: '../nitrogen/generated/android/<Name>+autolinking.gradle'`, then
  `apply from: "./fix-prefab.gradle"`.
- **No proguard config**: there is no `consumerProguardFiles` anywhere.
- **Dependencies** (`:132-150`): `com.facebook.react:react-native:+` and
  `implementation project(":react-native-nitro-modules")`, plus Coil and Cronet, which are
  specific to image loading.
- **`android/gradle.properties`**:
  - `_kotlinVersion=2.1.20`
  - `_minSdkVersion=23`
  - `_targetSdkVersion=35`
  - `_compileSdkVersion=34`
  - `_ndkVersion=27.1.12297006`
- **`fix-prefab.gradle`** is generic prefab boilerplate that makes the prefab tasks depend on
  `externalNativeBuild`.
- **`CMakeLists.txt`** includes `../nitrogen/generated/android/<Name>+autolinking.cmake` at
  `:19`. Its blur sources and its `find_package(react-native-nitro-image)` at `:29,37` are
  specific to image-pipeline.
- **`cpp-adapter.cpp`** implements `JNI_OnLoad` and calls
  `margelo::nitro::<ns>::registerAllNatives()`.
- **`AndroidManifest.xml`** is an empty `<manifest>`.
- **`NitroImagePipelinePackage.kt`** is a `BaseReactPackage` shell. Its companion `init` calls
  `NitroImagePipelineOnLoad.initializeNative()`.

**JS entry:**
- `IP/src/NitroImagePipeline.ts` creates the hybrid object with
  `NitroModules.createHybridObject<NitroImagePipelineSpec>('NitroImagePipeline')`.
- `src/index.ts` re-exports that object. `SPEC` §3.3 differs here: the object must **not** be
  exported.
- The spec file is `src/specs/nitro-image-toolkit.nitro.ts`. At `:175-227` its interface extends
  `HybridObject<{ ios: 'swift'; android: 'kotlin' }>`.

**Native implementations:**
- **iOS**: `IP/ios/HybridNitroImagePipeline.swift:94` declares
  `class HybridNitroImagePipeline: HybridNitroImagePipelineSpec {`. At `:282-292`, methods return
  `Promise.async { … }` and fail with
  `throw RuntimeError.error(withMessage: "Invalid URL: \(url)")`. It never dispatches to the main
  thread.
- **Android**: `IP/android/src/main/java/com/margelo/nitro/nitroimagepipeline/HybridNitroImagePipeline.kt:47`
  declares `class HybridNitroImagePipeline : HybridNitroImagePipelineSpec()`. The context comes
  from `NitroModules.applicationContext as Context` at `:48-49`. Methods use
  `Promise.async { … }` (e.g. `:63-68`) and throw plain `Error(...)`.
- **Error handling**: neither platform uses a token or prefix error convention.

**Tests and example:**
- `IP` has no `src/__tests__` and no bun tests.
- Device tests are `react-native-harness` suites in `IP/example/__tests__/*.harness.ts(x)`.
- There is no XCTest target and no `android/src/test` JUnit directory.
- The example links the library locally, not through `package.json`:
  - `example/react-native.config.js` sets `root: ..`
  - `example/babel.config.js` has a module-resolver alias to `pak.source`
  - `metro.config.js` adds the repo root to `watchFolders`
  - `example/tsconfig.json` sets `paths`

**CI** (`IP/.github/workflows/`):
- **`static-checks.yml`**:
  - `bun install --frozen-lockfile`
  - `bunx oxlint --deny-warnings` (`:49`)
  - `bunx oxfmt --check` (`:52`)
  - `bun run typecheck` (`:55`)
  - It has no test step.
- **`android.yml`**: `./gradlew assembleDebug` in `example/android`, then a harness run on an
  emulator.
- **`ios.yml`**: on `macos-26`, `pod install`, `xcodebuild` for the simulator, then the harness.
- **`release.yml`**: triggered by `workflow_dispatch`. It runs `bun run build` and `bun release`
  with `NPM_CONFIG_PROVENANCE`.
- **`release.config.cjs`**: branches `main` and `next` (prerelease). The git assets are
  `package.json`, `CHANGELOG.md` and `example/package.json`.

**Other conventions:**
- `nitrogen/generated/` is committed. `IP/CLAUDE.md:49` reads "NEVER edit these files manually".
- `IP/post-script.ts` post-processes `NitroImagePipelineOnLoad.cpp`, but the `codegen` script
  does not call it.
- `lefthook.yml` runs:
  - pre-commit: oxfmt, oxlint, ktfmt and swiftlint
  - pre-push: `typecheck`, `ktfmt --dry-run` and swiftlint

### 2. Sibling spec `ASPEC` (the source of the patterns SPEC reuses)

- **Error wire format**: `ASPEC:340` defines `[AppleSignIn:<token>] <human-readable message>`,
  and `from()` uses the regex `/\[AppleSignIn:([A-Za-z0-9-]+)\]/` (`:346-352`). `SPEC` §6 is the
  same with the `Passkeys` prefix.
- **Window anchor** (`ASPEC:397-406`): the key window of the foreground-active `UIWindowScene`.
  If there is none, it falls back to the first window of any connected scene. If there is still
  none, it rejects with `unknown`.
- **Concurrency** (`ASPEC:425-427`): a second call made while one is in flight rejects
  immediately and does not cancel the first.
- **Tests**:
  - `src/__tests__/AppleSignInError.test.ts`
  - `src/__tests__/wrappers.test.ts` (`ASPEC:464-484`) uses
    `mock.module('react-native-nitro-modules', () => ({ NitroModules: { createHybridObject: () => fake } }))`,
    registered before a dynamic `await import('../index')`.
  - an XCTest of the token mapper in the example's iOS test target
- **`package.json`**:
  - Peers (`ASPEC:146-150`): `"react-native-nitro-modules": ">=0.37.1 <0.38.0"`.
  - devDependencies pin `nitrogen`/`react-native-nitro-modules` at `0.37.1`.
  - `files` (`:125-143`) adds `"!src/**/__tests__"` and drops the missing
    `react-native.config.js`/`app.plugin.js`.
- **Layout** (`ASPEC:23-65`) adds `.oxlintrc.json`, `.oxfmtrc.json` and `.swiftlint.yml`.

### 3. Consumer: `WC/apps/web` WebAuthn server (what the module's JSON must satisfy)

All the non-admin flows are in `WC/apps/web/app/api/_flows.ts`.

**Login options, `passkeyLoginOptionsFlow`** (`_flows.ts:116-120`):
- `generateAuthenticationOptions({ allowCredentials: [], rpID, userVerification: 'preferred' })`
- This is the discoverable, usernameless path `SPEC` §4 `get` step 2 refers to.

**Login verify** (`_flows.ts:182-194`):
- `verifyAuthenticationResponse` is called with:
  - `credential.id: passkey.credentialId`
  - `expectedOrigin: expectedOrigins(request)`
  - `expectedRPID: rpID`
  - `requireUserVerification: false`
- The lookup is verbatim. `:169` reads "The assertion's id is base64url exactly as stored —
  verbatim lookup."

**Register options, `passkeyRegisterOptionsFlow`** (`_flows.ts:232-251`):
- `attestationType: 'none'`
- `authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' }`
- `excludeCredentials: passkeys.map(p => ({ id: p.credentialId, transports }))`
- `rpID`
- `userID: webauthnUserHandle(...)`

**Register verify** (`_flows.ts:306-314`):
- `verifyRegistrationResponse` is called with `requireUserVerification: false`.
- `credential.id` is stored verbatim. `:328` reads "Already base64url — stored verbatim (never
  re-encoded)."
- `publicKey` is converted with `isoBase64URL.fromBuffer` (`:332`).
- `transports` is stored comma-joined (`:333`).

**Re-auth** (`_flows.ts:357-364`) uses:
- a non-empty `allowCredentials`
- `userVerification: 'required'`
- verify with `requireUserVerification: true` (`:442`)

**Admin routes** (`apps/web/app/api/adminPasskey{Login,Register}Options/route.ts`):
- `residentKey: 'discouraged'` and `userVerification: 'required'`.
- They verify against the single web `origin` only, so admin is web-only.

**Storage schema** (`WC/packages/db/src/schema.ts:239-258`):
- `credentialId: text('credential_id').primaryKey(), // base64url`
- `publicKey` is base64url COSE
- `transports` is comma-joined text

**rpID and origin:**
- `rpFromRequest()` at `WC/apps/web/app/api/_webauthn.ts:14-20` derives
  `rpID = new URL(getBaseUrl(request)).hostname`.
- `expectedOrigins()` at `_webauthn.ts:40-49` returns `[origin, ...androidCertFingerprints().map(hex => `android:apk-key-hash:${Buffer.from(hex.replaceAll(':',''),'hex').toString('base64url')}`)]`.
- The fingerprints come from the `ANDROID_CERT_SHA256` env var (`apps/web/app.config.ts:24`).

**Web client:**
- `@simplewebauthn/browser` 14.0.0 is used in `loginContext.tsx:262`, `PasskeysSection.tsx:67`,
  `ReauthPrompt.tsx:80`, `AdminLogin.tsx:89` and `SecurityTab.tsx:70`.
- The native module has to produce the same JSON these calls produce.

### 4. simplewebauthn 14.0.2 types and defaults (the contract §3.2 restates)

The installed package is at
`WC/node_modules/.bun/@simplewebauthn+server@14.0.2/node_modules/@simplewebauthn/server/`,
and its `package.json:3` reads `"version": "14.0.2"`.

**Type definitions** in `esm/types/index.d.ts`:
- `PublicKeyCredentialCreationOptionsJSON` (`:20-32`) and `PublicKeyCredentialRequestOptionsJSON`
  (`:37-45`) have exactly the fields and optionality in `SPEC` §3.2, and `rpId?` is optional.
- `PublicKeyCredentialUserEntityJSON` (`:49-53`) types `id` as `string`.
- `RegistrationResponseJSON` (`:66-73`) and `AuthenticationResponseJSON` (`:86-93`) require
  `clientExtensionResults`.
- `AuthenticatorAttestationResponseJSON` (`:100-107`) has `transports?: string[]`.
- `AuthenticatorAssertionResponseJSON` is at `:114-119`.
- `PublicKeyCredentialHint` is at `:164` and `AttestationFormat` at `:170`.

**Type definitions** in `esm/types/dom.d.ts`:
- `PublicKeyCredentialDescriptorJSON` (`:126-130`):
  `{ id: Base64URLString; transports?: string[]; type: string; }`
- `AuthenticationExtensionsClientInputs` (`:44-50`) has
  `prf?: AuthenticationExtensionsPRFInputs`.
- `AuthenticationExtensionsClientOutputs` (`:51-56`) has
  `credProps?: CredentialPropertiesOutput` and `prf?: AuthenticationExtensionsPRFOutputs`.
- `AuthenticatorTransport` (`:543`) is
  `"ble" | "hybrid" | "internal" | "nfc" | "usb"`.
- There is no `AuthenticatorTransportFuture` in 14.0.2.

**Defaults:**
- **`rpId` in `generateAuthenticationOptions`**: `esm/authentication/generateAuthenticationOptions.js:25`
  sets `rpId: rpID` unconditionally. The key is always present but can be `undefined`, and
  `JSON.stringify` then drops it. That matches "omits `rpId` unless given `rpID`" in `SPEC` §3.4
  only at the wire/JSON level. A JS object passed straight to `createPasskey` without going
  through JSON would carry `rpId: undefined`.
- **Algorithms in `generateRegistrationOptions`**: `esm/registration/generateRegistrationOptions.js:23-27`
  sets `defaultSupportedAlgorithmIDs` to `[EdDSA, ES256, RS256]`. `:28-29` prepends `ML_DSA_44`
  if `runtimeSupportsPQC()`.
- **`credProps`**: `:157-160` always merges `credProps: true` into `extensions`.

### 5. Nitro Modules 0.37.1 runtime (`NM`)

**Kotlin `Promise.async`** (`NM/android/src/main/java/com/margelo/nitro/core/Promise.kt:141-143`):
- Signature: `fun <T> async(scope: CoroutineScope = defaultScope, run: suspend () -> T)`.
- `defaultScope` is `CoroutineScope(Dispatchers.Default)` (`:130`).
- `Promise.rejected(error)` is at `:187`.
- The block is a suspend lambda, so the `suspend` `CredentialManager.createCredential` and
  `getCredential` can be called directly inside it.

**Kotlin application context** (`NM/android/src/main/java/com/margelo/nitro/NitroModules.kt:73-74`):
`var applicationContext: ReactApplicationContext? = null`. `currentActivity` comes from RN's
`ReactContext` and is not defined in `NM`.

**Swift `Promise`** (`NM/ios/core/Promise.swift`):
- `static func async(_ priority:, _ run: sending @escaping @isolated(any) () async throws -> T)`
  (`:121-135`) runs the closure in a `Task` and turns a thrown error into
  `reject(withError:)`.
- The manual API is `init()` (`:39-41`), `resolve(withResult:)` (`:55`) and
  `reject(withError:)` (`:77`).

**How an error message reaches JS:**
- **Promise rejections**: `NM/cpp/jsi/JSIConverter+Exception.hpp:40-42` builds
  `jsi::JSError(runtime, e.what())`, so the message arrives verbatim.
  - In Swift, `Error.toCpp()` in `NM/ios/core/RuntimeError.swift:41-44` uses
    `String(describing: self)`.
  - In Kotlin, the generated code wraps the `Throwable` in `jni::JniException`. That class's
    `what()` format is not confirmed; see Open questions.
- **Synchronous throws**: `NM/cpp/core/HybridFunction.hpp:120-124` prefixes the message with
  `"<funcName>: "`. `SPEC` §6's "token anywhere in the message" regex covers both paths.

**Codegen support**: nitrogen 0.37.1 supports `readonly` properties (`src/syntax/Property.ts:47-54`),
`boolean` (`BooleanType.ts`) and `Promise<T>` (`PromiseType.ts:9-15`).

### 6. iOS AuthenticationServices (iPhoneOS 27.0 SDK headers)

**Error codes** (`ASAuthorizationError.h`):
- 1000–1005 are `Unknown`, `Canceled`, `InvalidResponse`, `NotHandled`, `Failed` and
  `NotInteractive`. `NotInteractive` is available from iOS 15.
- `:24` reads
  `ASAuthorizationErrorMatchedExcludedCredential AS_API_AVAILABLE(ios(18.0), macos(15.0), visionos(2.0)) = 1006`.

**`excludedCredentials`:**
- It is declared on the protocol `ASAuthorizationWebBrowserPlatformPublicKeyCredentialRegistrationRequest`,
  which is `API_UNAVAILABLE(ios)`.
- `ASAuthorizationPlatformPublicKeyCredentialRegistrationRequest.h:44,46` adds a category that
  conforms to that protocol with `API_AVAILABLE(…, ios(17.4))`. That makes the property usable
  on iOS 17.4+, as `SPEC` §4 step 5 says.

**Request properties**: `displayName`, `userVerificationPreference` and `attestationPreference`
are on the `ASAuthorizationPublicKeyCredentialRegistrationRequest` protocol, available from
iOS 15.

**Credential properties:**
- On the registration, `rawAttestationObject` is `nullable`, and `attachment` is
  `API_AVAILABLE(ios(16.6))`.
- On the assertion, `rawAuthenticatorData`, `signature` and `userID` are **non-null** `NSData`,
  and `attachment` is available from iOS 16.6.

**Descriptor**: `ASAuthorizationPlatformPublicKeyCredentialDescriptor` has
`initWithCredentialID:(NSData *)`.

**Enum raw values**: the UV preference and attestation kind types are `NS_TYPED_EXTENSIBLE_ENUM`
`extern NSString *` constants. Their raw string values are not visible in the headers.

### 7. androidx.credentials 1.6.0 (checked in the published sources jar)

**Versions**:
- Google Maven `maven-metadata.xml` lists `1.6.0` as the newest stable, followed by
  `1.7.0-alpha01..03`.
- kotlinx-coroutines-android goes up to `1.10.2` in the 1.10 line and `1.11.0` overall, per
  Maven Central metadata.

**API names** (all confirmed):
- `CreatePublicKeyCredentialRequest(requestJson: String, …)`
- `CreatePublicKeyCredentialResponse.registrationResponseJson` (`CreatePublicKeyCredentialResponse.kt:29`)
- `GetPublicKeyCredentialOption(requestJson)` (`GetPublicKeyCredentialOption.kt:39`)
- `PublicKeyCredential.authenticationResponseJson` (`PublicKeyCredential.kt:31`)
- `suspend fun createCredential` and `suspend fun getCredential` (`CredentialManager.kt:257,108`)

**Exceptions:**
- **Create/Get DOM exceptions**: `Create/GetPublicKeyCredentialDomException(val domError: DomError, …)`
  (`exceptions/publickeycredential/*DomException.kt:39`).
- **DOM error classes** in `exceptions/domerrors/`: `InvalidStateError`, `NotAllowedError`,
  `AbortError`, `TimeoutError`, `SecurityError`, `NotSupportedError`, `DataError`,
  `EncodingError`, `SyntaxError` and others.
- **Other exception classes**, all in `exceptions/`:
  - `NoCredentialException`
  - `Create/GetCredentialCancellationException`
  - `CreateCredentialNoCreateOptionException`
  - `Create/GetCredentialProviderConfigurationException`
  - `Create/GetCredentialInterruptedException`
  - `Create/GetCredentialUnsupportedException`
  - `*UnknownException`

**Constructor validation:**
- `CreatePublicKeyCredentialRequest` parses `requestJson` in its constructor. Any failure is
  re-thrown as `IllegalArgumentException("user.name must be defined in requestJson")`
  (`CreatePublicKeyCredentialRequest.kt` around `:190-201`).
- `GetPublicKeyCredentialOption` fails with `require(RequestValidationHelper.isValidJSON(requestJson))`,
  an `IllegalArgumentException` (`:86`).
- Neither constructor lets a `JSONException` escape.

**Manifest and R8:**
- The `credentials` AAR manifest declares `minSdkVersion="23"`.
- The `credentials-play-services-auth` AAR **already ships a consumer `proguard.txt`**:
  `-if class androidx.credentials.CredentialManager` /
  `-keep class androidx.credentials.playservices.CredentialProviderPlayServicesImpl { *; }`.

### 8. Other consumers' constraints

- **`WC/apps/mobile`**:
  - React Native `0.87.1` (bare) (`apps/mobile/package.json:16`)
  - `minSdkVersion = 24` today (`apps/mobile/android/build.gradle:4`). `PLAN:1489` raises it to
    35 in a later phase.
  - iOS deployment target `15.1` (`WcMobile.xcodeproj/project.pbxproj:269`)
  - no `.entitlements` file
  - no Nitro dependency yet
- **Phase 9 of the plan:**
  - It reads `**Package:** <name>` from line 1 of each spec (`PLAN:2361-2365`).
  - It calls `getPasskey`, maps `canceled` to silence and `noCredentials` to a message
    (`PLAN:2428-2434`).
  - It adds `webcredentials:wc2018-aparedes-projects-c182351a.vercel.app` (`PLAN:2397-2402`).
- **HoloCatch**: `/Volumes/CaseSensitive/GitHub/holocatch/android/build.gradle:4` sets
  `minSdkVersion = 24`. It has no passkey or webauthn code.
- **npm** (checked 2026-09-25):
  - `npm view react-native-nitro-passkeys` returns `E404`.
  - `react-native-passkeys` is `0.4.2` with peer `expo >=53.0.0`.

## Existing patterns to mirror

- **Nitro scaffold files**: copy these from `IP`, renaming `NitroImagePipeline`/`nitroimagepipeline`
  and dropping the image dependencies:
  - `nitro.json`, the podspec, `android/build.gradle`
  - `fix-prefab.gradle`, `CMakeLists.txt`, `cpp-adapter.cpp`
  - `*Package.kt`, `Bridge.h`
  - `tsconfig.json`, `babel.config.js`, `bunfig.toml`
  - `lefthook.yml`, `release.config.cjs`, the workflows
- **Hybrid object creation**: `IP/src/NitroImagePipeline.ts`.
- **Native async**: `Promise.async { … throw … }`, as in `IP/ios/HybridNitroImagePipeline.swift:282-292`
  and `IP/android/.../HybridNitroImagePipeline.kt:63-68`.
- **Error wire format, window anchor, in-flight guard and bun `mock.module` tests**: `ASPEC:340-368`,
  `:397-406`, `:425-427` and `:464-484`.
- **Local example linking**: `IP/example/{react-native.config.js,babel.config.js,metro.config.js,tsconfig.json}`.
- **Server-side reference flows** for `example/server`: `WC/apps/web/app/api/_flows.ts`, plus
  `expectedOrigins()` in `_webauthn.ts:40-49` for computing the Android origin.

## Where a change would land

All of it goes in this repo, following the layout in `SPEC` §2. The specific points of contact
with the reference code are:

- **`android/build.gradle`**: this is where it departs from `IP`:
  - a literal `minSdkVersion 28` in place of `getExtOrIntegerDefault` (`IP/android/build.gradle:45`)
  - a new `consumerProguardFiles`
  - the credentials 1.6.0 and coroutines dependencies instead of Coil and Cronet
- **`NitroPasskeys.podspec`**: it drops `NitroImage`/Nuke and the `cpp/` glob, and sets iOS 16
  plus `AuthenticationServices`.
- **`package.json`**: the `IP` template changes as follows:
  - add `test: bun test src`
  - narrow the peers to `>=0.37.1 <0.38.0`
  - raise nitrogen and nitro-modules to 0.37.1
  - add `@simplewebauthn/server ^14.0.2` as a devDependency
  - use the `files` list from `ASPEC`, plus `android/consumer-rules.pro`
- **`static-checks.yml`**: add a `bun test src` step. `IP`'s version has none.
- **Test directories that `IP` lacks and need creating**:
  - an XCTest target in `example/ios`
  - `android/src/test` JUnit, run with `./gradlew :react-native-nitro-passkeys:testDebugUnitTest`

  The Android JUnit setup would need `testImplementation` dependencies, which `IP` does not have.
- **Contracts to respect:**
  - base64url values are produced unpadded and deterministic, because `WC` stores `credentialId`
    as the primary key and looks it up verbatim
  - `id === rawId`
  - `clientExtensionResults` is always present
  - the Android origin format matches `_webauthn.ts:45-46`

## Code references

- `IP/nitro.json:1-24` — autolinking shape
- `IP/package.json:10-22,32-52,93-106` — scripts, `files`, bob config
- `IP/NitroImagePipeline.podspec` — podspec skeleton
- `IP/android/build.gradle:21-24,34-36,39,45,132-150` — plugins, SDK helper, namespace, minSdk,
  dependencies
- `IP/android/src/main/cpp/cpp-adapter.cpp` — `JNI_OnLoad`
- `IP/src/NitroImagePipeline.ts` — `createHybridObject`
- `IP/ios/HybridNitroImagePipeline.swift:94,282-292` — Swift class and `Promise.async`
- `IP/android/.../HybridNitroImagePipeline.kt:47-49,63-68` — Kotlin class, context,
  `Promise.async`
- `IP/.github/workflows/static-checks.yml:49,52,55` — CI commands
- `ASPEC:340-368,397-406,425-427,464-484` — error format, anchor, guard, wrapper tests
- `WC/apps/web/app/api/_flows.ts:116-120,182-194,232-251,306-334,357-364` — option and verify
  flows
- `WC/apps/web/app/api/_webauthn.ts:14-20,40-49` — rpID, `expectedOrigins`
- `WC/packages/db/src/schema.ts:239-258` — passkeys table
- `@simplewebauthn/server@14.0.2/esm/types/index.d.ts:20-119`, `dom.d.ts:44-56,126-130,543` — JSON
  types
- `…/generateAuthenticationOptions.js:25`, `…/generateRegistrationOptions.js:23-29,157-160` —
  defaults
- `NM/android/.../core/Promise.kt:130,141-143,187`, `NM/.../NitroModules.kt:73-74` — Kotlin
  runtime
- `NM/ios/core/Promise.swift:39-41,55,77,121-135`, `NM/ios/core/RuntimeError.swift:41-44` — Swift
  runtime
- `NM/cpp/jsi/JSIConverter+Exception.hpp:40-42`, `NM/cpp/core/HybridFunction.hpp:120-124` —
  error message path
- iOS SDK `ASAuthorizationError.h:24`, `ASAuthorizationPlatformPublicKeyCredentialRegistrationRequest.h:44,46`
- androidx.credentials 1.6.0 `CreatePublicKeyCredentialResponse.kt:29`, `PublicKeyCredential.kt:31`,
  `GetPublicKeyCredentialOption.kt:39,86`, `*PublicKeyCredentialDomException.kt:39`,
  `CredentialManager.kt:108,257`

## Open questions

1. **R8 rule duplication.** `credentials-play-services-auth` 1.6.0 already ships a consumer
   `proguard.txt` that keeps `CredentialProviderPlayServicesImpl`. `SPEC` §2's
   `consumer-rules.pro` keeps the broader `androidx.credentials.playservices.**`. Is the module's
   own rule still wanted, and in the broader form? The broader form was only confirmed from
   secondary sources, not a primary Google doc.
2. **`JSONException` row in §6.** In 1.6.0, the request and option constructors turn every parse
   failure into `IllegalArgumentException`, so `JSONException` never reaches the caller. Keep the
   row as defensive, or drop it?
3. **Kotlin rejection message format.** On Android, a Kotlin `Throwable` reaches JS through
   fbjni's `JniException::what()`. Its exact format has not been checked; it likely includes the
   class name and possibly a stack trace. The `[Passkeys:token]` regex matches anywhere in the
   message, so the token survives. Does `PasskeyError.from` still need to strip that extra text
   from the human-readable message?
4. **iOS enum raw values.** `SPEC` §4 assumes the raw values of
   `ASAuthorizationPublicKeyCredentialUserVerificationPreference` and `AttestationKind` equal the
   WebAuthn strings (`"preferred"`, `"none"`, …). The headers only show `extern` constants, so
   this needs a runtime check, e.g. in the XCTest.
5. **Non-null assertion fields.** The iOS SDK declares `rawAuthenticatorData` and `signature` as
   non-null, so `SPEC` §4 `get` step 5's "if nil, reject" branch cannot trigger through Swift's
   type system. Should the check be for empty `Data` instead?
6. **`rpId` validation.** `generateAuthenticationOptions` always sets the `rpId` key
   (`generateAuthenticationOptions.js:25`). Without `rpID` its value is `undefined`, not absent.
   The §3.4 "missing or empty" check has to treat `undefined` as missing. That holds for JS objects
   passed directly as well as parsed JSON.
7. **`apps/mobile` minSdk timing.** `WC/apps/mobile` is at minSdk 24 today, and `PLAN:1489` raises
   it to 35. Adding the module before that phase lands would fail the manifest merge. Confirm the
   raise lands first.
8. **iOS 16 minimum on this app.** `SPEC`'s iOS 16 minimum is above `apps/mobile`'s deployment
   target of 15.1. Does the plan raise it, or does CocoaPods need the Podfile's platform raised?
9. **Nitro version pins.** `IP` pins nitro-modules and nitrogen 0.37.0, and its example uses 0.36.5.
   `SPEC` wants 0.37.1 with a `>=0.37.1 <0.38.0` peer. Confirm the example app pins 0.37.1 too.
10. **Test infrastructure.** `IP` has no JUnit, XCTest or bun test infrastructure to copy. The
    harness-based `android.yml`/`ios.yml` would need to be adapted to run
    `testDebugUnitTest`/XCTest. Is `react-native-harness` still wanted for this module?

## Follow-up: user decisions on the open questions (2026-09-26)

The user answered the numbered questions from the chat summary. Chat items 1–5 map to Open
questions 1–5 above. Chat item 7 (the mobile SDK floors) maps to Open questions 7 and 8. Chat
item 8 (the Nitro pin and test approach) maps to Open questions 9 and 10.

| # | Question | Decision |
|---|---|---|
| 1 | R8 rule | **Use the rule androidx.credentials ships.** `credentials-play-services-auth` 1.6.0's AAR `proguard.txt` keeps `CredentialProviderPlayServicesImpl` when `CredentialManager` is present. The module drops its own `consumer-rules.pro`, and with it the `consumerProguardFiles` line and the `files` entry that `SPEC` §2 lists. |
| 2 | `JSONException` row in §6 | **Keep it**, as a defensive mapping, even though 1.6.0 constructors throw `IllegalArgumentException` instead. |
| 3 | Strip fbjni text from the Kotlin rejection message | **No.** `PasskeyError.from` keeps whatever message text reaches it, apart from extracting the token. |
| 4 | iOS enum raw values | **Accepted.** Confirm at runtime that `ASAuthorizationPublicKeyCredentialUserVerificationPreference(rawValue:)` and `AttestationKind(rawValue:)` accept the WebAuthn strings. |
| 5 | Nil checks on non-null `rawAuthenticatorData`/`signature` | **Yes.** Check for **empty** `Data` instead, and reject with `[Passkeys:unknown] …`. |
| 7–8 | Raise `apps/mobile` SDK floors | **Already done.** On `WC` branch `mobile-app/phase-8-mobile-ci`, `apps/mobile/android/build.gradle:4` is `minSdkVersion = 35`, and all four `IPHONEOS_DEPLOYMENT_TARGET`s are `26.0`, from commit `251b01f` (Phase 4, "iOS 26 / API 35"). The `15.1`/`24` values in §8 above came from the older `mobile-app/phase-3-v1-data-api` checkout. Nothing is left to do. |
| 9 | Nitro version | **0.37.1** for the library devDependencies, the peer range `>=0.37.1 <0.38.0` and the example app. |
| 10 | Test infrastructure | **Prefer `react-native-harness`** where it can reach, because it tests the real JS → Nitro → native path. The scope is below. |

### Can react-native-harness test this module?

**Partly.** Harness runs `.harness.ts` suites inside the example app on a simulator or emulator,
against the real native build. `IP` already does this in CI. `IP/example/rn-harness.config.mjs`
defines the runners `medium_phone_api_36.1` (Android emulator) and `iphone-17` (`appleSimulator('iPhone 17', '26.4')`),
and `IP/.github/workflows/{ios,android}.yml` run them.

The `@react-native-harness/ui` interactions (`userEvent.press`, `screen.find*`) and
`render(...)` work on the app's own React Native overlay. They cannot tap **OS system sheets**:
the iOS passkey sheet with Face ID, or the Android Credential Manager bottom sheet. As a result,
**a full create/get ceremony that succeeds cannot run unattended in CI.** That path stays a manual
check through `example/server`, which records the fixtures that `roundtrip.test.ts` replays.

**What harness can cover on device:**
- **Loading**: the HybridObject loads through Nitro autolinking, and `isPasskeySupported()` returns
  `true`.
- **JS validation**: every §3.4 option rule rejects with `invalidOptions` before native is
  called. This also runs in bun, but on device it goes through the real entry.
- **Error format across the bridge**: a native rejection arrives as a `PasskeyError` with the
  right `code`. This settles Open question 3 empirically on the device.
- **Native failures that need no user interaction.** These are unconfirmed and need a spike:
  - iOS simulator: `createPasskey` with an rpID the example app is not associated with should
    fail at once with `.failed`, "…is not associated with domain…", which becomes
    `domainNotAssociated`.
  - Android emulator with no Google account or provider: create would likely raise
    `CreateCredentialNoCreateOptionException` or a provider-configuration exception, which becomes
    `unsupported`. Get would likely raise `NoCredentialException`, which becomes `noCredentials`.

  If these fail without showing a sheet, they test the Swift and Kotlin error mappers end to end.
- **The one-request-at-a-time guard**: only if the first request stays pending, meaning a sheet is
  up, long enough for the second call. This is timing-dependent and unconfirmed.

**What harness cannot reach:**
- a successful registration or assertion
- `canceled`
- `alreadyRegistered`
- the pure native helpers (`Base64URL`, `PasskeyErrorToken`) in isolation, because JS does not
  expose them

**Consequences for the test plan** (facts for the planning step, not a design):
- `SPEC` §7's XCTest target and `PasskeyErrorTokenTest.kt` are the only way to cover every
  §6 native row, including 1006 and each Android DOM error, and the `Base64URL` edge cases.
  - `testDebugUnitTest` runs on the JVM with no emulator.
  - XCTest needs a test target in `example/ios`, which `IP` does not have.
- The harness setup to copy from `IP`:
  - `example/rn-harness.config.mjs` and `example/jest.harness.config.mjs`
  - the devDependencies `react-native-harness`, `@react-native-harness/platform-{android,apple}`
    and `@react-native-harness/ui`, all `^1.4.0` (`IP/example/package.json:19,31-33`)
  - the scripts `test:harness:{ios,android}` (`:12-13`)
  - the harness steps in `ios.yml` and `android.yml`

## Follow-up: test approach settled; example app on Xcode 27 with UIScene lifecycle (2026-09-26)

### Decision: test approach

The user accepted the split described above:
- **`react-native-harness`** for the integration layer, on both platforms: loading,
  `isPasskeySupported`, JS validation, `PasskeyError` across the bridge, and native failures that
  need no sheet.
- **`PasskeyErrorTokenTest.kt`**, a JVM `testDebugUnitTest`, plus an **XCTest target** in
  `example/ios` for every §6 native row and the `Base64URL` edge cases.
- **Manual `example/server` runs** for successful ceremonies, `canceled` and
  `alreadyRegistered`. These runs also record the §7.3 fixtures.

### Decision: the example builds with Xcode 27 and uses the UIScene lifecycle

The user wrote "uiscreen", read here as **UIScene**, the scene-based app lifecycle. The
passkeys `example/` app targets **Xcode 27**, with `SceneDelegate` owning the window.

**Local toolchain** (checked 2026-09-26): Xcode 27.0 (27A266a) with the
`iPhoneOS27.0.sdk`. `xcrun simctl list runtimes` shows only **iOS 27.0** (`24A434`), and an
`iPhone 17` simulator exists.

**Template to copy:** shimmer-text's example (`/Volumes/CaseSensitive/GitHub/react-native-nitro-shimmer-text`,
commit `a3ebdbd`, "upgrade example to RN 0.87"). It is on RN `0.87.1`, the same version as
`WC/apps/mobile`, and already uses a scene delegate.
- `example/ios/NitroShimmerTextExample/AppDelegate.swift:7-24`:
  - `@main class AppDelegate: UIResponder, UIApplicationDelegate`
  - builds `RCTReactNativeFactory` and keeps it in `reactNativeFactory`
  - creates no window: `:22` reads `// The window is created per scene in SceneDelegate.`
  - `ReactNativeDelegate` at `:27-39` supplies `bundleURL()`
- `example/ios/NitroShimmerTextExample/SceneDelegate.swift:4-26`:
  - `class SceneDelegate: UIResponder, UIWindowSceneDelegate`
  - in `scene(_:willConnectTo:options:)`: `UIWindow(windowScene:)`, then
    `factory.startReactNative(withModuleName:in:launchOptions: nil)`
- `Info.plist:40-56`:
  - `UIApplicationSceneManifest`, with `UIApplicationSupportsMultipleScenes` set to `false`
  - `UIWindowSceneSessionRoleApplication`, with configuration name `Default Configuration` and
    `UISceneDelegateClassName` = `$(PRODUCT_MODULE_NAME).SceneDelegate`
- `WC/apps/mobile/ios/WcMobile/SceneDelegate.swift` is the same pattern. It also imports
  `React` and sets `appDelegate.window = window`.
- `IP/example/ios/SceneDelegate.swift` exists too, registered in its `project.pbxproj:15,28,47,253`,
  but it sits outside the app-target folder.

**Why this matters for the module.** `SPEC` §4 resolves the presentation anchor from the
foreground-active `UIWindowScene`'s key window, falling back to any connected scene's first
window. In the UIScene lifecycle, that window belongs to `SceneDelegate` and is not
`AppDelegate.window`, so the scene-based lookup is the one that works.

**Constraints for the Xcode 27 example** (facts, not design):
- **Deployment target.** RN 0.87.1's `min_ios_version_supported` returns `'15.1'`
  (`shimmer-text/node_modules/react-native/scripts/cocoapods/helpers.rb:83-85`). shimmer's
  example uses it: `platform :ios, min_ios_version_supported` in the Podfile, and
  `IPHONEOS_DEPLOYMENT_TARGET = 15.1` in `project.pbxproj:269`. `NitroPasskeys.podspec` declares
  iOS **16.0** (`SPEC` §2), so the example's Podfile platform and `IPHONEOS_DEPLOYMENT_TARGET`
  must be at least 16.0, or `pod install` rejects the pod.
- **Harness simulator version.** `IP/example/rn-harness.config.mjs` hard-codes
  `appleSimulator('iPhone 17', '26.4')`. shimmer uses
  `process.env.HARNESS_IOS_VERSION ?? '26.4'` (`rn-harness.config.mjs:24-27`). Neither default
  matches the only local runtime, which is **27.0**.
- **CI Xcode pin.** Both `IP/.github/workflows/ios.yml:104-108` and
  `shimmer/.github/workflows/harness-tests.yml:68-71` pin `maxim-lobanov/setup-xcode@v1` with
  `xcode-version: 26.4` on `runs-on: macos-26`. shimmer's `ios-build.yml:51` still uses
  `macOS-15`.
- **Swift version.** shimmer's example sets `SWIFT_VERSION = 5.0` (`project.pbxproj:284`).

### Open questions (new)

11. **Xcode 27 on CI.** Is Xcode 27 with an iOS 27 simulator runtime available on GitHub's
    `macos-26` runner image, or does CI stay on Xcode 26.4 while local development uses 27? This
    decides the `setup-xcode` pin and the harness default of `27.0` vs `26.4`. `HARNESS_IOS_VERSION`
    could bridge the two.
12. **Example deployment target.** Should the example use **16.0**, matching the module's floor so
    it can exercise the pre-17.4 `excludeCredentials` path on an old device, or **26.0**, matching
    `WC/apps/mobile`?

### Decisions on Open questions 11–12 (2026-09-26)

11. **CI Xcode doesn't matter.** Local builds need the UIScene lifecycle because Xcode 27
    requires it. The same scene setup also builds under Xcode 26, so CI can keep the templates'
    `xcode-version: 26.4` pin and an iOS 26.4 harness simulator. The harness config should take
    the version from `process.env.HARNESS_IOS_VERSION`, as shimmer does, so local runs can use
    `27.0`.
12. **The example's deployment target is 16.0**, matching the module's floor. Set it in both the
    Podfile `platform :ios` and `IPHONEOS_DEPLOYMENT_TARGET`.
