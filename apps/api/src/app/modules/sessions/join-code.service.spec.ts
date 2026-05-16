import type { SessionRepository } from './session.repository';
import { JoinCodeService } from './join-code.service';

const makeRepo = (
  existsImpl: (code: string) => Promise<boolean>,
): SessionRepository =>
  ({
    existsActiveJoinCode: jest.fn(existsImpl),
  }) as unknown as SessionRepository;

describe('JoinCodeService.normalize', () => {
  it.each([
    ['  abc-12  ', 'ABC12'],
    ['ab.c#12', 'ABC12'],
    ['xyz789', 'XYZ789'],
  ])('normalizes %p to %p', (input, expected) => {
    expect(JoinCodeService.normalize(input)).toBe(expected);
  });
});

describe('JoinCodeService.randomCode', () => {
  it('produces a 6-char Crockford-ish code', () => {
    const svc = new JoinCodeService(makeRepo(async () => false));
    const code = svc.randomCode();
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it('does not produce any of the visually ambiguous characters', () => {
    const svc = new JoinCodeService(makeRepo(async () => false));
    for (let i = 0; i < 200; i += 1) {
      const code = svc.randomCode();
      expect(code).not.toMatch(/[01OIL]/);
    }
  });
});

describe('JoinCodeService.generateUnique', () => {
  it('returns the first non-colliding code', async () => {
    const svc = new JoinCodeService(makeRepo(async () => false));
    const code = await svc.generateUnique();
    expect(code).toHaveLength(6);
  });

  it('retries when a collision is reported, eventually returning a free code', async () => {
    let calls = 0;
    const svc = new JoinCodeService(
      makeRepo(async () => {
        calls += 1;
        return calls <= 2; // collide on first two attempts, free thereafter
      }),
    );
    const code = await svc.generateUnique();
    expect(code).toHaveLength(6);
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  it('throws INTERNAL_ERROR if it cannot find a free code in MAX_ATTEMPTS', async () => {
    const svc = new JoinCodeService(makeRepo(async () => true));
    await expect(svc.generateUnique()).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});
