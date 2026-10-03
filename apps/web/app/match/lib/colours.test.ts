import { describe, expect, it } from 'vitest';
import { INK, userDotColour } from './colours';

describe('userDotColour', () => {
  it('keeps a distinct club primary and falls back to ink otherwise', () => {
    expect(userDotColour('#2d6cdf')).toBe('#2d6cdf');
    expect(userDotColour('#111611')).toBe('#111611');
    expect(userDotColour(undefined)).toBe(INK);
    expect(userDotColour('not-a-colour')).toBe(INK);
    expect(userDotColour('#f7f8f8')).toBe(INK);
  });
});
