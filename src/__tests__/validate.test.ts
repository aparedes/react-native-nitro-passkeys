import { describe, expect, test } from 'bun:test';

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
} from '@simplewebauthn/server';

import {
  base64URLByteLength,
  isBase64URL,
  validateAuthenticationResponse,
  validateCreationOptions,
  validateRegistrationResponse,
  validateRequestOptions,
} from '../validate';

function bytesToBase64URL(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

async function registrationOptions(overrides: Record<string, unknown> = {}) {
  return generateRegistrationOptions({
    rpName: 'Example',
    rpID: 'example.com',
    userName: 'alice',
    userID: new Uint8Array(16).fill(7),
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'preferred',
    },
    excludeCredentials: [{ id: bytesToBase64URL(new Uint8Array(32).fill(1)) }],
    ...overrides,
  });
}

describe('isBase64URL / base64URLByteLength', () => {
  test('accepts unpadded and padded values', () => {
    expect(isBase64URL('YWJj')).toBe(true);
    expect(isBase64URL('YWI')).toBe(true);
    expect(isBase64URL('YWI=')).toBe(true);
    expect(isBase64URL('YQ')).toBe(true);
    expect(isBase64URL('YQ==')).toBe(true);
    expect(isBase64URL('a-_b')).toBe(true);
  });

  test('rejects non-strings, empty, and bad characters', () => {
    expect(isBase64URL(undefined)).toBe(false);
    expect(isBase64URL(12)).toBe(false);
    expect(isBase64URL('')).toBe(false);
    expect(isBase64URL('=')).toBe(false);
    expect(isBase64URL('====')).toBe(false);
    expect(isBase64URL('ab+d')).toBe(false);
    expect(isBase64URL('ab/d')).toBe(false);
    expect(isBase64URL('ab cd')).toBe(false);
    expect(isBase64URL('ab\ncd')).toBe(false);
    expect(isBase64URL('YQ=A')).toBe(false);
  });

  test('rejects impossible lengths and bad padding', () => {
    expect(isBase64URL('Y')).toBe(false); // unpadded length % 4 === 1
    expect(isBase64URL('YWJjZ')).toBe(false);
    expect(isBase64URL('YQ=')).toBe(false); // padding present but total length % 4 !== 0
    expect(isBase64URL('YWJ==')).toBe(false);
    expect(isBase64URL('YQ===')).toBe(false); // more than two `=`
  });

  test('byte length ignores padding', () => {
    expect(base64URLByteLength('YQ')).toBe(1);
    expect(base64URLByteLength('YQ==')).toBe(1);
    expect(base64URLByteLength('YWI')).toBe(2);
    expect(base64URLByteLength('YWJj')).toBe(3);
  });
});

describe('validateCreationOptions', () => {
  test('passes real simplewebauthn output', async () => {
    const options = await registrationOptions();
    expect(options.excludeCredentials?.length).toBe(1);
    expect(validateCreationOptions(options)).toBeUndefined();
    // default pubKeyCredParams [-8, -7, -257] includes ES256
    expect(options.pubKeyCredParams.map((p) => p.alg)).toContain(-7);
  });

  test('passes without excludeCredentials and with padded base64url', async () => {
    const options = await registrationOptions({
      excludeCredentials: undefined,
    });
    expect(validateCreationOptions(options)).toBeUndefined();
    expect(
      validateCreationOptions({
        ...options,
        user: { ...options.user, id: 'YQ==' },
      }),
    ).toBeUndefined();
  });

  test('an absent or empty pubKeyCredParams passes', async () => {
    const options = await registrationOptions();
    expect(
      validateCreationOptions({ ...options, pubKeyCredParams: undefined }),
    ).toBeUndefined();
    expect(
      validateCreationOptions({ ...options, pubKeyCredParams: [] }),
    ).toBeUndefined();
  });

  test('rejects a non-object options and rp', async () => {
    const options = await registrationOptions();
    expect(validateCreationOptions(undefined)).toBeString();
    expect(validateCreationOptions('nope')).toBeString();
    expect(validateCreationOptions({ ...options, rp: undefined })).toBeString();
    expect(
      validateCreationOptions({ ...options, rp: 'example.com' }),
    ).toBeString();
  });

  test('rejects a missing or empty rp.id', async () => {
    const options = await registrationOptions();
    expect(
      validateCreationOptions({ ...options, rp: { name: 'Example' } }),
    ).toContain('rp.id');
    expect(
      validateCreationOptions({ ...options, rp: { name: 'Example', id: '' } }),
    ).toContain('rp.id');
    expect(
      validateCreationOptions({ ...options, rp: { name: 'Example', id: 3 } }),
    ).toContain('rp.id');
  });

  test('rejects missing or empty challenge, user.id and user.name', async () => {
    const options = await registrationOptions();
    expect(
      validateCreationOptions({ ...options, challenge: undefined }),
    ).toContain('challenge');
    expect(validateCreationOptions({ ...options, challenge: '' })).toContain(
      'challenge',
    );
    expect(
      validateCreationOptions({
        ...options,
        user: { ...options.user, id: '' },
      }),
    ).toContain('user.id');
    expect(
      validateCreationOptions({
        ...options,
        user: { ...options.user, id: undefined },
      }),
    ).toContain('user.id');
    expect(
      validateCreationOptions({
        ...options,
        user: { ...options.user, name: '' },
      }),
    ).toContain('user.name');
    expect(
      validateCreationOptions({
        ...options,
        user: { ...options.user, name: undefined },
      }),
    ).toContain('user.name');
    expect(
      validateCreationOptions({ ...options, user: undefined }),
    ).toBeString();
  });

  test('rejects non-base64url challenge, user.id and excludeCredentials ids', async () => {
    const options = await registrationOptions();
    expect(
      validateCreationOptions({ ...options, challenge: 'ab+d' }),
    ).toContain('challenge');
    expect(
      validateCreationOptions({ ...options, challenge: 'ab/d' }),
    ).toContain('challenge');
    expect(
      validateCreationOptions({ ...options, challenge: 'ab cd' }),
    ).toContain('challenge');
    expect(
      validateCreationOptions({
        ...options,
        user: { ...options.user, id: 'a+bc' },
      }),
    ).toContain('user.id');
    expect(
      validateCreationOptions({
        ...options,
        excludeCredentials: [{ id: 'a+bc', type: 'public-key' }],
      }),
    ).toContain('excludeCredentials');
    expect(
      validateCreationOptions({
        ...options,
        excludeCredentials: [{ type: 'public-key' }],
      }),
    ).toContain('excludeCredentials');
  });

  test('user.id byte limits: 64 passes, 65 and 0 fail', async () => {
    const options = await registrationOptions();
    const withUserId = (bytes: number) =>
      validateCreationOptions({
        ...options,
        user: {
          ...options.user,
          id: bytesToBase64URL(new Uint8Array(bytes).fill(9)),
        },
      });
    expect(withUserId(1)).toBeUndefined();
    expect(withUserId(64)).toBeUndefined();
    expect(withUserId(65)).toContain('user.id');
    expect(withUserId(0)).toContain('user.id');
    // padded form of 64 bytes (86 chars + `==`) is still 64 bytes
    const padded = `${bytesToBase64URL(new Uint8Array(64).fill(9))}==`;
    expect(
      validateCreationOptions({
        ...options,
        user: { ...options.user, id: padded },
      }),
    ).toBeUndefined();
  });

  test('pubKeyCredParams without ES256 fails', async () => {
    const options = await registrationOptions();
    expect(
      validateCreationOptions({
        ...options,
        pubKeyCredParams: [{ alg: -8, type: 'public-key' }],
      }),
    ).toContain('pubKeyCredParams');
    expect(
      validateCreationOptions({
        ...options,
        pubKeyCredParams: [
          { alg: -8, type: 'public-key' },
          { alg: -7, type: 'public-key' },
        ],
      }),
    ).toBeUndefined();
  });
});

describe('validateRequestOptions', () => {
  test('passes generateAuthenticationOptions with rpID and empty allowCredentials', async () => {
    const options = await generateAuthenticationOptions({
      rpID: 'example.com',
      allowCredentials: [],
    });
    expect(options.rpId).toBe('example.com');
    expect(validateRequestOptions(options)).toBeUndefined();
  });

  test('passes userVerification required with non-empty allowCredentials', async () => {
    const options = await generateAuthenticationOptions({
      rpID: 'example.com',
      userVerification: 'required',
      allowCredentials: [
        {
          id: bytesToBase64URL(new Uint8Array(32).fill(2)),
          transports: ['internal'],
        },
      ],
    });
    expect(options.allowCredentials?.length).toBe(1);
    expect(validateRequestOptions(options)).toBeUndefined();
  });

  test('fails without rpID (simplewebauthn yields rpId: undefined)', async () => {
    // v14 types require rpID, but at runtime omitting it yields `rpId: undefined`.
    const options = await generateAuthenticationOptions({
      allowCredentials: [],
    } as unknown as Parameters<typeof generateAuthenticationOptions>[0]);
    expect('rpId' in options ? options.rpId : undefined).toBeUndefined();
    expect(validateRequestOptions(options)).toContain('rpId');
    expect(validateRequestOptions({ ...options, rpId: undefined })).toContain(
      'rpId',
    );
    expect(validateRequestOptions({ ...options, rpId: '' })).toContain('rpId');
  });

  test('rejects a bad challenge', async () => {
    const options = await generateAuthenticationOptions({
      rpID: 'example.com',
    });
    expect(
      validateRequestOptions({ ...options, challenge: undefined }),
    ).toContain('challenge');
    expect(validateRequestOptions({ ...options, challenge: '' })).toContain(
      'challenge',
    );
    expect(validateRequestOptions({ ...options, challenge: 'ab+d' })).toContain(
      'challenge',
    );
    expect(validateRequestOptions({ ...options, challenge: 'ab/d' })).toContain(
      'challenge',
    );
    expect(
      validateRequestOptions({ ...options, challenge: 'ab cd' }),
    ).toContain('challenge');
    expect(
      validateRequestOptions({
        ...options,
        challenge: `${options.challenge}\n`,
      }),
    ).toContain('challenge');
  });

  test('rejects a bad allowCredentials id and non-object options', async () => {
    const options = await generateAuthenticationOptions({
      rpID: 'example.com',
    });
    expect(
      validateRequestOptions({
        ...options,
        allowCredentials: [{ id: 'a/bc', type: 'public-key' }],
      }),
    ).toContain('allowCredentials');
    expect(validateRequestOptions(null)).toBeString();
  });
});

describe('response validation', () => {
  const registration = {
    id: 'YWJj',
    rawId: 'YWJj',
    type: 'public-key',
    response: { clientDataJSON: 'YQ', attestationObject: 'Yg' },
    clientExtensionResults: {},
  };
  const authentication = {
    id: 'YWJj',
    rawId: 'YWJj',
    type: 'public-key',
    response: {
      clientDataJSON: 'YQ',
      authenticatorData: 'Yg',
      signature: 'Yw',
    },
    clientExtensionResults: {},
  };

  test('valid responses pass', () => {
    expect(validateRegistrationResponse(registration)).toBeUndefined();
    expect(validateAuthenticationResponse(authentication)).toBeUndefined();
  });

  test('shared failures', () => {
    for (const validate of [
      validateRegistrationResponse,
      validateAuthenticationResponse,
    ]) {
      const base =
        validate === validateRegistrationResponse
          ? registration
          : authentication;
      expect(validate(null)).toBeString();
      expect(validate('x')).toBeString();
      expect(validate({ ...base, id: undefined })).toBeString();
      expect(validate({ ...base, rawId: undefined })).toBeString();
      expect(validate({ ...base, rawId: 'YWJk' })).toContain('rawId');
      expect(validate({ ...base, type: 'password' })).toContain('public-key');
      expect(validate({ ...base, response: undefined })).toBeString();
    }
  });

  test('registration requires clientDataJSON and attestationObject', () => {
    expect(
      validateRegistrationResponse({
        ...registration,
        response: { attestationObject: 'Yg' },
      }),
    ).toContain('clientDataJSON');
    expect(
      validateRegistrationResponse({
        ...registration,
        response: { clientDataJSON: 'YQ' },
      }),
    ).toContain('attestationObject');
  });

  test('authentication requires clientDataJSON, authenticatorData and signature', () => {
    const { clientDataJSON, authenticatorData, signature } =
      authentication.response;
    expect(
      validateAuthenticationResponse({
        ...authentication,
        response: { authenticatorData, signature },
      }),
    ).toContain('clientDataJSON');
    expect(
      validateAuthenticationResponse({
        ...authentication,
        response: { clientDataJSON, signature },
      }),
    ).toContain('authenticatorData');
    expect(
      validateAuthenticationResponse({
        ...authentication,
        response: { clientDataJSON, authenticatorData },
      }),
    ).toContain('signature');
    expect(
      validateAuthenticationResponse({
        ...authentication,
        response: { clientDataJSON, authenticatorData, signature: '' },
      }),
    ).toContain('signature');
  });
});
