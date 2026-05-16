import { Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { DomainError } from '@fairplay/shared-utils';
import { SessionRepository } from './session.repository';

// Crockford-ish alphabet — drops 0/O/1/I/L to reduce read-back errors when a
// guest types the code from a printed sign or screen.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 8;

@Injectable()
export class JoinCodeService {
  private readonly logger = new Logger(JoinCodeService.name);

  constructor(private readonly sessions: SessionRepository) {}

  // Returns a code that is not currently held by any ACTIVE session. The
  // partial unique index in Postgres still guarantees uniqueness if a race
  // slips through; this method just picks a code unlikely to collide.
  async generateUnique(): Promise<string> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const code = this.randomCode();
      const taken = await this.sessions.existsActiveJoinCode(code);
      if (!taken) return code;
      this.logger.warn({ attempt, code }, 'Join code collision; regenerating.');
    }
    throw new DomainError(
      'INTERNAL_ERROR',
      'Could not allocate a unique join code after several attempts.',
    );
  }

  randomCode(): string {
    let out = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      out += ALPHABET[randomInt(0, ALPHABET.length)];
    }
    return out;
  }

  // Public so the controller can normalize an incoming code (handles users who
  // type lower-case, paste with whitespace, or include hyphens).
  static normalize(input: string): string {
    return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
}
