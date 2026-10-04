import { describe, expect, it } from 'vitest';
import { SPEED_STORAGE_KEY, parseSpeed, readSpeed, watchMs, writeSpeed } from './speed';

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
};

describe('playback speed', () => {
  it('defaults to ×1 and accepts only 1 or 2', () => {
    expect(parseSpeed(null)).toBe(1);
    expect(parseSpeed('3')).toBe(1);
    expect(parseSpeed('banana')).toBe(1);
    expect(parseSpeed('2')).toBe(2);
  });

  it('remembers the choice', () => {
    const storage = memory();
    expect(readSpeed(storage)).toBe(1);
    writeSpeed(2, storage);
    expect(storage.getItem(SPEED_STORAGE_KEY)).toBe('2');
    expect(readSpeed(storage)).toBe(2);
  });

  it('survives blocked storage', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readSpeed(blocked)).toBe(1);
    expect(() => writeSpeed(2, blocked)).not.toThrow();
  });

  it('halves the watch time at ×2', () => {
    expect(watchMs(30_000, 1)).toBe(30_000);
    expect(watchMs(30_000, 2)).toBe(15_000);
  });
});
