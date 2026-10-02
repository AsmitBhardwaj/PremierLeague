import type { Team } from '../types';

export interface PredictSeasonOptions {
  /** Number of simulated seasons; limited by the checked-in background data. */
  seasons?: number;
  seed?: number;
  /** One of the promoted club ids included in the background data. */
  replacedClubId?: string;
}

export interface HistogramBin {
  min: number;
  max: number;
  count: number;
  probability: number;
}

export interface PositionProbability {
  position: number;
  count: number;
  probability: number;
}

export interface OpponentExpectedPoints {
  opponentId: string;
  opponentName: string;
  home: number;
  away: number;
  total: number;
}

export interface SeasonPrediction {
  seasons: number;
  seed: number;
  replacedClubId: string;
  meanPoints: number;
  pointsDistribution: HistogramBin[];
  positionDistribution: PositionProbability[];
  titleProbability: number;
  top4Probability: number;
  relegationProbability: number;
  perOpponentExpectedPoints: OpponentExpectedPoints[];
}

export type UserSquad = Team;
