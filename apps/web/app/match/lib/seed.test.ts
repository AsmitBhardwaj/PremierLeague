import { describe, expect, it } from 'vitest';
import { matchSeed } from './seed';

describe('matchSeed', () => {
  it('is stable for identical inputs and an integer', () => {
    expect(matchSeed('Test FC', 'ARS', 'home', 0)).toBe(matchSeed('Test FC', 'ARS', 'home', 0));
    expect(Number.isInteger(matchSeed('Test FC', 'ARS', 'home', 0))).toBe(true);
  });

  it('changes with the play counter, opponent and venue', () => {
    const base = matchSeed('Test FC', 'ARS', 'home', 0);
    expect(matchSeed('Test FC', 'ARS', 'home', 1)).not.toBe(base);
    expect(matchSeed('Test FC', 'LIV', 'home', 0)).not.toBe(base);
    expect(matchSeed('Test FC', 'ARS', 'away', 0)).not.toBe(base);
  });
});
