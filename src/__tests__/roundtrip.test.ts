// Replays fixtures recorded from a real device against @simplewebauthn/server.
//
// Fixture files: src/__tests__/fixtures/{ios,android}-{registration,authentication}.json
//
// {
//   "platform": "ios",                 // "ios" | "android"
//   "kind": "registration",            // "registration" | "authentication"
//   "options": { /* the options JSON the server sent */ },
//   "raw": "<the response JSON string exactly as the app posted it>",
//   "expectedChallenge": "<base64url>",
//   "expectedOrigin": ["https://<rpID>", "android:apk-key-hash:<hash>"],
//   "expectedRPID": "<rpID>",
//   "registrationFixture": "ios-registration.json" // authentication only: the registration it chains from
// }
import { describe, expect, test } from 'bun:test';

import {
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';

import {
  parseAuthenticationResponse,
  parseRegistrationResponse,
} from '../response';

interface Fixture {
  platform: 'ios' | 'android';
  kind: 'registration' | 'authentication';
  options: unknown;
  raw: string;
  expectedChallenge: string;
  expectedOrigin: string[];
  expectedRPID: string;
  registrationFixture?: string;
}

const FIXTURES_DIR = `${import.meta.dir}/fixtures`;

async function load(name: string): Promise<Fixture> {
  return (await Bun.file(`${FIXTURES_DIR}/${name}`).json()) as Fixture;
}

async function verifyRegistration(fixture: Fixture) {
  const response = parseRegistrationResponse(fixture.raw);
  const expected = JSON.parse(fixture.raw) as {
    clientExtensionResults?: unknown;
  };
  expected.clientExtensionResults ??= {};
  expect(response).toEqual(expected as never);
  return verifyRegistrationResponse({
    response,
    expectedChallenge: fixture.expectedChallenge,
    expectedOrigin: fixture.expectedOrigin,
    expectedRPID: fixture.expectedRPID,
    requireUserVerification: false,
  });
}

const files = [...new Bun.Glob('*.json').scanSync(FIXTURES_DIR)].toSorted();
const registrations = files.filter((name) =>
  name.endsWith('-registration.json'),
);
const authentications = files.filter((name) =>
  name.endsWith('-authentication.json'),
);

describe('roundtrip against @simplewebauthn/server', () => {
  if (files.length === 0) {
    test.skip('no fixtures recorded yet — run example/server --record', () => {});
    return;
  }

  for (const name of registrations) {
    test(`${name} verifies`, async () => {
      const verification = await verifyRegistration(await load(name));
      expect(verification.verified).toBe(true);
    });
  }

  for (const name of authentications) {
    test(`${name} verifies`, async () => {
      const fixture = await load(name);
      if (!fixture.registrationFixture)
        throw new Error(`${name} is missing registrationFixture`);
      const registration = await verifyRegistration(
        await load(fixture.registrationFixture),
      );
      expect(registration.verified).toBe(true);
      const { credential } = registration.registrationInfo!;

      const response = parseAuthenticationResponse(fixture.raw);
      const expected = JSON.parse(fixture.raw) as {
        clientExtensionResults?: unknown;
      };
      expected.clientExtensionResults ??= {};
      expect(response).toEqual(expected as never);

      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: fixture.expectedChallenge,
        expectedOrigin: fixture.expectedOrigin,
        expectedRPID: fixture.expectedRPID,
        credential: {
          id: credential.id,
          publicKey: credential.publicKey,
          counter: credential.counter,
        },
        requireUserVerification: false,
      });
      expect(verification.verified).toBe(true);
    });
  }
});
