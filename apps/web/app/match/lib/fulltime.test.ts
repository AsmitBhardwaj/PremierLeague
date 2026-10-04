import type { MatchEvent, PlayerMatchRating } from '@pl/engine';
import { describe, expect, it } from 'vitest';
import { market, testPreparation } from './fixtures';
import { MatchSession, createMatchInput } from './match';
import {
  contributionLine,
  goalScorers,
  playerOfTheMatch,
  playerTags,
  rankPlayers,
  statLeader,
} from './fulltime';

const rating = (name: string, value: number, goals = 0): PlayerMatchRating => ({
  playerId: name,
  teamId: 't',
  name,
  rating: value,
  individual: value,
  minutesPlayed: 90,
  goals,
  assists: 0,
  shots: 0,
  saves: 0,
  yellowCards: 0,
  redCard: false,
});

describe('player of the match', () => {
  it('is the highest engine rating, with goals breaking ties', () => {
    expect(playerOfTheMatch([rating('A', 7), rating('B', 8.5), rating('C', 6)])!.name).toBe('B');
    expect(playerOfTheMatch([rating('A', 8, 0), rating('B', 8, 2)])!.name).toBe('B');
    expect(playerOfTheMatch([])).toBeUndefined();
  });

  it('picks the top-ranked engine rating of a real match, rated 1 to 10', () => {
    const prep = testPreparation();
    const session = new MatchSession(createMatchInput(prep, market, 1), 'home');
    session.playFirstHalf();
    const result = session.continueSecondHalf('balanced', []);
    const best = Math.max(...result.playerRatings.map((item) => item.rating));
    expect(playerOfTheMatch(result.playerRatings)!.rating).toBe(best);
    for (const item of rankPlayers(result.playerRatings)) {
      expect(item.rating).toBeGreaterThanOrEqual(1);
      expect(item.rating).toBeLessThanOrEqual(10);
    }
  });
});

describe('full-time presentation helpers', () => {
  const ev = (over: Partial<MatchEvent>): MatchEvent => ({
    minute: 10,
    addedTime: 0,
    elapsed: 600,
    period: 1,
    teamId: 'h',
    playerId: 'p1',
    action: 'pass',
    outcome: 'success',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 0 },
    commentary: '',
    ...over,
  });
  const line = (over: Partial<PlayerMatchRating>): PlayerMatchRating => ({
    playerId: 'p1',
    teamId: 'h',
    name: 'Merino',
    rating: 7,
    individual: 7,
    minutesPlayed: 90,
    goals: 0,
    assists: 0,
    shots: 0,
    saves: 0,
    yellowCards: 0,
    redCard: false,
    ...over,
  });

  it('lists scorers with minutes and marks penalties', () => {
    const events = [
      ev({ minute: 12, action: 'shot', outcome: 'goal' }),
      ev({ minute: 50, action: 'foul', outcome: 'penalty', teamId: 'a', playerId: 'x' }),
      ev({ minute: 50, action: 'shot', outcome: 'goal' }),
      ev({ minute: 70, action: 'shot', outcome: 'goal', teamId: 'a', playerId: 'x' }),
    ];
    expect(goalScorers(events, 'h', () => 'Merino')).toEqual([
      { name: 'Merino', minute: "12'", pen: false, og: false },
      { name: 'Merino', minute: "50'", pen: true, og: false },
    ]);
  });

  it('gives each fact its own chip (the old "1 goal yellow" run-on is gone)', () => {
    const events = [
      ev({ minute: 67, action: 'substitution', playerId: 'p2', offPlayerId: 'p1' }),
      ev({ minute: 30, action: 'injury', playerId: 'p1' }),
    ];
    const tags = playerTags(
      line({ goals: 2, assists: 1, yellowCards: 1, redCard: true }),
      events,
    ).map((t) => t.label);
    expect(tags).toEqual(['GOAL ×2', 'ASSIST', 'YC', 'RC', 'INJ', "OFF 67'"]);
    expect(playerTags(line({ playerId: 'p2' }), events).map((t) => t.label)).toEqual(["ON 67'"]);
  });

  it('describes the player of the match from his own numbers', () => {
    expect(contributionLine(line({ goals: 2, assists: 1 }), 'FWD', false)).toBe(
      '2 goals and 1 assist',
    );
    expect(contributionLine(line({ assists: 2 }), 'MID', false)).toBe('2 assists');
    expect(contributionLine(line({ saves: 6 }), 'GK', true)).toBe('6 saves in a clean sheet');
    expect(contributionLine(line({}), 'DEF', true)).toBe('Anchored a clean sheet');
    expect(contributionLine(line({ shots: 4 }), 'FWD', false)).toBe('4 shots on the day');
    expect(contributionLine(line({}), 'MID', false)).toBe('Highest-rated player on the pitch');
  });

  it('finds the leader of a stat', () => {
    expect(statLeader(3, 1)).toBe('home');
    expect(statLeader(1, 3)).toBe('away');
    expect(statLeader(2, 2)).toBeNull();
  });
});
