import { describe, expect, it } from 'vitest';
import {
  about,
  finishRange,
  fixturePicks,
  oddsPhrase,
  oneIn,
  pointsFrom,
  recordLine,
  verdictOf,
} from './preview';

const distribution = (probabilities: number[]) =>
  probabilities.map((probability, i) => ({ position: i + 1, probability, count: 0 }));

/** A bell around `centre` over 20 places. */
const bell = (centre: number, spread = 2.5) => {
  const raw = Array.from({ length: 20 }, (_, i) =>
    Math.exp(-((i + 1 - centre) ** 2) / (2 * spread ** 2)),
  );
  const total = raw.reduce((a, b) => a + b, 0);
  return distribution(raw.map((v) => v / total));
};

const prediction = (
  centre: number,
  extra: Partial<
    Record<'titleProbability' | 'top4Probability' | 'relegationProbability', number>
  > = {},
) => ({
  positionDistribution: bell(centre),
  titleProbability: 0,
  top4Probability: 0.05,
  relegationProbability: 0.02,
  ...extra,
});

describe('finishRange', () => {
  it('returns the mode with a 10th to 90th percentile range around it', () => {
    const range = finishRange(bell(7));
    expect(range.likely).toBe(7);
    expect(range.best).toBeLessThan(7);
    expect(range.worst).toBeGreaterThan(7);
    expect(range.best).toBeGreaterThanOrEqual(3);
    expect(range.worst).toBeLessThanOrEqual(11);
  });

  it('never excludes the most likely finish', () => {
    const spike = distribution([0.95, ...Array(19).fill(0.05 / 19)]);
    const range = finishRange(spike);
    expect(range.likely).toBe(1);
    expect(range.best).toBe(1);
    expect(range.worst).toBeGreaterThanOrEqual(1);
  });
});

describe('verdictOf', () => {
  it.each([
    [prediction(1, { titleProbability: 0.4, top4Probability: 0.9 }), 'Title contenders'],
    [prediction(6, { titleProbability: 0.2 }), 'Title contenders'],
    [prediction(4, { top4Probability: 0.5 }), 'Champions League chase'],
    [prediction(6, { top4Probability: 0.45 }), 'Champions League chase'],
    [prediction(6), 'Europa League contenders'],
    [prediction(11), 'Comfortable mid-table'],
    [prediction(15, { relegationProbability: 0.25 }), 'Survival fight'],
    [prediction(12, { relegationProbability: 0.3 }), 'Survival fight'],
    [prediction(19, { relegationProbability: 0.7 }), 'Relegation scrap'],
    [prediction(14, { relegationProbability: 0.55 }), 'Relegation scrap'],
  ])('maps %# to %s', (input, label) => {
    expect(verdictOf(input).label).toBe(label);
  });
});

describe('oddsPhrase', () => {
  it('says very unlikely below one in a thousand, with no number', () => {
    expect(oddsPhrase(0.0004)).toBe('very unlikely');
    expect(oddsPhrase(0)).toBe('very unlikely');
  });
  it('gives a long shot with a one-in figure', () => {
    expect(oddsPhrase(0.002)).toBe('a long shot (1 in 500)');
  });
  it('says one in ten for ten percent', () => {
    expect(oddsPhrase(0.1)).toBe('unlikely (1 in 10)');
  });
  it('covers the middle and the top of the scale', () => {
    expect(oddsPhrase(0.25)).toBe('a real chance (1 in 4)');
    expect(oddsPhrase(0.5)).toBe('about even');
    expect(oddsPhrase(0.72)).toBe('likely (7 in 10)');
    expect(oddsPhrase(0.97)).toBe('very likely');
  });
  it('rounds one-in figures the way people say them', () => {
    expect(oneIn(0.0021)).toBe(500);
    expect(oneIn(0.04)).toBe(25);
    expect(oneIn(0.3)).toBe(3);
    expect(oneIn(0.45)).toBe(2);
  });
});

describe('fixturePicks', () => {
  const rows = [
    { opponentId: 'A', opponentName: 'Alpha', home: 2.1, away: 1.2, total: 3.3 },
    { opponentId: 'B', opponentName: 'Bravo', home: 0.9, away: 0.4, total: 1.3 },
    { opponentId: 'C', opponentName: 'Charlie', home: 2.6, away: 1.9, total: 4.5 },
  ];
  it('names the toughest trip, toughest home match and the banker', () => {
    expect(fixturePicks(rows)).toEqual({
      toughestTrip: { opponent: 'Bravo', venue: 'away' },
      toughestHome: { opponent: 'Bravo', venue: 'home' },
      banker: { opponent: 'Charlie', venue: 'home' },
    });
  });
  it('returns null with no fixtures', () => {
    expect(fixturePicks([])).toBeNull();
  });
});

describe('number formats', () => {
  it('uses whole numbers with a tilde', () => {
    expect(about(53.6)).toBe('~54');
  });
  it('makes a record that always adds up to 38 and points to match it', () => {
    const stats = { wins: 14.4, draws: 9.3, losses: 14.3 };
    expect(recordLine(stats)).toBe('14–9–15');
    expect(pointsFrom(stats)).toBe(51);
  });
});
