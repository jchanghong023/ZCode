export interface CredentialCipher {
  encrypt(value: string): string | Promise<string>;
  decrypt(value: string): string | Promise<string>;
  needsMigration?(value: string): boolean;
}
