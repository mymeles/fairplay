import { createHash, randomBytes } from 'node:crypto';

const URL_SAFE_VERIFIER_BYTES = 64;

const toBase64Url = (buf: Buffer): string =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export interface PkcePair {
  verifier: string;
  challenge: string;
  method: 'S256';
}

export const generatePkcePair = (): PkcePair => {
  const verifier = toBase64Url(randomBytes(URL_SAFE_VERIFIER_BYTES));
  const challenge = toBase64Url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge, method: 'S256' };
};

export const generateState = (): string => toBase64Url(randomBytes(32));
