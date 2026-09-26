// Minimal WebAuthn test server for the example app. Run from the repo root:
//   bun example/server/index.ts [--record]
// See example/server/README.md.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
  WebAuthnCredential,
} from '@simplewebauthn/server';

const RP_ID = process.env.RP_ID;
if (!RP_ID) {
  console.error('RP_ID is required, e.g. RP_ID=passkeys.example.com');
  process.exit(1);
}
const RP_NAME = 'Nitro Passkeys Example';
const PORT = Number(process.env.PORT ?? 8787);
const APPLE_APP_ID =
  process.env.APPLE_APP_ID ?? 'TEAMID.com.nitropasskeysexample';
const ANDROID_PACKAGE =
  process.env.ANDROID_PACKAGE ?? 'com.nitropasskeysexample';
const RECORD = process.argv.includes('--record');
const REPO_ROOT = join(import.meta.dir, '..', '..');
const FIXTURES_DIR = join(REPO_ROOT, 'src', '__tests__', 'fixtures');

function debugKeystoreFingerprint(): string {
  const result = Bun.spawnSync([
    'keytool',
    '-list',
    '-v',
    '-keystore',
    join(REPO_ROOT, 'example', 'android', 'app', 'debug.keystore'),
    '-alias',
    'androiddebugkey',
    '-storepass',
    'android',
  ]);
  const match = /SHA256:\s*([0-9A-F:]+)/i.exec(result.stdout.toString());
  if (!match) {
    throw new Error(
      'Could not read the debug keystore fingerprint; set ANDROID_CERT_SHA256',
    );
  }
  return match[1]!;
}

const ANDROID_CERT_SHA256 = (
  process.env.ANDROID_CERT_SHA256 ?? debugKeystoreFingerprint()
).toUpperCase();

// Credential Manager reports origin "android:apk-key-hash:<base64url(sha256)>".
const androidOrigin = `android:apk-key-hash:${Buffer.from(
  ANDROID_CERT_SHA256.replaceAll(':', ''),
  'hex',
).toString('base64url')}`;
const EXPECTED_ORIGINS = process.env.EXPECTED_ORIGINS
  ? process.env.EXPECTED_ORIGINS.split(',').map((o) => o.trim())
  : [`https://${RP_ID}`, androidOrigin];

console.log(`RP_ID:           ${RP_ID}`);
console.log(`Expected origins: ${EXPECTED_ORIGINS.join(', ')}`);
console.log(`Android origin:   ${androidOrigin}`);
if (RECORD) console.log(`Recording fixtures to ${FIXTURES_DIR}`);

interface User {
  id: Uint8Array<ArrayBuffer>;
  credentials: WebAuthnCredential[];
  challenge?: string;
}
const users = new Map<string, User>();
// Discoverable login does not name the user, so the challenge is keyed by itself.
const loginChallenges = new Set<string>();

type Platform = 'ios' | 'android';
type Fixture = Record<string, unknown>;
const registrationFixtureFile: Partial<Record<Platform, string>> = {};
const registrationOptionsSent = new Map<string, unknown>();
const loginOptionsSent = new Map<string, unknown>();

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function record(
  platform: unknown,
  kind: 'registration' | 'authentication',
  fixture: Fixture,
) {
  if (!RECORD) return;
  if (platform !== 'ios' && platform !== 'android') {
    console.warn(`--record: unknown platform ${String(platform)}, skipped`);
    return;
  }
  const file = `${platform}-${kind}.json`;
  const full: Fixture = { platform, kind, ...fixture };
  if (kind === 'registration') registrationFixtureFile[platform] = file;
  else full.registrationFixture = registrationFixtureFile[platform];
  const path = join(FIXTURES_DIR, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(full, null, 2)}\n`);
  console.log(`recorded ${path}`);
}

async function registerOptions(body: { username?: string }) {
  const username = body.username?.trim();
  if (!username) return json({ error: 'username required' }, 400);
  let user = users.get(username);
  if (!user) {
    user = {
      id: crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16))),
      credentials: [],
    };
    users.set(username, user);
  }
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID!,
    userName: username,
    userDisplayName: username,
    userID: user.id,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'preferred',
    },
    excludeCredentials: user.credentials.map((c) => ({
      id: c.id,
      transports: c.transports,
    })),
  });
  user.challenge = options.challenge;
  registrationOptionsSent.set(options.challenge, options);
  return json(options);
}

async function registerVerify(body: {
  username?: string;
  platform?: string;
  response?: RegistrationResponseJSON;
}) {
  const user = body.username ? users.get(body.username) : undefined;
  if (!user?.challenge || !body.response) {
    return json({ verified: false, error: 'no pending registration' }, 400);
  }
  const expectedChallenge = user.challenge;
  user.challenge = undefined;
  try {
    const verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: EXPECTED_ORIGINS,
      expectedRPID: RP_ID!,
      requireUserVerification: false,
    });
    console.log('register verify:', verification.verified, body.username);
    if (!verification.verified || !verification.registrationInfo) {
      return json({ verified: false });
    }
    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;
    user.credentials.push(credential); // credential.id stored verbatim
    record(body.platform, 'registration', {
      options: registrationOptionsSent.get(expectedChallenge),
      raw: JSON.stringify(body.response),
      expectedChallenge,
      expectedOrigin: EXPECTED_ORIGINS,
      expectedRPID: RP_ID,
    });
    return json({
      verified: true,
      credentialId: credential.id,
      credentialDeviceType,
      credentialBackedUp,
    });
  } catch (error) {
    console.log('register verify failed:', error);
    return json({ verified: false, error: String(error) }, 400);
  }
}

async function loginOptions() {
  const options = await generateAuthenticationOptions({
    rpID: RP_ID!,
    allowCredentials: [],
    userVerification: 'preferred',
  });
  loginChallenges.add(options.challenge);
  loginOptionsSent.set(options.challenge, options);
  return json(options);
}

async function loginVerify(body: {
  platform?: string;
  response?: AuthenticationResponseJSON;
}) {
  const response = body.response;
  if (!response) return json({ verified: false, error: 'no response' }, 400);
  let found: { username: string; credential: WebAuthnCredential } | undefined;
  for (const [username, user] of users) {
    const credential = user.credentials.find((c) => c.id === response.id);
    if (credential) found = { username, credential };
  }
  if (!found)
    return json({ verified: false, error: 'unknown credential' }, 400);
  // The challenge the client signed is inside clientDataJSON.
  const clientData = JSON.parse(
    Buffer.from(response.response.clientDataJSON, 'base64url').toString(),
  ) as { challenge: string };
  const expectedChallenge = clientData.challenge;
  if (!loginChallenges.delete(expectedChallenge)) {
    return json({ verified: false, error: 'unknown challenge' }, 400);
  }
  try {
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: EXPECTED_ORIGINS,
      expectedRPID: RP_ID!,
      credential: found.credential,
      requireUserVerification: false,
    });
    console.log('login verify:', verification.verified, found.username);
    if (verification.verified) {
      found.credential.counter = verification.authenticationInfo.newCounter;
      record(body.platform, 'authentication', {
        options: loginOptionsSent.get(expectedChallenge),
        raw: JSON.stringify(response),
        expectedChallenge,
        expectedOrigin: EXPECTED_ORIGINS,
        expectedRPID: RP_ID,
      });
    }
    return json({ verified: verification.verified, username: found.username });
  } catch (error) {
    console.log('login verify failed:', error);
    return json({ verified: false, error: String(error) }, 400);
  }
}

const assetLinks = [
  {
    relation: ['delegate_permission/common.get_login_creds'],
    target: {
      namespace: 'android_app',
      package_name: ANDROID_PACKAGE,
      sha256_cert_fingerprints: [ANDROID_CERT_SHA256],
    },
  },
];

Bun.serve({
  port: PORT,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    console.log(request.method, pathname);
    if (request.method === 'GET') {
      if (pathname === '/.well-known/apple-app-site-association') {
        return json({ webcredentials: { apps: [APPLE_APP_ID] } });
      }
      if (pathname === '/.well-known/assetlinks.json') return json(assetLinks);
      return json({ error: 'not found' }, 404);
    }
    if (request.method !== 'POST') return json({ error: 'not found' }, 404);
    let body: never;
    try {
      body = (await request.json()) as never;
    } catch {
      return json({ error: 'invalid JSON' }, 400);
    }
    switch (pathname) {
      case '/register/options':
        return registerOptions(body);
      case '/register/verify':
        return registerVerify(body);
      case '/login/options':
        return loginOptions();
      case '/login/verify':
        return loginVerify(body);
      default:
        return json({ error: 'not found' }, 404);
    }
  },
});

console.log(`Listening on http://localhost:${PORT}`);
