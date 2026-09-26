export type Base64URLString = string;
export type PublicKeyCredentialType = 'public-key';
export type COSEAlgorithmIdentifier = number;
export type AuthenticatorTransport =
  | 'ble'
  | 'hybrid'
  | 'internal'
  | 'nfc'
  | 'usb';
export type AuthenticatorAttachment = 'cross-platform' | 'platform';
export type UserVerificationRequirement =
  | 'discouraged'
  | 'preferred'
  | 'required';
export type ResidentKeyRequirement = 'discouraged' | 'preferred' | 'required';
export type AttestationConveyancePreference =
  | 'direct'
  | 'enterprise'
  | 'indirect'
  | 'none';
export type AttestationFormat =
  | 'fido-u2f'
  | 'packed'
  | 'android-safetynet'
  | 'android-key'
  | 'tpm'
  | 'apple'
  | 'none';
export type PublicKeyCredentialHint =
  | 'hybrid'
  | 'security-key'
  | 'client-device';

export interface PublicKeyCredentialRpEntity {
  name: string;
  id?: string; // optional in the type; REQUIRED at runtime by this module (§3.4)
}
export interface PublicKeyCredentialUserEntityJSON {
  id: Base64URLString; // base64url of the user-handle bytes (simplewebauthn ≥10)
  name: string;
  displayName: string;
}
export interface PublicKeyCredentialParameters {
  alg: COSEAlgorithmIdentifier;
  type: PublicKeyCredentialType;
}
export interface PublicKeyCredentialDescriptorJSON {
  id: Base64URLString;
  type: string; // simplewebauthn types this as string
  transports?: string[]; // simplewebauthn types this as string[]
}
export interface AuthenticatorSelectionCriteria {
  authenticatorAttachment?: AuthenticatorAttachment;
  requireResidentKey?: boolean;
  residentKey?: ResidentKeyRequirement;
  userVerification?: UserVerificationRequirement;
}
export interface AuthenticationExtensionsClientInputs {
  appid?: string;
  credProps?: boolean;
  hmacCreateSecret?: boolean;
  minPinLength?: boolean;
  prf?: unknown; // deviation: simplewebauthn uses BufferSource values, which JSON cannot carry
}
export interface AuthenticationExtensionsClientOutputs {
  appid?: boolean;
  credProps?: { rk?: boolean };
  hmacCreateSecret?: boolean;
  prf?: { enabled?: boolean }; // deviation: `results` (BufferSource) omitted
}

export interface PublicKeyCredentialCreationOptionsJSON {
  rp: PublicKeyCredentialRpEntity;
  user: PublicKeyCredentialUserEntityJSON;
  challenge: Base64URLString;
  pubKeyCredParams: PublicKeyCredentialParameters[];
  timeout?: number;
  excludeCredentials?: PublicKeyCredentialDescriptorJSON[];
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  hints?: PublicKeyCredentialHint[];
  attestation?: AttestationConveyancePreference;
  attestationFormats?: AttestationFormat[];
  extensions?: AuthenticationExtensionsClientInputs;
}
export interface PublicKeyCredentialRequestOptionsJSON {
  challenge: Base64URLString;
  timeout?: number;
  rpId?: string; // optional in the type; REQUIRED at runtime by this module (§3.4)
  allowCredentials?: PublicKeyCredentialDescriptorJSON[];
  userVerification?: UserVerificationRequirement;
  hints?: PublicKeyCredentialHint[];
  extensions?: AuthenticationExtensionsClientInputs;
}

export interface AuthenticatorAttestationResponseJSON {
  clientDataJSON: Base64URLString;
  attestationObject: Base64URLString;
  authenticatorData?: Base64URLString;
  transports?: AuthenticatorTransport[]; // narrower than simplewebauthn's string[] — assigns fine
  publicKeyAlgorithm?: COSEAlgorithmIdentifier;
  publicKey?: Base64URLString;
}
export interface AuthenticatorAssertionResponseJSON {
  clientDataJSON: Base64URLString;
  authenticatorData: Base64URLString;
  signature: Base64URLString;
  userHandle?: Base64URLString;
}
export interface RegistrationResponseJSON {
  id: Base64URLString;
  rawId: Base64URLString;
  response: AuthenticatorAttestationResponseJSON;
  authenticatorAttachment?: AuthenticatorAttachment;
  clientExtensionResults: AuthenticationExtensionsClientOutputs;
  type: PublicKeyCredentialType;
}
export interface AuthenticationResponseJSON {
  id: Base64URLString;
  rawId: Base64URLString;
  response: AuthenticatorAssertionResponseJSON;
  authenticatorAttachment?: AuthenticatorAttachment;
  clientExtensionResults: AuthenticationExtensionsClientOutputs;
  type: PublicKeyCredentialType;
}
