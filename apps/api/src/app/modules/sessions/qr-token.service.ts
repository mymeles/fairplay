import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

const QR_TOKEN_BYTES = 32;

export interface QrTokenPair {
  token: string;     // url-safe random — only ever returned to the host once
  tokenHash: string; // sha256 hex — what we persist for verification
}

// QR tokens are opaque random strings, hashed before persistence. The
// server never stores the plaintext; the host embeds it in the printed QR.
// Guests prove possession by sending the token back; we hash and compare.
@Injectable()
export class QrTokenService {
  generate(): QrTokenPair {
    const token = randomBytes(QR_TOKEN_BYTES).toString('base64url');
    const tokenHash = QrTokenService.hash(token);
    return { token, tokenHash };
  }

  static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  verify(token: string, expectedHash: string): boolean {
    if (!token || !expectedHash) return false;
    const actual = QrTokenService.hash(token);
    // Length check is fine here — both are sha256 hex (64 chars).
    if (actual.length !== expectedHash.length) return false;
    let mismatch = 0;
    for (let i = 0; i < actual.length; i += 1) {
      mismatch |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
    }
    return mismatch === 0;
  }
}
