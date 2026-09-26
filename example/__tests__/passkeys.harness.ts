import { Platform } from 'react-native';
import { describe, expect, it } from 'react-native-harness';
import {
  createPasskey,
  getPasskey,
  isPasskeySupported,
  PasskeyError,
} from 'react-native-nitro-passkeys';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from 'react-native-nitro-passkeys';

const CHALLENGE = 'AAECAwQFBgcICQoLDA0ODw'; // 16 bytes, unpadded base64url

function creationOptions(
  overrides: Partial<PublicKeyCredentialCreationOptionsJSON> = {},
): PublicKeyCredentialCreationOptionsJSON {
  return {
    rp: { id: 'passkeys.example.com', name: 'Example' },
    user: { id: 'AQIDBAUGBwgJCgsMDQ4PEA', name: 'alice', displayName: 'alice' },
    challenge: CHALLENGE,
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    ...overrides,
  };
}

function requestOptions(
  overrides: Partial<PublicKeyCredentialRequestOptionsJSON> = {},
): PublicKeyCredentialRequestOptionsJSON {
  return {
    rpId: 'passkeys.example.com',
    challenge: CHALLENGE,
    ...overrides,
  };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  throw new Error('expected the promise to reject');
}

async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await rejection(promise);
  expect(error instanceof PasskeyError).toBe(true);
  expect((error as PasskeyError).code).toBe(code);
}

function withTimeout<T>(promise: Promise<T>, ms = 15_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms),
    ),
  ]);
}

describe('passkeys (no system sheet)', () => {
  it('reports support', () => {
    expect(isPasskeySupported()).toBe(true);
  });

  it('createPasskey rejects an empty rp.id', async () => {
    await expectCode(
      createPasskey(creationOptions({ rp: { id: '', name: 'Example' } })),
      'invalidOptions',
    );
  });

  it('getPasskey rejects a missing rpId', async () => {
    await expectCode(
      getPasskey(requestOptions({ rpId: undefined })),
      'invalidOptions',
    );
  });

  it('rejects an invalid challenge', async () => {
    await expectCode(
      createPasskey(creationOptions({ challenge: 'a+b' })),
      'invalidOptions',
    );
    await expectCode(
      getPasskey(requestOptions({ challenge: 'a+b' })),
      'invalidOptions',
    );
  });

  it('rejects a user id over 64 bytes', async () => {
    const id =
      'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE'; // 65 bytes
    await expectCode(
      createPasskey(
        creationOptions({ user: { id, name: 'alice', displayName: 'alice' } }),
      ),
      'invalidOptions',
    );
  });
});

// Spike: an unassociated rp.id rejects with `domainNotAssociated` on iOS without a
// sheet. The Android equivalent opens the Credential Manager chooser and hangs the
// run, so it stays manual.
if (Platform.OS === 'ios') {
  describe('passkeys (unassociated domain)', () => {
    it('createPasskey rejects with domainNotAssociated', async () => {
      await expectCode(
        withTimeout(
          createPasskey(
            creationOptions({
              rp: {
                id: 'nitro-passkeys-unassociated.invalid',
                name: 'Example',
              },
            }),
          ),
        ),
        'domainNotAssociated',
      );
    });
  });
}
