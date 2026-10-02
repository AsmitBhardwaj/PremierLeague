import type { Position, Tactic } from './types';

/** Every tunable constant of the match engine lives here (see scripts/src/calibrate.ts). */
export const TUNING = {
  /** Seconds of game time consumed by one on-ball action. */
  stepSeconds: [6, 14] as const,
  counterStepSeconds: [3, 7] as const,
  /** Steps a counter-attack stays "live" after the ball is won. */
  counterMaxSteps: 5,

  /** Logit slope per rating point of difference between attacker and defender. */
  ratingSlope: 0.018,
  passBase: 0.8,
  safePassBonus: 0.08,
  longBallBase: 0.5,
  dribbleBase: 0.55,

  /** Rating points added to every home player. */
  homeBonus: 2.0,
  /** Fraction of a rating lost at 0 stamina. */
  fatigueImpact: 0.35,
  /** Stamina points lost over a full 90 minutes at multiplier 1. */
  fatiguePer90: 25,
  halftimeRecovery: 8,
  minStamina: 15,
  /** Rating lost per missing player (sent off / injured with no sub). */
  manDownPenalty: 0.04,

  pressBonus: 6,
  defensiveBonus: 5,
  counterDefPenalty: 6,
  counterBuildPenalty: 3,
  counterXgBonus: 1.3,

  /** Shot propensity by attacking column (0 = own goal line, 5 = opponent box). */
  shotWeight: [0, 0, 0.007, 0.019, 0.06, 0.21] as readonly number[],
  wideShotFactor: 0.7,
  dribbleWeight: 0.16,
  longBallWeight: [0.22, 0.16, 0.09, 0.04, 0, 0] as readonly number[],
  shotPositionFactor: { GK: 0, DEF: 0.35, MID: 0.8, FWD: 1.2 } as Record<Position, number>,

  /** Base xG by [column][lane]; lane 1 is central. */
  xgTable: [
    [0, 0, 0],
    [0, 0, 0],
    [0.003, 0.005, 0.003],
    [0.007, 0.014, 0.007],
    [0.018, 0.045, 0.018],
    [0.062, 0.135, 0.062],
  ] as readonly (readonly number[])[],
  penaltyXg: 0.76,
  keeperSlope: 0.006,
  onTargetBase: 0.38,
  blockedShare: 0.3,
  cornerAfterSave: 0.25,
  cornerAfterBlock: 0.35,
  reboundKeepsBall: 0,

  foulOnLostDuel: 0.2,
  backgroundFoul: 0.03,
  penaltyShare: { central: 0.28, wide: 0.1 },
  yellowGivenFoul: 0.11,
  redGivenFoul: 0.0015,
  injuryPerStep: 0.0005,
  maxSubstitutions: 5,

  tactics: {
    balanced: {
      shot: 1,
      dribble: 1,
      longBall: 1,
      forward: 0.5,
      stamina: 1,
      xgAgainst: 1,
      cards: 1,
    },
    high_press: {
      shot: 1,
      dribble: 1,
      longBall: 0.9,
      forward: 0.52,
      stamina: 1.8,
      xgAgainst: 1.08,
      cards: 1.3,
    },
    counter: {
      shot: 1,
      dribble: 1.1,
      longBall: 1.8,
      forward: 0.55,
      stamina: 1,
      xgAgainst: 1,
      cards: 1,
    },
    defensive: {
      shot: 0.75,
      dribble: 0.85,
      longBall: 1.3,
      forward: 0.4,
      stamina: 0.8,
      xgAgainst: 0.82,
      cards: 1,
    },
  } as Record<
    Tactic,
    {
      shot: number;
      dribble: number;
      longBall: number;
      forward: number;
      stamina: number;
      xgAgainst: number;
      cards: number;
    }
  >,

  positionStamina: { GK: 0.15, DEF: 0.9, MID: 1.1, FWD: 1 } as Record<Position, number>,

  /** How involved each position is in each attacking column (0..5). */
  zoneWeight: {
    GK: [0.35, 0, 0, 0, 0, 0],
    DEF: [1, 1, 0.8, 0.3, 0.08, 0.03],
    MID: [0.2, 0.6, 1, 1, 0.7, 0.3],
    FWD: [0.02, 0.05, 0.25, 0.7, 1, 1],
  } as Record<Position, readonly number[]>,
} as const;
