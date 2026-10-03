import type { PlayerMatchRating } from '@pl/engine';
import { describe, expect, it } from 'vitest';
import { market, testPreparation } from './fixtures';
import { MatchSession, createMatchInput } from './match';
import { playerOfTheMatch, rankPlayers } from './fulltime';

const rating = (name: string, value: number, goals = 0): PlayerMatchRating => ({
  playerId: name,
  teamId: 't',
  name,
  rating: value,
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
