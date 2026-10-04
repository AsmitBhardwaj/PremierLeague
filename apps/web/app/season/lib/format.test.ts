import { describe, expect, it } from 'vitest';
import {
  movement,
  ordinal,
  placesSummary,
  predictedPosition,
  resultLetter,
  userPosition,
} from './format';
import type { TableEntry } from './protocol';

const row = (clubId: string, previousPosition: number): TableEntry => ({
  clubId,
  played: 1,
  won: 0,
  drawn: 0,
  lost: 0,
  goalsFor: 0,
  goalsAgainst: 0,
  goalDifference: 0,
  points: 0,
  previousPosition,
});

describe('season formatting', () => {
  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 20, 21].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '20th',
      '21st',
    ]);
  });

  it('reports movement as places gained', () => {
    expect(movement(row('A', 5), 3)).toBe(2);
    expect(movement(row('A', 3), 5)).toBe(-2);
    expect(movement(row('A', 4), 4)).toBe(0);
  });

  it('finds the user and reads results from their side', () => {
    expect(userPosition([row('A', 1), row('USER', 2)])).toBe(2);
    const base = { round: 0, home: 'USER', away: 'A' };
    expect(resultLetter({ ...base, homeGoals: 2, awayGoals: 1 })).toBe('W');
    expect(resultLetter({ ...base, homeGoals: 1, awayGoals: 1 })).toBe('D');
    expect(resultLetter({ ...base, homeGoals: 0, awayGoals: 1 })).toBe('L');
    expect(resultLetter({ round: 1, home: 'A', away: 'USER', homeGoals: 0, awayGoals: 3 })).toBe(
      'W',
    );
  });

  it('summarises the finish against the prediction', () => {
    expect(placesSummary(11, 7)).toBe('Predicted 11th, finished 7th: +4 places');
    expect(placesSummary(5, 6)).toBe('Predicted 5th, finished 6th: −1 place');
    expect(placesSummary(9, 9)).toBe('Predicted 9th, finished 9th: exactly as predicted');
  });

  it('reads the most likely predicted position', () => {
    expect(
      predictedPosition({
        positionDistribution: [
          { position: 1, probability: 0.1 },
          { position: 2, probability: 0.4 },
          { position: 3, probability: 0.3 },
        ],
      }),
    ).toBe(2);
  });
});
