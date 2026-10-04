export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

export type Tactic = 'balanced' | 'high_press' | 'counter' | 'defensive';

export type Side = 'home' | 'away';

/** Each rating is 0-100. */
export interface PlayerRatings {
  passing: number;
  dribbling: number;
  shooting: number;
  tackling: number;
  positioning: number;
  pace: number;
  goalkeeping: number;
}

export interface Player {
  id: string;
  name: string;
  position: Position;
  ratings: PlayerRatings;
}

export interface Team {
  id: string;
  name: string;
  /** e.g. "4-4-2"; the numbers must sum to 10 outfield players. */
  formation: string;
  /** Exactly 11 players, exactly one of them a GK. */
  players: Player[];
  /** Optional substitutes (max 5 may be used per match). */
  bench?: Player[];
  tactic: Tactic;
}

export interface MatchInput {
  /** The team playing at home (attacks left-to-right, x increasing). */
  home: Team;
  away: Team;
  /** Integer seed for the single random stream used by the whole match. */
  seed: number;
  /**
   * Optional starting stamina (0-100) by player id; players not listed start at 100. Season play
   * uses it to carry fitness between matches. Absent, the match is identical to earlier versions.
   */
  startStamina?: Readonly<Record<string, number>>;
}

export interface Point {
  /** 0-105 metres along the pitch. Home attacks towards x=105. */
  x: number;
  /** 0-68 metres across the pitch. */
  y: number;
}

export type ActionType =
  | 'kickoff'
  | 'pass'
  | 'long_ball'
  | 'dribble'
  | 'shot'
  | 'foul'
  | 'card'
  | 'corner'
  | 'injury'
  | 'substitution'
  | 'tactic_change'
  | 'half_time'
  | 'full_time';

export type Outcome =
  | 'success'
  | 'fail'
  | 'goal'
  | 'saved'
  | 'blocked'
  | 'off_target'
  | 'free_kick'
  | 'penalty'
  | 'yellow_card'
  | 'red_card'
  | 'none';

export interface MatchEvent {
  /** Match minute 1-90 (first-half stoppage is minute 45, second-half stoppage 90). */
  minute: number;
  /** Minutes of stoppage time beyond `minute` (0 during normal time). */
  addedTime: number;
  /** Seconds of play since kick-off, stoppage included. */
  elapsed: number;
  period: 1 | 2;
  /** Team performing the action; null for whole-match events. */
  teamId: string | null;
  playerId: string | null;
  /** Substitution events only: the player who left the pitch (`playerId` is the player who came on). */
  offPlayerId?: string;
  action: ActionType;
  outcome: Outcome;
  start: Point;
  end: Point;
  /** Shot quality, for shots only. */
  xg?: number;
  commentary: string;
}

export interface PlayerMatchRating {
  playerId: string;
  teamId: string;
  name: string;
  /** 1.0-10.0 */
  rating: number;
  /**
   * The same 1.0-10.0 scale, but from the player's own actions only: no team-result or
   * clean-sheet terms. Season form is built from this.
   */
  individual: number;
  minutesPlayed: number;
  goals: number;
  assists: number;
  shots: number;
  saves: number;
  yellowCards: number;
  redCard: boolean;
}

export interface TeamStats {
  /** Percentage of playing time with the ball. */
  possession: number;
  shots: number;
  shotsOnTarget: number;
  xg: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  corners: number;
  injuries: number;
}

export interface MatchResult {
  events: MatchEvent[];
  score: { home: number; away: number };
  playerRatings: PlayerMatchRating[];
  stats: Record<Side, TeamStats>;
}

export interface PlayerSnapshot {
  playerId: string;
  teamId: string;
  position: Position;
  /** 0-100; falls faster for pressing teams. */
  stamina: number;
  yellowCards: number;
  sentOff: boolean;
  injured: boolean;
  onPitch: boolean;
}

export interface MatchSnapshot {
  period: 'not_started' | 'first_half' | 'half_time' | 'full_time';
  score: { home: number; away: number };
  events: readonly MatchEvent[];
  players: PlayerSnapshot[];
  substitutionsUsed: Record<Side, number>;
  tactics: Record<Side, Tactic>;
}

export interface SideChanges {
  tactic?: Tactic;
  substitutions?: { off: string; on: string }[];
}

export interface HalfTimeChanges {
  home?: SideChanges;
  away?: SideChanges;
}
