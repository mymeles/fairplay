import { randomBytes } from 'node:crypto';
import { TokenEncryptionService } from './token-encryption';

describe('TokenEncryptionService', () => {
  const key = randomBytes(32);
  const service = new TokenEncryptionService(key);

  it('round-trips a refresh-token-shaped string', () => {
    const plaintext = 'AQA1234-fake-refresh-token-value-_xyz';
    const enc = service.encrypt(plaintext);
    expect(enc).not.toContain(plaintext);
    expect(service.decrypt(enc)).toBe(plaintext);
  });

  it('produces a different ciphertext each call (random IV)', () => {
    const plaintext = 'same-input';
    const a = service.encrypt(plaintext);
    const b = service.encrypt(plaintext);
    expect(a).not.toBe(b);
    expect(service.decrypt(a)).toBe(plaintext);
    expect(service.decrypt(b)).toBe(plaintext);
  });

  it('fails decryption when ciphertext is tampered with', () => {
    const plaintext = 'do-not-tamper';
    const enc = service.encrypt(plaintext);
    const buf = Buffer.from(enc, 'base64');
    buf[20] = buf[20] ^ 0xff;
    const tampered = buf.toString('base64');
    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('rejects keys that are not 32 bytes', () => {
    expect(() => new TokenEncryptionService(Buffer.alloc(16))).toThrow(/32-byte/);
  });

  it('rejects payloads that are too short to contain iv+tag+ciphertext', () => {
    expect(() => service.decrypt(Buffer.alloc(8).toString('base64'))).toThrow();
  });
});
