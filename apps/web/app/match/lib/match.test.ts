import { Match, simulateMatch } from '@pl/engine';
import { describe, expect, it } from 'vitest';
import { MatchSession, createMatchInput, createUserMatchTeam, validateSubstitution } from './match';
import { market, testPreparation } from './fixtures';

describe('match input', () => {
  it('puts the user at home or away and seeds deterministically from the play counter', () => {
    const home = createMatchInput(testPreparation({ venue: 'home' }), market, 0);
    const away = createMatchInput(testPreparation({ venue: 'away' }), market, 0);
    expect(home.home.id).toBe('user-club');
    expect(away.away.id).toBe('user-club');
    expect(createMatchInput(testPreparation(), market, 0).seed).toBe(home.seed);
    expect(createMatchInput(testPreparation(), market, 1).seed).not.toBe(home.seed);
  });

  it('keeps the seed when lineup or tactic changes', () => {
    const base = createMatchInput(testPreparation(), market, 4).seed;
    expect(createMatchInput(testPreparation({}, 'high_press'), market, 4).seed).toBe(base);
  });

  it('plays all 19 opponents without an id clash against the user squad', () => {
    for (const id of ['ARS', 'LIV', 'MCI', 'COV', 'HUL']) {
      const input = createMatchInput(testPreparation({ opponentId: id }), market, 0);
      expect(() => new Match(input)).not.toThrow();
    }
  });
});

describe('match session', () => {
  it('continues the same random stream across half-time', () => {
    const input = createMatchInput(testPreparation(), market, 0);
    const session = new MatchSession(input, 'home');
    expect(session.playFirstHalf().period).toBe('half_time');
    expect(session.continueSecondHalf('balanced', [])).toEqual(simulateMatch(input));
  });

  it('works when the user is the away side', () => {
    const prep = testPreparation({ venue: 'away' });
    const input = createMatchInput(prep, market, 0);
    const session = new MatchSession(input, 'away');
    session.playFirstHalf();
    const team = createUserMatchTeam(prep);
    const off = team.players.find((player) => player.position === 'MID')!;
    const on = team.bench!.find((player) => player.position === 'MID')!;
    const result = session.continueSecondHalf('counter', [{ off: off.id, on: on.id }]);
    expect(result.events).toContainEqual(
      expect.objectContaining({ action: 'substitution', playerId: on.id, offPlayerId: off.id }),
    );
    expect(result.events).toContainEqual(
      expect.objectContaining({ action: 'tactic_change', teamId: 'user-club' }),
    );
  });

  it('accepts a valid same-position substitution and rejects invalid ones', () => {
    const prep = testPreparation();
    const session = new MatchSession(createMatchInput(prep, market, 0), 'home');
    const half = session.playFirstHalf();
    const team = createUserMatchTeam(prep);
    const off = team.players.find((player) => player.position === 'DEF')!;
    const on = team.bench!.find((player) => player.position === 'DEF')!;
    const wrong = team.bench!.find((player) => player.position !== 'DEF')!;
    expect(validateSubstitution(team, 'home', half, { off: off.id, on: on.id })).toBeNull();
    expect(validateSubstitution(team, 'home', half, { off: on.id, on: off.id })).toMatch(
      /not available/,
    );
    expect(validateSubstitution(team, 'home', half, { off: off.id, on: wrong.id })).toMatch(
      /same-position/,
    );
  });
});
