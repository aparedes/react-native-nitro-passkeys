# react-native-nitro-passkeys

WebAuthn passkeys for bare React Native, built on [Nitro Modules](https://nitro.margelo.com).
JSON in, JSON out: the option and response shapes are the standard WebAuthn JSON types, so they
plug straight into `@simplewebauthn/server` v14 (or any server that speaks WebAuthn JSON).

- iOS 16+ via `AuthenticationServices`
- Android minSdk 28 via Credential Manager

```ts
import {
  createPasskey,
  getPasskey,
  isPasskeySupported,
  PasskeyError,
} from 'react-native-nitro-passkeys';
```

## 1. Install

```sh
bun add react-native-nitro-passkeys react-native-nitro-modules
cd ios && pod install
```

`react-native-nitro-modules` is a peer dependency (`>=0.37.1 <0.38.0`).

Minimums: **iOS 16** and **Android minSdk 28**. The module has no lower-minSdk mode: a host app
with a `minSdkVersion` below 28 fails the manifest merge by design, so raise it to 28.

No R8/ProGuard rule is needed: `androidx.credentials:credentials-play-services-auth` ships its own.

## 2. The rpID must equal the domain

The `rp.id` in the creation options and the `rpId` in the request options must be **exactly** the
domain listed in the iOS `webcredentials:` entitlement and serving `assetlinks.json`: the bare
host, with no scheme and no port.

The rpID is **required**. The module rejects options without it (`invalidOptions`), so pass
`rpID` to `generateAuthenticationOptions` as well as `generateRegistrationOptions`.

## 3. iOS Associated Domains

1. Add `webcredentials:<rpID>` to the app's Associated Domains entitlement.
2. Serve `https://<rpID>/.well-known/apple-app-site-association` as `application/json`, over
   HTTPS, with no redirects:

   ```json
   { "webcredentials": { "apps": ["<TEAMID>.<bundle id>"] } }
   ```

3. During development, use the `?mode=developer` suffix (`webcredentials:<rpID>?mode=developer`)
   and enable Associated Domains Development on the device (Settings > Developer). This makes
   the device fetch the file directly from your server instead of through Apple's CDN.

## 4. Android Digital Asset Links

Serve `https://<rpID>/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.get_login_creds"],
    "target": {
      "namespace": "android_app",
      "package_name": "<applicationId>",
      "sha256_cert_fingerprints": ["<AA:BB:...>"]
    }
  }
]
```

List every signing certificate that installs the app: the debug keystore for development and the
**Play App Signing** key (not the upload key) for Play builds.

## 5. The Android origin

Android assertions carry the origin `android:apk-key-hash:<base64url(sha256(cert))>`, not
`https://<rpID>`. iOS uses `https://<rpID>` as its origin. Your server must therefore accept both:

```ts
expectedOrigin: ['https://example.com', 'android:apk-key-hash:...'];
```

Compute the hash from the certificate's SHA-256 fingerprint (the colon-separated hex that
`keytool -list -v` or the Play Console shows): hex, to bytes, to **unpadded** base64url.

```ts
const fingerprint = '4A:5B:...'; // SHA-256 cert fingerprint
const origin = `android:apk-key-hash:${Buffer.from(fingerprint.replaceAll(':', ''), 'hex').toString('base64url')}`;
```

Node and Bun's `'base64url'` encoding is already unpadded. If you compute it elsewhere, strip
the trailing `=` and use `-`/`_` instead of `+`/`/`. Add one origin per signing certificate.

## 6. Usage

Get options from your server, call `createPasskey` / `getPasskey`, then post the result back for
`verifyRegistrationResponse` / `verifyAuthenticationResponse`.

Server (`@simplewebauthn/server` v14), passing `rpID` to **both** option generators:

```ts
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';

const rpID = 'example.com';
const expectedOrigin = ['https://example.com', 'android:apk-key-hash:...'];

// POST /register/options
const registrationOptions = await generateRegistrationOptions({
  rpName: 'Example',
  rpID,
  userName: 'alice',
  excludeCredentials, // the user's existing credentials: { id, transports }[]
});

// POST /login/options
const authenticationOptions = await generateAuthenticationOptions({ rpID });

// POST /register/verify
const registration = await verifyRegistrationResponse({
  response, // the RegistrationResponseJSON posted by the app
  expectedChallenge,
  expectedOrigin,
  expectedRPID: rpID,
});

// POST /login/verify
const authentication = await verifyAuthenticationResponse({
  response, // the AuthenticationResponseJSON posted by the app
  expectedChallenge,
  expectedOrigin,
  expectedRPID: rpID,
  credential, // the stored credential: { id, publicKey, counter, transports }
});
```

App:

```ts
import {
  createPasskey,
  getPasskey,
  isPasskeySupported,
} from 'react-native-nitro-passkeys';

if (isPasskeySupported()) {
  // Register
  const options = await post('/register/options', { username: 'alice' });
  const registration = await createPasskey(options);
  await post('/register/verify', { username: 'alice', response: registration });

  // Sign in
  const requestOptions = await post('/login/options');
  const assertion = await getPasskey(requestOptions);
  await post('/login/verify', { response: assertion });
}
```

`isPasskeySupported()` is synchronous. `createPasskey` and `getPasskey` also reject with
`unsupported` when it is `false`. The option and response types
(`PublicKeyCredentialCreationOptionsJSON`, `RegistrationResponseJSON`, and so on) are exported
from the package.

## 7. Errors

Every rejection from `createPasskey` and `getPasskey` is a `PasskeyError` with a `code`:

| `code`                | Meaning                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `canceled`            | The user dismissed the sheet (iOS `ASAuthorizationError.canceled`; Android cancellation, or a DOM `NotAllowedError`/`AbortError`/`TimeoutError`). |
| `noCredentials`       | No matching passkey (Android `NoCredentialException`). iOS never returns this.                                                |
| `alreadyRegistered`   | An `excludeCredentials` entry matched (`createPasskey` only). See below.                                                      |
| `domainNotAssociated` | The rpID is not verified for this app (missing or wrong AASA / `assetlinks.json`).                                            |
| `unsupported`         | Passkeys unavailable: `isPasskeySupported()` is `false`, or no credential provider is available (Android).                    |
| `invalidOptions`      | The options failed validation (JS or native), for example a missing `rp.id` / `rpId` or invalid base64url.                    |
| `unknown`             | Anything else, including a concurrent request, a malformed native response and unmapped OS errors.                            |

```ts
import { createPasskey, PasskeyError } from 'react-native-nitro-passkeys';

try {
  await createPasskey(options);
} catch (e) {
  if (e instanceof PasskeyError) {
    if (e.code === 'canceled') return;
    if (e.code === 'alreadyRegistered') {
      showMessage('This device already has a passkey');
      return;
    }
  }
  throw e;
}
```

`alreadyRegistered` comes only from `createPasskey`. It means this device or credential provider
already holds one of the `excludeCredentials`. Show "this device already has a passkey" rather
than a generic failure.

Native mapping details:

| Platform | Native error                                                                                                                      | `code`                |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| iOS      | `ASAuthorizationError.canceled` (1001)                                                                                            | `canceled`            |
| iOS      | `.failed` (1004) whose description contains `is not associated with domain`                                                       | `domainNotAssociated` |
| iOS      | `.matchedExcludedCredential` (1006, iOS 18+, registration with `excludedCredentials` only)                                        | `alreadyRegistered`   |
| iOS      | other `ASAuthorizationError` codes (1000, 1002, 1003, 1004, 1005 and future codes)                                                | `unknown`             |
| iOS      | options JSON or base64url decode failure, missing `rp.id` / `rpId`                                                                | `invalidOptions`      |
| iOS      | missing attestation object, authenticator data or signature; wrong credential class; no window; a request already in progress     | `unknown`             |
| Android  | `Create/GetCredentialCancellationException`; DOM `NotAllowedError`, `AbortError`, `TimeoutError`                                  | `canceled`            |
| Android  | `NoCredentialException`                                                                                                           | `noCredentials`       |
| Android  | DOM `SecurityError` (rpID not verified against `assetlinks.json`)                                                                 | `domainNotAssociated` |
| Android  | provider configuration / unsupported / no-create-option exceptions; DOM `NotSupportedError`                                       | `unsupported`         |
| Android  | `IllegalArgumentException` or `JSONException` building the request; DOM `DataError`, `EncodingError`, `SyntaxError`               | `invalidOptions`      |
| Android  | `CreatePublicKeyCredentialDomException` `InvalidStateError` (an `excludeCredentials` match)                                       | `alreadyRegistered`   |
| Android  | interrupted / unknown exceptions, other DOM errors, non-passkey result, no Activity, request in progress, any other `Throwable`   | `unknown`             |
| JS       | `isPasskeySupported()` is `false`                                                                                                 | `unsupported`         |
| JS       | option validation failure                                                                                                         | `invalidOptions`      |
| JS       | unparseable or malformed native response JSON                                                                                     | `unknown`             |

## 8. Platform notes

- **`excludeCredentials` and `alreadyRegistered` depend on the platform:**
  - iOS 18+ and Android (when the credential provider honours the list) report a match as
    `alreadyRegistered`.
  - iOS 17.4 to 17.x honours the list but never reports a match as `alreadyRegistered`
    (typically `unknown`), because error 1006 does not exist before iOS 18.
  - iOS 16.0 to 17.3 ignores the list and registers anyway.

  Either way, the server must refuse duplicate registrations itself.

- iOS ignores `timeout`, `hints`, `attestationFormats`, `extensions`, `residentKey`,
  `requireResidentKey` and `authenticatorAttachment`, and always returns
  `clientExtensionResults: {}`.
- On iOS, `domainNotAssociated` detection is best-effort (a string match on the OS error).
- iOS never returns `noCredentials`; it shows the hybrid (QR code) sheet instead.
- Only one request can be in flight at a time. A second concurrent call rejects with `unknown`
  ("already in progress").
- Android passes the JSON through untouched, so its responses may carry extra fields
  (`publicKey`, `publicKeyAlgorithm`, `authenticatorData`). `@simplewebauthn/server` ignores them.
- On Android, `isPasskeySupported()` is `true` for SDK 28 and above.

## Example app & test server

`example/` is a bare React Native app that runs the full register and sign-in flows against
`example/server`, a small in-memory `@simplewebauthn/server` server that also serves the
`apple-app-site-association` and `assetlinks.json` files. See
[`example/server/README.md`](example/server/README.md) for the full details.

```sh
env RP_ID=passkeys.example.com APPLE_APP_ID=TEAMID.com.nitropasskeysexample \
  bun run example:server --record
```

Passkeys need HTTPS on the real `RP_ID`, so expose port `8787` (the default `PORT`) through a
tunnel whose host is `RP_ID`. Then:

- Set `SERVER_URL` in `example/src/config.ts` to `https://<RP_ID>`.
- iOS: set the `PASSKEYS_RP_ID` build setting on the app target in Xcode to `<RP_ID>`. The
  entitlement is `webcredentials:$(PASSKEYS_RP_ID)?mode=developer`, so enable Associated Domains
  Development on the device, and sign with your team.
- Android: the server reads the debug keystore fingerprint automatically (override with
  `ANDROID_CERT_SHA256`) and prints the computed `android:apk-key-hash:` origin on startup.

Server environment variables: `RP_ID` (required), `PORT` (`8787`), `EXPECTED_ORIGINS`,
`APPLE_APP_ID`, `ANDROID_PACKAGE`, `ANDROID_CERT_SHA256`.

`--record` writes real device output to `src/__tests__/fixtures/`; once committed,
`bun test src` runs `roundtrip.test.ts` against it (the test is skipped until the fixtures exist).

## Development

```sh
bun test src             # unit tests (validation, PasskeyError, response parsing)
bun run typecheck
bun run build
bun run codegen          # nitrogen + build
```

Native unit tests:

```sh
# iOS XCTest
xcodebuild test -workspace example/ios/NitroPasskeysExample.xcworkspace \
  -scheme NitroPasskeysExample -destination 'platform=iOS Simulator,name=iPhone 17'

# Android JUnit (run from example/android)
./gradlew :react-native-nitro-passkeys:testDebugUnitTest
```

[React Native Harness](https://www.react-native-harness.dev) integration tests exercise the
JS to Nitro to native path without system sheets: JS validation through the real entry point,
`PasskeyError` across the bridge, and (iOS only) an unassociated domain returning
`domainNotAssociated`:

```sh
env HARNESS_IOS_VERSION=27.0 bun run --cwd example test:harness:ios
bun run --cwd example test:harness:android
```

`HARNESS_IOS_VERSION` selects the simulator runtime (CI uses `26.4`).

Successful create/get ceremonies, `canceled`, `alreadyRegistered` and the Android
`domainNotAssociated` case cannot be driven without system sheets and are verified manually
with the example app and server.

## License

MIT
