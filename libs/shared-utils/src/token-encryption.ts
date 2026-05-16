import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM with a 12-byte IV.
//
// Wire format (base64):  iv (12 bytes) || ciphertext || authTag (16 bytes)
//
// This layout intentionally matches the Web Crypto API output so the
// `spotify-callback` Edge Function (Deno) can encrypt with the exact same
// bytes that NestJS will later decrypt.

export const ENCRYPTION_IV_BYTES = 12;
export const ENCRYPTION_TAG_BYTES = 16;

export class TokenEncryptionService {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) {
      throw new Error('TokenEncryptionService requires a 32-byte key.');
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(ENCRYPTION_IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, ciphertext, authTag]).toString('base64');
  }

  decrypt(payload: string): string {
    const raw = Buffer.from(payload, 'base64');
    if (raw.length < ENCRYPTION_IV_BYTES + ENCRYPTION_TAG_BYTES + 1) {
      throw new Error('Encrypted payload is too short.');
    }
    const iv = raw.subarray(0, ENCRYPTION_IV_BYTES);
    const authTag = raw.subarray(raw.length - ENCRYPTION_TAG_BYTES);
    const ciphertext = raw.subarray(ENCRYPTION_IV_BYTES, raw.length - ENCRYPTION_TAG_BYTES);

    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}
