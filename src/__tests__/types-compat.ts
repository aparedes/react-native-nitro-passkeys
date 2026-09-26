// Compile-time only (checked by `tsc --noEmit`, excluded from the bob build).
// Inputs: simplewebauthn's options must assign to ours. Outputs: ours must assign to theirs.
import type * as SWA from '@simplewebauthn/server';

import type * as Ours from '../types';

declare const swaCreation: SWA.PublicKeyCredentialCreationOptionsJSON;
declare const swaRequest: SWA.PublicKeyCredentialRequestOptionsJSON;
declare const oursRegistration: Ours.RegistrationResponseJSON;
declare const oursAuthentication: Ours.AuthenticationResponseJSON;

export const creationOptions: Ours.PublicKeyCredentialCreationOptionsJSON =
  swaCreation;
export const requestOptions: Ours.PublicKeyCredentialRequestOptionsJSON =
  swaRequest;
export const registrationResponse: SWA.RegistrationResponseJSON =
  oursRegistration;
export const authenticationResponse: SWA.AuthenticationResponseJSON =
  oursAuthentication;
