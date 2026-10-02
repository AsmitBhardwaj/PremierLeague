import { describe, expect, it } from 'vitest';
import { createSyntheticTeam } from '../synthetic';
import { predictSeason } from './index';

describe('predictSeason', () => {
  it('is deterministic for a given seed', () => {
    const squad = createSyntheticTeam({ id: 'user', strength: 66, seed: 10 });
    expect(predictSeason(squad, { seasons: 100, seed: 42 })).toEqual(
      predictSeason(squad, { seasons: 100, seed: 42 }),
    );
  });

  it('gives a clearly stronger squad more mean points', () => {
    const weak = createSyntheticTeam({ id: 'weak', strength: 50, seed: 11 });
    const strong = createSyntheticTeam({ id: 'strong', strength: 82, seed: 12 });
    const options = { seasons: 1_000, seed: 99 };
    expect(predictSeason(strong, options).meanPoints).toBeGreaterThan(
      predictSeason(weak, options).meanPoints,
    );
  });

  it('returns position probabilities that sum to one', () => {
    const squad = createSyntheticTeam({ id: 'user', strength: 65, seed: 13 });
    const result = predictSeason(squad, { seasons: 250, seed: 7 });
    expect(result.positionDistribution.reduce((sum, row) => sum + row.probability, 0)).toBeCloseTo(
      1,
      12,
    );
  });
});
