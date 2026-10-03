import { describe, expect, it } from 'vitest';
import { MATCH_STORAGE_KEY, parseSavedMatchFlow } from './persistence';
import { testPreparation } from './fixtures';

const prep = testPreparation();
const valid = {
  version: 2,
  starterIds: prep.starterIds,
  formation: '4-4-2',
  tactic: 'counter',
  mode: 'commentary',
  opponentId: 'ARS',
  venue: 'away',
  playCounter: 3,
};

describe('match persistence', () => {
  it('uses a bumped storage key and ignores older saves', () => {
    expect(MATCH_STORAGE_KEY).not.toBe('21st-club-phase-4');
    const parsed = parseSavedMatchFlow(JSON.stringify({ ...valid, version: 1 }), prep.squad, [
      'ARS',
    ]);
    expect(parsed).toBeNull();
  });

  it('round-trips a valid save, including the play counter', () => {
    const parsed = parseSavedMatchFlow(JSON.stringify(valid), prep.squad, ['ARS']);
    expect(parsed).toMatchObject({ opponentId: 'ARS', venue: 'away', playCounter: 3 });
  });

  it('rejects unknown opponents, corrupt JSON and invalid counters', () => {
    expect(parseSavedMatchFlow(JSON.stringify(valid), prep.squad, ['LIV'])).toBeNull();
    expect(parseSavedMatchFlow('{nope', prep.squad, ['ARS'])).toBeNull();
    expect(
      parseSavedMatchFlow(JSON.stringify({ ...valid, playCounter: -1 }), prep.squad, ['ARS']),
    ).toBeNull();
  });
});
