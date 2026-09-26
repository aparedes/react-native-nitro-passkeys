import { beforeEach, describe, expect, mock, test } from 'bun:test';

const fake = {
  isSupported: true,
  create: mock(async (_json: string): Promise<string> => ''),
  get: mock(async (_json: string): Promise<string> => ''),
};

mock.module('react-native-nitro-modules', () => ({
  NitroModules: { createHybridObject: () => fake },
}));

// Must load after mock.module: index.ts creates the HybridObject at import time.
const mod = await import('../index');

const creationOptions = {
  rp: { id: 'example.com', name: 'Example' },
  user: { id: 'dXNlcjE', name: 'alice', displayName: 'Alice' },
  challenge: 'Y2hhbGxlbmdl',
  pubKeyCredParams: [{ alg: -7, type: 'public-key' as const }],
};
const requestOptions = { rpId: 'example.com', challenge: 'Y2hhbGxlbmdl' };

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
  response: { clientDataJSON: 'YQ', authenticatorData: 'Yg', signature: 'Yw' },
  clientExtensionResults: {},
};

beforeEach(() => {
  fake.isSupported = true;
  fake.create.mockReset();
  fake.get.mockReset();
});

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected rejection');
}

describe('exports', () => {
  test('does not export the HybridObject', () => {
    expect(Object.keys(mod).toSorted()).toEqual([
      'PasskeyError',
      'createPasskey',
      'getPasskey',
      'isPasskeySupported',
    ]);
  });

  test('isPasskeySupported reflects native.isSupported', () => {
    expect(mod.isPasskeySupported()).toBe(true);
    fake.isSupported = false;
    expect(mod.isPasskeySupported()).toBe(false);
  });
});

describe.each([
  {
    name: 'createPasskey',
    call: (options?: unknown) =>
      mod.createPasskey((options ?? creationOptions) as never),
    native: fake.create,
    valid: registration,
    invalid: { ...creationOptions, rp: { name: 'Example' } },
    passthrough: {
      publicKey: 'cHVi',
      publicKeyAlgorithm: -7,
      authenticatorData: 'YXV0aA',
    },
    options: creationOptions,
  },
  {
    name: 'getPasskey',
    call: (options?: unknown) =>
      mod.getPasskey((options ?? requestOptions) as never),
    native: fake.get,
    valid: authentication,
    invalid: { challenge: 'Y2hhbGxlbmdl' },
    passthrough: {},
    options: requestOptions,
  },
])('$name', ({ call, native, valid, invalid, passthrough, options }) => {
  test('isSupported false -> unsupported, native not called', async () => {
    fake.isSupported = false;
    const error = await rejection(call());
    expect(error).toBeInstanceOf(mod.PasskeyError);
    expect((error as InstanceType<typeof mod.PasskeyError>).code).toBe(
      'unsupported',
    );
    expect(native).not.toHaveBeenCalled();
  });

  test('invalid options -> invalidOptions, native not called', async () => {
    const error = await rejection(call(invalid));
    expect(error).toBeInstanceOf(mod.PasskeyError);
    expect((error as InstanceType<typeof mod.PasskeyError>).code).toBe(
      'invalidOptions',
    );
    expect(native).not.toHaveBeenCalled();
  });

  test('native rejection with a token -> PasskeyError canceled', async () => {
    native.mockRejectedValue(
      new Error("[Passkeys:asauth-1001] The operation couldn't be completed."),
    );
    const error = (await rejection(call())) as InstanceType<
      typeof mod.PasskeyError
    >;
    expect(error).toBeInstanceOf(mod.PasskeyError);
    expect(error.code).toBe('canceled');
    expect(error.message).toBe("The operation couldn't be completed.");
  });

  test('synchronous native throw -> rejected PasskeyError', async () => {
    native.mockImplementation(() => {
      throw new Error('boom');
    });
    const error = (await rejection(call())) as InstanceType<
      typeof mod.PasskeyError
    >;
    expect(error).toBeInstanceOf(mod.PasskeyError);
    expect(error.code).toBe('unknown');
    expect(error.message).toBe('boom');
  });

  test('non-JSON native result -> unknown', async () => {
    native.mockResolvedValue('not json');
    const error = (await rejection(call())) as InstanceType<
      typeof mod.PasskeyError
    >;
    expect(error).toBeInstanceOf(mod.PasskeyError);
    expect(error.code).toBe('unknown');
  });

  test('id !== rawId -> unknown', async () => {
    native.mockResolvedValue(JSON.stringify({ ...valid, rawId: 'YWJk' }));
    const error = (await rejection(call())) as InstanceType<
      typeof mod.PasskeyError
    >;
    expect(error).toBeInstanceOf(mod.PasskeyError);
    expect(error.code).toBe('unknown');
  });

  test('missing clientExtensionResults becomes {}', async () => {
    const { clientExtensionResults: _omitted, ...withoutExtensions } = valid;
    native.mockResolvedValue(JSON.stringify(withoutExtensions));
    const result = (await call()) as { clientExtensionResults: unknown };
    expect(result.clientExtensionResults).toEqual({});
  });

  test('extra fields pass through untouched', async () => {
    const raw = {
      ...valid,
      response: { ...valid.response, ...passthrough },
      extra: { a: 1 },
    };
    native.mockResolvedValue(JSON.stringify(raw));
    expect(await call()).toEqual(raw as never);
  });

  test('native receives JSON.stringify(options)', async () => {
    native.mockResolvedValue(JSON.stringify(valid));
    await call();
    expect(native).toHaveBeenCalledTimes(1);
    expect(native.mock.calls[0]?.[0]).toBe(JSON.stringify(options));
  });
});
