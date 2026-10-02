import parameters from './data/surrogate-parameters.json';
import { createRng, type Rng } from '../rng';
import type { TeamAggregateRatings } from './ratings';

export interface SurrogateParameters {
  version: number;
  ratingCenter: number;
  ratingScale: number;
  featureNames: string[];
  coefficients: number[];
  trainingMatches: number;
}

export interface SurrogateMatch {
  homeGoals: number;
  awayGoals: number;
  homeExpectedGoals: number;
  awayExpectedGoals: number;
}

export const SURROGATE_PARAMETERS = parameters as SurrogateParameters;

/** Feature order is persisted alongside the coefficients to keep regeneration auditable. */
export function surrogateFeatures(
  own: TeamAggregateRatings,
  opponent: TeamAggregateRatings,
  isHome: boolean,
  params: SurrogateParameters = SURROGATE_PARAMETERS,
): number[] {
  const scaled = (value: number): number => (value - params.ratingCenter) / params.ratingScale;
  const ratings = [
    scaled(own.attack),
    scaled(own.midfield),
    scaled(own.defence),
    scaled(own.keeper),
    scaled(own.benchDepth),
    scaled(opponent.attack),
    scaled(opponent.midfield),
    scaled(opponent.defence),
    scaled(opponent.keeper),
    scaled(opponent.benchDepth),
  ];
  return [1, isHome ? 1 : 0, ...ratings, ...ratings.map((rating) => rating * rating)];
}

export function expectedGoals(
  own: TeamAggregateRatings,
  opponent: TeamAggregateRatings,
  isHome: boolean,
  params: SurrogateParameters = SURROGATE_PARAMETERS,
): number {
  const features = surrogateFeatures(own, opponent, isHome, params);
  const linear = features.reduce(
    (sum, feature, index) => sum + feature * (params.coefficients[index] ?? 0),
    0,
  );
  return Math.max(0.05, Math.min(6, Math.exp(linear)));
}

export function samplePoisson(lambda: number, rng: Rng): number {
  // Football lambdas are small, so Knuth's exact method is both simpler and faster here.
  const limit = Math.exp(-lambda);
  let product = 1;
  let count = 0;
  do {
    count++;
    product *= rng();
  } while (product > limit);
  return count - 1;
}

export function simulateSurrogateMatch(
  home: TeamAggregateRatings,
  away: TeamAggregateRatings,
  seedOrRng: number | Rng,
): SurrogateMatch {
  const rng = typeof seedOrRng === 'number' ? createRng(seedOrRng) : seedOrRng;
  const homeExpectedGoals = expectedGoals(home, away, true);
  const awayExpectedGoals = expectedGoals(away, home, false);
  return {
    homeGoals: samplePoisson(homeExpectedGoals, rng),
    awayGoals: samplePoisson(awayExpectedGoals, rng),
    homeExpectedGoals,
    awayExpectedGoals,
  };
}
