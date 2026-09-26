import { PasskeyError } from './PasskeyError';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from './types';
import {
  validateAuthenticationResponse,
  validateRegistrationResponse,
} from './validate';

function parse<T extends { clientExtensionResults: unknown }>(
  raw: string,
  label: 'registration' | 'authentication',
  validate: (value: unknown) => string | undefined,
): T {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new PasskeyError('unknown', `Malformed ${label} response: not JSON`);
  }
  const reason = validate(value);
  if (reason)
    throw new PasskeyError('unknown', `Malformed ${label} response: ${reason}`);
  const result = value as T;
  // The only normalisation: nothing else is added, removed or re-encoded.
  result.clientExtensionResults ??= {};
  return result;
}

export function parseRegistrationResponse(
  raw: string,
): RegistrationResponseJSON {
  return parse<RegistrationResponseJSON>(
    raw,
    'registration',
    validateRegistrationResponse,
  );
}

export function parseAuthenticationResponse(
  raw: string,
): AuthenticationResponseJSON {
  return parse<AuthenticationResponseJSON>(
    raw,
    'authentication',
    validateAuthenticationResponse,
  );
}
