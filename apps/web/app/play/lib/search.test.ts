import { describe, expect, it } from 'vitest';
import { matchesName, normalizeName } from './search';

describe('player search', () => {
  it('ignores accents and special letters', () => {
    expect(normalizeName('Ødegaard')).toBe('odegaard');
    expect(matchesName('Martin Ødegaard', 'Odegaard')).toBe(true);
    expect(matchesName('Martin Odegaard', 'ødegaard')).toBe(true);
    expect(matchesName('João Pedro', 'joao')).toBe(true);
  });

  it('tolerates common misspellings', () => {
    expect(matchesName('Alisson', 'Allison')).toBe(true);
    expect(matchesName('Mohamed Salah', 'mo salah')).toBe(true);
    expect(matchesName('Erling Haaland', 'Haland')).toBe(true);
    expect(matchesName('Bukayo Saka', 'sakka')).toBe(true);
  });

  it('matches partial names while typing', () => {
    expect(matchesName('Erling Haaland', 'erl')).toBe(true);
    expect(matchesName('Erling Haaland', 'erling haa')).toBe(true);
  });

  it('does not match unrelated names', () => {
    expect(matchesName('Alisson', 'Salah')).toBe(false);
    expect(matchesName('Erling Haaland', 'Kane')).toBe(false);
    expect(matchesName('Bruno Fernandes', 'Haaland')).toBe(false);
  });

  it('matches everything on an empty query', () => {
    expect(matchesName('Anyone', '  ')).toBe(true);
  });
});
