import type { Position, Team } from '../types';

export interface PredictSeasonOptions {
  /** Number of simulated seasons; limited by the checked-in background data. */
  seasons?: number;
  seed?: number;
  /** One of the promoted club ids included in the background data. */
  replacedClubId?: string;
  /**
   * The side each real club would field against this squad, matched to the background by team id.
   * Season play never lets a club field a player the user has signed against the user, so callers
   * pass each club's XI without those players. Clubs not listed use their full-strength side.
   */
  opponents?: readonly Team[];
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

/** Average season totals for the user's club across the simulated seasons. */
export interface TeamForecast {
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheets: number;
}

/** One player's average season across the forecast batch. */
export interface PlayerForecast {
  playerId: string;
  name: string;
  position: Position;
  goals: number;
  assists: number;
  /** Mean match rating over his appearances. */
  averageRating: number;
  /** Appearances a season. */
  appearances: number;
}

/** What the season preview keeps from the event-engine batch (small enough to save). */
export interface ForecastSummary {
  /** How many full seasons of the user's 38 matches were played. */
  seasons: number;
  yellowCards: number;
  redCards: number;
  topScorer: PlayerForecast | null;
  topAssister: PlayerForecast | null;
  starPlayer: PlayerForecast | null;
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
  /** Average record and goals per season; absent in predictions saved before the season preview. */
  teamStats?: TeamForecast;
  /** Player and card forecast from the event engine; filled in after the prediction itself. */
  forecast?: ForecastSummary;
}

export type UserSquad = Team;
