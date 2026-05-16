import { webcrypto } from 'node:crypto';
import { TokenEncryptionService } from './token-encryption';

// Belt-and-braces: simulate the exact Web Crypto path that the
// `spotify-callback` Edge Function uses and make sure
// TokenEncryptionService.decrypt() (Node crypto) accepts the result.
// This is the test that fails first if the wire formats drift.

const ENCRYPTION_IV_BYTES = 12;
const subtle = webcrypto.subtle;

const toBase64 = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString('base64');

const encryptViaWebCrypto = async (
  plaintext: string,
  key: Uint8Array,
): Promise<string> => {
  const cryptoKey = await subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = webcrypto.getRandomValues(new Uint8Array(ENCRYPTION_IV_BYTES));
  const ciphertext = new Uint8Array(
    await subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      new TextEncoder().encode(plaintext),
    ),
  );
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return toBase64(combined);
};

describe('TokenEncryptionService cross-platform compatibility', () => {
  it('decrypts payloads produced by Web Crypto using the same key', async () => {
    const key = webcrypto.getRandomValues(new Uint8Array(32));
    const service = new TokenEncryptionService(Buffer.from(key));

    const plaintext = 'AQA1234-fake-refresh-token-_xyz';
    const encryptedByEdgeFn = await encryptViaWebCrypto(plaintext, key);

    expect(service.decrypt(encryptedByEdgeFn)).toBe(plaintext);
  });

  it('rejects payloads encrypted with a different key', async () => {
    const keyA = webcrypto.getRandomValues(new Uint8Array(32));
    const keyB = webcrypto.getRandomValues(new Uint8Array(32));
    const service = new TokenEncryptionService(Buffer.from(keyB));

    const encryptedByOtherKey = await encryptViaWebCrypto('hello', keyA);
    expect(() => service.decrypt(encryptedByOtherKey)).toThrow();
  });
});
