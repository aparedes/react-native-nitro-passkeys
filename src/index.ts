import { NitroModules } from 'react-native-nitro-modules';

import { PasskeyError } from './PasskeyError';
import {
  parseAuthenticationResponse,
  parseRegistrationResponse,
} from './response';
import type { NitroPasskeys } from './specs/nitro-passkeys.nitro';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from './types';
import { validateCreationOptions, validateRequestOptions } from './validate';

// Deliberately not exported: every caller goes through the helpers and gets typed errors.
const native = NitroModules.createHybridObject<NitroPasskeys>('NitroPasskeys');

export function isPasskeySupported(): boolean {
  return native.isSupported;
}

export async function createPasskey(
  options: PublicKeyCredentialCreationOptionsJSON,
): Promise<RegistrationResponseJSON> {
  if (!isPasskeySupported()) {
    throw new PasskeyError(
      'unsupported',
      'Passkeys are not supported on this device',
    );
  }
  const reason = validateCreationOptions(options);
  if (reason) throw new PasskeyError('invalidOptions', reason);
  let raw: string;
  try {
    raw = await native.create(JSON.stringify(options));
  } catch (error) {
    throw PasskeyError.from(error);
  }
  return parseRegistrationResponse(raw);
}

export async function getPasskey(
  options: PublicKeyCredentialRequestOptionsJSON,
): Promise<AuthenticationResponseJSON> {
  if (!isPasskeySupported()) {
    throw new PasskeyError(
      'unsupported',
      'Passkeys are not supported on this device',
    );
  }
  const reason = validateRequestOptions(options);
  if (reason) throw new PasskeyError('invalidOptions', reason);
  let raw: string;
  try {
    raw = await native.get(JSON.stringify(options));
  } catch (error) {
    throw PasskeyError.from(error);
  }
  return parseAuthenticationResponse(raw);
}

export { PasskeyError } from './PasskeyError';
export type { PasskeyErrorCode } from './PasskeyError';
export type * from './types';
