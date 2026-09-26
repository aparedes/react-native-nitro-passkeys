# Example WebAuthn server

A tiny in-memory `@simplewebauthn/server` v14 server for the example app. It
serves the registration and login flows, the iOS `apple-app-site-association`
file and the Android `assetlinks.json`.

## Run

From the repo root:

```sh
env RP_ID=passkeys.example.com APPLE_APP_ID=TEAMID.com.nitropasskeysexample \
  bun example/server/index.ts --record
```

(or `bun run example:server`). Passkeys require HTTPS on the real `RP_ID`, so
expose port `8787` through a tunnel (Cloudflare Tunnel, ngrok, ...) whose host is
`RP_ID`. Then point the app at it:

- `example/src/config.ts`: set `SERVER_URL` to `https://<RP_ID>`.
- iOS: set the `PASSKEYS_RP_ID` build setting on the app target to `<RP_ID>`
  (the entitlement is `webcredentials:$(PASSKEYS_RP_ID)?mode=developer`, so
  enable Associated Domains Development on the device), and sign with your team.
- Android: the server reads the debug keystore fingerprint automatically.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `RP_ID` | required | Relying party id (the tunnel host) |
| `PORT` | `8787` | Listen port |
| `EXPECTED_ORIGINS` | `https://$RP_ID` and the Android origin | Comma-separated accepted origins |
| `APPLE_APP_ID` | `TEAMID.com.nitropasskeysexample` | Served in the AASA file |
| `ANDROID_PACKAGE` | `com.nitropasskeysexample` | Served in `assetlinks.json` |
| `ANDROID_CERT_SHA256` | read from `example/android/app/debug.keystore` via `keytool` | Colon-hex signing cert fingerprint |

The startup log prints the computed `android:apk-key-hash:<...>` origin.

## Endpoints

- `POST /register/options` `{ username }`
- `POST /register/verify` `{ username, platform, response }`
- `POST /login/options`
- `POST /login/verify` `{ platform, response }`
- `GET /.well-known/apple-app-site-association`
- `GET /.well-known/assetlinks.json`

Every verify result is printed.

## `--record`

After each successful verify, the server writes
`src/__tests__/fixtures/<ios|android>-<registration|authentication>.json`
(`platform` is the field the app sends). Register, then log in, on each
platform, and commit the four files: `bun test src` then runs
`roundtrip.test.ts` against real device output.
