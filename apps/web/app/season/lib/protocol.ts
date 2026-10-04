import type {
  CareerSave,
  HalfTimeDecision,
  MatchEvent,
  MatchRecord,
  MatchResult,
  MatchSnapshot,
  Phase,
  PlayerView,
  Projection,
  SeasonPrediction,
  Side,
  Tactic,
  Team,
  UserLineup,
} from '@pl/engine';
import type { ClubIdentity } from '../../play/lib/persistence';
import type { Formation } from '../../play/lib/squad';

export interface TableEntry {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** Position after the previous matchday (equal to the current one before any match). */
  previousPosition: number;
}

export interface NextFixture {
  round: number;
  venue: Side;
  opponentId: string;
  odds: { win: number; draw: number; loss: number } | null;
}

/** Everything the screens need after any command, so the UI never reads engine state itself. */
export interface SeasonView {
  round: number;
  phase: Phase;
  table: TableEntry[];
  next: NextFixture | null;
  squad: PlayerView[];
  lineup: UserLineup;
  projection: Projection;
  /** The user's played matches, oldest first. */
  results: MatchRecord[];
  prediction: SeasonPrediction;
  identity: ClubIdentity;
  replacedClubId: string;
  squadIds: string[];
  /**
   * A match already decided in the log: playback resumes here and never returns to decisions.
   * `first_half`: kicked off, half-time still to decide. `second_half`: the result is fixed, only
   * its playback was cut short.
   */
  resume:
    | { kind: 'first_half'; start: MatchStart }
    | { kind: 'second_half'; finish: MatchFinish; firstHalfEvents: number }
    | null;
  save: CareerSave<ClubIdentity, SeasonPrediction>;
}

export interface MatchStart {
  home: Team;
  away: Team;
  userSide: Side;
  /** First-half events, kick-off to half-time. */
  events: MatchEvent[];
  /** The paused match (events omitted: they are in `events`). */
  snapshot: MatchSnapshot;
  seed: number;
  round: number;
}

export interface MatchFinish {
  result: MatchResult;
  userSide: Side;
  home: Team;
  away: Team;
  seed: number;
  round: number;
}

export type SeasonRequest =
  | {
      kind: 'create';
      identity: ClubIdentity;
      squadIds: string[];
      formation: Formation;
      starterIds: string[];
      seed: number;
    }
  | { kind: 'resume'; save: unknown }
  | { kind: 'lineup'; formation: Formation; starters: string[]; tactic: Tactic }
  /** Log the XI, formation and tactic and play the first half. */
  | { kind: 'kickoff'; formation: Formation; starters: string[]; tactic: Tactic }
  /** Log half-time changes and play the second half; the match is then decided. */
  | { kind: 'halftime'; changes?: HalfTimeDecision }
  /** Kick off and decide in one step (instant result). */
  | { kind: 'instant'; formation: Formation; starters: string[]; tactic: Tactic }
  /** The person has been shown the last watched result. */
  | { kind: 'ack' }
  | { kind: 'sim'; to: 'next' | 'january' | 'end' }
  | { kind: 'closeWindow' };

export type SeasonResponse =
  | {
      id: number;
      ok: true;
      view: SeasonView;
      start?: MatchStart;
      finish?: MatchFinish;
      /** Wall-clock milliseconds the worker spent on the command. */
      ms: number;
    }
  | { id: number; ok: false; error: string; reason?: string };

export type SeasonMessage = SeasonRequest & { id: number };
