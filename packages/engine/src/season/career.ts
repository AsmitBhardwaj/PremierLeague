import { createRng } from '../rng';
import { teamProfile } from '../predict/ratings';
import { expectedGoals, samplePoisson } from '../predict/surrogate';
import type { MatchSnapshot, Player, Side, SideChanges, Tactic } from '../types';
import { hashSeed } from './hash';
import {
  Season,
  seasonPlayerId,
  type MatchdayOutcome,
  type PendingMatchday,
  type SeasonSetup,
  type UserLineup,
} from './season';
import { sortTable, type TableRow } from './table';

/** The January window opens once, after this many matchdays have been played. */
export const WINDOW_AFTER_ROUND = 20;

/** Half-time changes as logged: raw player ids from the user's squad. */
export interface HalfTimeDecision {
  tactic?: Tactic;
  substitutions?: { off: string; on: string }[];
}

/**
 * The decision log. Replaying it from the season seed reproduces the season exactly. Playback mode
 * (highlights, commentary, instant) is never logged: it cannot change an outcome.
 */
export type Decision =
  | { type: 'lineup'; formation: string; starters: string[]; tactic: Tactic }
  | { type: 'play'; halfTime?: HalfTimeDecision }
  | { type: 'sim'; to: 'next' | 'january' | 'end' }
  | { type: 'transfer'; out: string; in: string }
  | { type: 'closeWindow' };

export type Phase = 'matchday' | 'window' | 'finished';

export interface Projection {
  seasons: number;
  meanPoints: number;
  meanPosition: number;
  /** Probability of each finishing position, index 0 = 1st. */
  positions: number[];
  title: number;
  top4: number;
  relegation: number;
}

export interface PlayerView {
  id: string;
  fitness: number;
  form: number;
  injuredFor: number;
  suspendedFor: number;
  appearances: number;
  goals: number;
  assists: number;
}

/** A pending user match: first half played, waiting on half-time. */
export interface PendingPlay {
  readonly pending: PendingMatchday;
  readonly user: NonNullable<PendingMatchday['user']>;
}

/** A user-facing career: one season, the user's lineup, the January window and the decision log. */
export class Career {
  readonly season: Season;
  readonly decisions: Decision[] = [];
  private windowClosed = false;
  private open: PendingPlay | undefined;
  private readonly userClubId: string;
  private lastOutcome: MatchdayOutcome | undefined;

  constructor(
    readonly setup: SeasonSetup,
    decisions: readonly Decision[] = [],
  ) {
    if (setup.userClubId === undefined) throw new Error('a career needs a user club');
    this.userClubId = setup.userClubId;
    this.season = new Season(setup);
    for (const decision of decisions) this.apply(decision);
  }

  get phase(): Phase {
    if (this.season.finished) return 'finished';
    if (this.season.round === WINDOW_AFTER_ROUND && !this.windowClosed) return 'window';
    return 'matchday';
  }

  get round(): number {
    return this.season.round;
  }

  /** What the last matchday played in this session produced (not restored by replay). */
  get lastMatchday(): MatchdayOutcome | undefined {
    return this.lastOutcome;
  }

  // -------------------------------------------------------------- decisions

  apply(decision: Decision): void {
    if (this.open) throw new Error('finish the match in progress first');
    switch (decision.type) {
      case 'lineup': {
        const squad = new Set(this.season.squadOf(this.userClubId).map((p) => p.id));
        if (!decision.starters.every((id) => squad.has(id))) {
          throw new Error('every starter must belong to the squad');
        }
        this.season.setUserLineup({
          formation: decision.formation,
          starters: decision.starters,
          tactic: decision.tactic,
        });
        break;
      }
      case 'play': {
        const play = this.beginPlay();
        this.completePlay(decision.halfTime, play);
        return;
      }
      case 'sim': {
        this.requirePhase('matchday');
        if (decision.to === 'january' && this.windowClosed) {
          throw new Error('the January window has passed');
        }
        if (decision.to === 'january' && this.season.round > WINDOW_AFTER_ROUND) {
          throw new Error('the January window has passed');
        }
        do {
          this.lastOutcome = this.season.playMatchday();
        } while (decision.to !== 'next' && this.phase === 'matchday');
        break;
      }
      case 'transfer':
        throw new Error('The January window is not available yet');
      case 'closeWindow':
        this.requirePhase('window');
        this.windowClosed = true;
        break;
    }
    this.decisions.push(decision);
  }

  /** Start the next match for viewing: first half is played, half-time is the user's move. */
  beginPlay(): PendingPlay {
    this.requirePhase('matchday');
    if (this.open) throw new Error('a match is already in progress');
    const pending = this.season.beginMatchday();
    const user = pending.user!;
    this.open = { pending, user };
    return this.open;
  }

  /** Finish the match begun with `beginPlay` and log it; half-time ids are raw squad ids. */
  completePlay(halfTime?: HalfTimeDecision, play: PendingPlay | undefined = this.open): void {
    if (!play || play !== this.open) throw new Error('no match in progress');
    const club = this.userClubId;
    const changes: SideChanges | undefined = halfTime
      ? {
          ...(halfTime.tactic ? { tactic: halfTime.tactic } : {}),
          ...(halfTime.substitutions?.length
            ? {
                substitutions: halfTime.substitutions.map((s) => ({
                  off: seasonPlayerId(club, s.off),
                  on: seasonPlayerId(club, s.on),
                })),
              }
            : {}),
        }
      : undefined;
    this.lastOutcome = play.pending.finish(changes);
    this.open = undefined;
    this.decisions.push(halfTime ? { type: 'play', halfTime } : { type: 'play' });
  }

  /**
   * Drop a match that was begun but not finished. It was never logged, and beginning it again
   * replays the same first half from the same seed.
   */
  abandonPlay(): void {
    this.open = undefined;
    this.season.abandonMatchday();
  }

  get inProgress(): PendingPlay | undefined {
    return this.open;
  }

  private requirePhase(phase: Phase): void {
    if (this.phase !== phase) throw new Error(`not available during the ${this.phase} phase`);
  }

  // ------------------------------------------------------------------ views

  squadStates(): PlayerView[] {
    return this.season.squadOf(this.userClubId).map((p) => {
      const s = this.season.playerState(this.userClubId, p.id)!;
      return {
        id: p.id,
        fitness: s.fitness,
        form: s.form,
        injuredFor: s.injuredFor,
        suspendedFor: s.suspendedFor,
        appearances: s.appearances,
        goals: s.goals,
        assists: s.assists,
      };
    });
  }

  /** League positions (1-based by club) after the given number of matchdays. */
  positionsAfter(rounds: number): Map<string, number> {
    const rows = new Map<string, TableRow>();
    for (const id of this.season.clubIds()) {
      rows.set(id, {
        clubId: id,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      });
    }
    for (const r of this.season.matchRecords()) {
      if (r.round >= rounds) continue;
      const h = rows.get(r.home)!;
      const a = rows.get(r.away)!;
      h.goalsFor += r.homeGoals;
      h.goalsAgainst += r.awayGoals;
      a.goalsFor += r.awayGoals;
      a.goalsAgainst += r.homeGoals;
      h.points += r.homeGoals > r.awayGoals ? 3 : r.homeGoals === r.awayGoals ? 1 : 0;
      a.points += r.awayGoals > r.homeGoals ? 3 : r.homeGoals === r.awayGoals ? 1 : 0;
    }
    for (const row of rows.values()) row.goalDifference = row.goalsFor - row.goalsAgainst;
    return new Map(sortTable([...rows.values()]).map((row, i) => [row.clubId, i + 1]));
  }

  /** The user's next fixture, with the ground and the opponent. */
  nextFixture(): { round: number; venue: Side; opponentId: string } | undefined {
    const round = this.season.round;
    const fixture = this.season.rounds[round]?.find(
      (f) => f.home === this.userClubId || f.away === this.userClubId,
    );
    if (!fixture) return undefined;
    const venue: Side = fixture.home === this.userClubId ? 'home' : 'away';
    return { round, venue, opponentId: venue === 'home' ? fixture.away : fixture.home };
  }

  /**
   * Monte Carlo over the remaining fixtures from the current table, using each club's side as it
   * would line up today. Deterministic from the season seed and the round.
   */
  projection(seasons = 2000): Projection {
    const ids = this.season.clubIds();
    const profiles = new Map(ids.map((id) => [id, teamProfile(this.season.nominalTeam(id))]));
    const index = new Map(ids.map((id, i) => [id, i]));
    const remaining = this.season.rounds.slice(this.season.round).flat();
    const lambdas = remaining.map((f) => {
      const h = profiles.get(f.home)!;
      const a = profiles.get(f.away)!;
      return [
        index.get(f.home)!,
        index.get(f.away)!,
        expectedGoals(h, a, true),
        expectedGoals(a, h, false),
      ] as const;
    });
    const base = this.season.table();
    const start = ids.map((id) => base.find((r) => r.clubId === id)!);
    const userIndex = index.get(this.userClubId)!;
    const rng = createRng(hashSeed(this.season.seed, this.season.round, 'projection'));
    const positions = new Array<number>(ids.length).fill(0);
    let pointsSum = 0;
    const n = ids.length;
    for (let s = 0; s < seasons; s++) {
      const pts = start.map((r) => r.points);
      const gd = start.map((r) => r.goalDifference);
      const gf = start.map((r) => r.goalsFor);
      for (const [h, a, lh, la] of lambdas) {
        const x = samplePoisson(lh, rng);
        const y = samplePoisson(la, rng);
        gd[h]! += x - y;
        gd[a]! += y - x;
        gf[h]! += x;
        gf[a]! += y;
        if (x > y) pts[h]! += 3;
        else if (x < y) pts[a]! += 3;
        else {
          pts[h]!++;
          pts[a]!++;
        }
      }
      let pos = 1;
      for (let c = 0; c < n; c++) {
        if (c === userIndex) continue;
        if (
          pts[c]! > pts[userIndex]! ||
          (pts[c] === pts[userIndex] &&
            (gd[c]! > gd[userIndex]! ||
              (gd[c] === gd[userIndex] &&
                (gf[c]! > gf[userIndex]! ||
                  (gf[c] === gf[userIndex] && ids[c]! < ids[userIndex]!)))))
        ) {
          pos++;
        }
      }
      positions[pos - 1]!++;
      pointsSum += pts[userIndex]!;
    }
    const p = positions.map((c) => c / seasons);
    return {
      seasons,
      meanPoints: pointsSum / seasons,
      meanPosition: p.reduce((sum, v, i) => sum + v * (i + 1), 0),
      positions: p,
      title: p[0]!,
      top4: p.slice(0, 4).reduce((a, b) => a + b, 0),
      relegation: p.slice(-3).reduce((a, b) => a + b, 0),
    };
  }

  userLineup(): UserLineup {
    return this.season.userLineup()!;
  }

  squad(): readonly Player[] {
    return this.season.squadOf(this.userClubId);
  }

  snapshotOfPending(): MatchSnapshot | undefined {
    return this.open?.user.snapshot;
  }
}
