import type { HybridObject } from 'react-native-nitro-modules';

export interface NitroPasskeys extends HybridObject<{
  ios: 'swift';
  android: 'kotlin';
}> {
  readonly isSupported: boolean;
  /** creationOptionsJson: PublicKeyCredentialCreationOptionsJSON → RegistrationResponseJSON (both JSON strings). */
  create(creationOptionsJson: string): Promise<string>;
  /** requestOptionsJson: PublicKeyCredentialRequestOptionsJSON → AuthenticationResponseJSON (both JSON strings). */
  get(requestOptionsJson: string): Promise<string>;
}
