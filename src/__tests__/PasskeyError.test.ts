import { describe, expect, test } from 'bun:test';

import { PasskeyError, type PasskeyErrorCode } from '../PasskeyError';

describe('PasskeyError.from', () => {
  const numeric: [string, PasskeyErrorCode][] = [
    ['asauth-1000', 'unknown'],
    ['asauth-1001', 'canceled'],
    ['asauth-1002', 'unknown'],
    ['asauth-1003', 'unknown'],
    ['asauth-1004', 'unknown'],
    ['asauth-1005', 'unknown'],
    ['asauth-1006', 'alreadyRegistered'],
    ['asauth-1099', 'unknown'],
  ];
  for (const [token, code] of numeric) {
    test(`maps ${token} to ${code}`, () => {
      const error = PasskeyError.from(
        new Error(`[Passkeys:${token}] The operation failed.`),
      );
      expect(error).toBeInstanceOf(PasskeyError);
      expect(error.code).toBe(code);
      expect(error.message).toBe('The operation failed.');
    });
  }

  const named: PasskeyErrorCode[] = [
    'canceled',
    'noCredentials',
    'alreadyRegistered',
    'domainNotAssociated',
    'unsupported',
    'invalidOptions',
    'unknown',
  ];
  for (const code of named) {
    test(`recognises named token ${code}`, () => {
      const error = PasskeyError.from(new Error(`[Passkeys:${code}] message`));
      expect(error.code).toBe(code);
      expect(error.message).toBe('message');
    });
  }

  test('an unknown named token maps to unknown', () => {
    const error = PasskeyError.from(new Error('[Passkeys:bogus] something'));
    expect(error.code).toBe('unknown');
    expect(error.message).toBe('something');
  });

  test('keeps the Nitro prefix and strips only the marker', () => {
    const error = PasskeyError.from(
      new Error(
        "create: [Passkeys:asauth-1001] The operation couldn't be completed.",
      ),
    );
    expect(error.code).toBe('canceled');
    expect(error.message).toBe("create: The operation couldn't be completed.");
  });

  test('finds a token inside fbjni-style text and keeps the rest', () => {
    const error = PasskeyError.from(
      new Error('java.lang.Exception: [Passkeys:noCredentials] No credentials'),
    );
    expect(error.code).toBe('noCredentials');
    expect(error.message).toBe('java.lang.Exception: No credentials');
  });

  test('no token keeps the message and maps to unknown', () => {
    const error = PasskeyError.from(new Error('something broke'));
    expect(error.code).toBe('unknown');
    expect(error.message).toBe('something broke');
  });

  test('a message that is only a marker falls back to the original', () => {
    const error = PasskeyError.from(new Error('[Passkeys:canceled]'));
    expect(error.code).toBe('canceled');
    expect(error.message).toBe('[Passkeys:canceled]');
  });

  test('non-Error values', () => {
    const undef = PasskeyError.from(undefined);
    expect(undef.code).toBe('unknown');
    expect(undef.message).toBe('Unknown error');

    const str = PasskeyError.from('[Passkeys:canceled] cancelled');
    expect(str.code).toBe('canceled');
    expect(str.message).toBe('cancelled');

    const num = PasskeyError.from(42);
    expect(num.code).toBe('unknown');
    expect(num.message).toBe('Unknown error');
  });

  test('returns the same instance for a PasskeyError', () => {
    const original = new PasskeyError('noCredentials', 'nope');
    expect(PasskeyError.from(original)).toBe(original);
  });

  test('has name PasskeyError', () => {
    expect(new PasskeyError('unknown', 'x').name).toBe('PasskeyError');
  });
});
