import parameters from './data/surrogate-parameters.json';
import { createRng, type Rng } from '../rng';
import type { TeamProfile } from './ratings';

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

/** Order of a profile's entries in the feature vector (own side first, then the opponent). */
export const PROFILE_KEYS = [
  'passing',
  'dribbling',
  'shooting',
  'tackling',
  'positioning',
  'pace',
  'keeper',
  'forwardShooting',
  'defenderDefending',
  'midfieldDefending',
  'defenders',
  'forwards',
] as const satisfies readonly (keyof TeamProfile)[];

/**
 * Own attacking qualities and the opponent's defending qualities, which interact: a keeper stops
 * more of the shots a better attack takes, so the effect is a product, not a sum. The feature
 * vector ends with every own-attack x opponent-defence product, in this order.
 */
export const ATTACK_KEYS = [
  'passing',
  'dribbling',
  'shooting',
  'pace',
  'forwardShooting',
  'forwards',
] as const satisfies readonly (keyof TeamProfile)[];
export const DEFENCE_KEYS = [
  'tackling',
  'positioning',
  'keeper',
  'defenderDefending',
  'midfieldDefending',
  'defenders',
] as const satisfies readonly (keyof TeamProfile)[];

export const SURROGATE_PARAMETERS = parameters as SurrogateParameters;

const lowAttackFeature = (profile: TeamProfile, scale: number): number => {
  const quality =
    (profile.passing + profile.dribbling + profile.shooting + profile.forwardShooting) / 4;
  return Math.min(0, (quality - 55) / scale);
};

/** Corrects the remaining global low-attack edge after the fitted hinge (zero for normal teams). */
const LOW_ATTACK_CALIBRATION = 0.115;

/** Feature order is persisted alongside the coefficients to keep regeneration auditable. */
export function surrogateFeatures(
  own: TeamProfile,
  opponent: TeamProfile,
  isHome: boolean,
  params: SurrogateParameters = SURROGATE_PARAMETERS,
): number[] {
  const scaled = (value: number): number => (value - params.ratingCenter) / params.ratingScale;
  const ratings = [own, opponent].flatMap((team) => PROFILE_KEYS.map((key) => scaled(team[key])));
  // A joint low-attack hinge stops legal-floor squads being an extrapolation of independent skill
  // curves. It is global: every side with an exceptionally weak attacking unit gets the same rule.
  const lowAttack = lowAttackFeature(own, params.ratingScale);
  const crosses = ATTACK_KEYS.flatMap((attack) =>
    DEFENCE_KEYS.map((defence) => scaled(own[attack]) * scaled(opponent[defence])),
  );
  return [
    1,
    isHome ? 1 : 0,
    lowAttack,
    ...ratings,
    ...ratings.map((rating) => rating * rating),
    ...crosses,
  ];
}

export function expectedGoals(
  own: TeamProfile,
  opponent: TeamProfile,
  isHome: boolean,
  params: SurrogateParameters = SURROGATE_PARAMETERS,
): number {
  const features = surrogateFeatures(own, opponent, isHome, params);
  const linear = features.reduce(
    (sum, feature, index) => sum + feature * (params.coefficients[index] ?? 0),
    0,
  );
  const calibrated = linear + LOW_ATTACK_CALIBRATION * lowAttackFeature(own, params.ratingScale);
  return Math.max(0.05, Math.min(6, Math.exp(calibrated)));
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
  home: TeamProfile,
  away: TeamProfile,
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
