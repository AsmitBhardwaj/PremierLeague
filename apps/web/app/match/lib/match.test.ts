import { Match, simulateMatch, type Tactic } from '@pl/engine';
import { describe, expect, it } from 'vitest';
import playerData from '../../play/data/players.json';
import { cheapestLegalCompletion, pickFormationXI, type MarketPlayer } from '../../play/lib/squad';
import {
  MatchSession,
  createMatchInput,
  createUserMatchTeam,
  estimateMatchOdds,
  matchSeed,
  validateSubstitution,
  type MatchPreparation,
} from './match';
import { playbackDuration, timelineIndexAt, type PlaybackMode } from './playback';

const market = playerData as MarketPlayer[];

function preparation(tactic: Tactic = 'balanced'): MatchPreparation {
  const completion = cheapestLegalCompletion([], market);
  if (!completion) throw new Error('Fixture data cannot form a legal test squad.');
  const squad = completion.playerIds.map((id) => market.find((player) => player.id === id)!);
  return {
    identity: {
      name: 'Test Athletic',
      shortName: 'TST',
      stadium: 'Test Ground',
      primaryColor: '#f7f8f8',
      secondaryColor: '#1c1d1f',
      crestShape: 'shield',
    },
    squad,
    formation: '4-4-2',
    starterIds: pickFormationXI(squad, '4-4-2'),
    tactic,
  };
}

describe('Phase 4 match session', () => {
  it('produces identical full-engine results for identical inputs and seed', () => {
    const input = createMatchInput(preparation(), market);
    expect(simulateMatch(input)).toEqual(simulateMatch(input));
    expect(matchSeed(preparation(), input.away.id)).toBe(matchSeed(preparation(), input.away.id));
    expect(estimateMatchOdds(input, 8)).toEqual(estimateMatchOdds(input, 8));
  });

  it('continues the same random stream across half-time', () => {
    const input = createMatchInput(preparation(), market);
    const session = new MatchSession(input);
    const half = session.playFirstHalf();
    expect(half.period).toBe('half_time');
    expect(session.continueSecondHalf('balanced', [])).toEqual(simulateMatch(input));
  });

  it('accepts a valid same-position substitution and rejects invalid ones', () => {
    const prep = preparation();
    const input = createMatchInput(prep, market);
    const session = new MatchSession(input);
    const half = session.playFirstHalf();
    const team = createUserMatchTeam(prep);
    const off = team.players.find((player) => player.position === 'DEF')!;
    const on = team.bench!.find((player) => player.position === 'DEF')!;
    expect(validateSubstitution(team, half, { off: off.id, on: on.id })).toBeNull();
    expect(validateSubstitution(team, half, { off: on.id, on: off.id })).toMatch(/not available/);
    const wrongPosition = team.bench!.find((player) => player.position !== off.position)!;
    expect(validateSubstitution(team, half, { off: off.id, on: wrongPosition.id })).toMatch(
      /same-position/,
    );
    expect(
      session.continueSecondHalf('balanced', [{ off: off.id, on: on.id }]).events,
    ).toContainEqual(expect.objectContaining({ action: 'substitution', playerId: on.id }));
  });

  it('applies a half-time tactic change before the second half', () => {
    const input = createMatchInput(preparation(), market);
    const session = new MatchSession(input);
    session.playFirstHalf();
    const result = session.continueSecondHalf('counter', []);
    expect(result.events).toContainEqual(
      expect.objectContaining({ action: 'tactic_change', teamId: 'user-club' }),
    );
  });

  it('keeps simulation results independent of playback modes and skipping', () => {
    const input = createMatchInput(preparation(), market);
    const expected = simulateMatch(input);
    for (const mode of ['highlights', 'commentary', 'instant'] as PlaybackMode[]) {
      const session = new MatchSession(input);
      const half = session.playFirstHalf();
      timelineIndexAt(half.events, playbackDuration(mode, false), playbackDuration(mode, false));
      expect(session.continueSecondHalf('balanced', [])).toEqual(expected);
    }
    const skipped = new Match(input);
    skipped.playFirstHalf();
    expect(skipped.playSecondHalf()).toEqual(expected);
  });
});
