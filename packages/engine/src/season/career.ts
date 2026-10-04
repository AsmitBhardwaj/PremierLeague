import { createRng } from '../rng';
import { teamProfile } from '../predict/ratings';
import { expectedGoals, samplePoisson } from '../predict/surrogate';
import type {
  MatchResult,
  MatchSnapshot,
  Player,
  Position,
  Side,
  SideChanges,
  Tactic,
  Team,
} from '../types';
import type { Fixture } from './fixtures';
import { hashSeed } from './hash';
import {
  Season,
  seasonPlayerId,
  type MatchdayOutcome,
  type PendingMatchday,
  type PlayerSeasonStat,
  type SeasonSetup,
  type UserLineup,
} from './season';
import { sortTable, type TableRow } from './table';

/** The January window opens once, after this many matchdays have been played. */
export const WINDOW_AFTER_ROUND = 20;
/** Most swaps (a sale plus a purchase) the January window allows. */
export const MAX_TRANSFERS = 3;
/** No more than this many of the user's players from one real club. */
export const MAX_PER_CLUB = 3;

/** Half-time changes as logged: raw player ids from the user's squad. */
export interface HalfTimeDecision {
  tactic?: Tactic;
  substitutions?: { off: string; on: string }[];
}

/**
 * The decision log. A decision is logged the moment the simulation uses it, so it cannot be taken
 * back: `kickoff` fixes the XI, formation and tactic (the first half is simulated from them) and
 * `halftime` fixes the changes (the second half is simulated from them). Replaying it from the season seed reproduces the season exactly. Playback mode
 * (highlights, commentary, instant) is never logged: it cannot change an outcome.
 */
export type Decision =
  | { type: 'lineup'; formation: string; starters: string[]; tactic: Tactic }
  /** Kick-off of a match the user plays: logs the XI, formation and tactic the first half uses. */
  | { type: 'kickoff'; formation: string; starters: string[]; tactic: Tactic }
  /** Half-time changes, logged as the second half is simulated. The match is then decided. */
  | ({ type: 'halftime' } & HalfTimeDecision)
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

/** A match the user kicked off and decided: both halves are in the log, so only playback is left. */
export interface WatchedMatch {
  round: number;
  fixture: Fixture;
  home: Team;
  away: Team;
  userSide: Side;
  result: MatchResult;
  /** Number of events up to and including half-time. */
  firstHalfEvents: number;
}

/** A pending user match: first half played, waiting on half-time. */
export interface PendingPlay {
  readonly pending: PendingMatchday;
  readonly user: NonNullable<PendingMatchday['user']>;
}

/** A player's season line for the awards. */
export interface AwardLine {
  playerId: string;
  name: string;
  position: Position;
  clubId: string;
  appearances: number;
  goals: number;
  assists: number;
  averageRating: number;
}

export interface SeasonAwards {
  /** League-wide, from the engine's match ratings. */
  topScorer: AwardLine | null;
  playerOfSeason: AwardLine | null;
  /** The same two awards among the user's own players, for the matches they played for the club. */
  userTopScorer: AwardLine | null;
  userBestPlayer: AwardLine | null;
  /** The ranked top three behind each award (the winner is the first), for showing the race. */
  races: {
    topScorer: AwardLine[];
    playerOfSeason: AwardLine[];
    userTopScorer: AwardLine[];
    userBestPlayer: AwardLine[];
  };
}

/** How many players each award's race lists. */
export const AWARD_RACE_SIZE = 3;

/** Fewest appearances to win player of the season (a hot streak in a few games is not a season). */
export const MIN_AWARD_APPEARANCES = 15;
/** Fewest appearances for the user's best player (squads rotate, and a January signing plays fewer). */
const MIN_USER_APPEARANCES = 8;

const line = (s: PlayerSeasonStat): AwardLine => ({
  playerId: s.playerId,
  name: s.name,
  position: s.position,
  clubId: s.clubId,
  appearances: s.appearances,
  goals: s.goals,
  assists: s.assists,
  averageRating: s.appearances ? s.ratingSum / s.appearances : 0,
});

const byGoals = (a: AwardLine, b: AwardLine): number =>
  b.goals - a.goals ||
  b.assists - a.assists ||
  a.appearances - b.appearances ||
  a.playerId.localeCompare(b.playerId) ||
  a.clubId.localeCompare(b.clubId);

const byRating = (a: AwardLine, b: AwardLine): number =>
  b.averageRating - a.averageRating ||
  b.goals - a.goals ||
  a.playerId.localeCompare(b.playerId) ||
  a.clubId.localeCompare(b.clubId);

/** A user-facing career: one season, the user's lineup, the January window and the decision log. */
export class Career {
  readonly season: Season;
  readonly decisions: Decision[] = [];
  private windowClosed = false;
  private open: PendingPlay | undefined;
  private readonly userClubId: string;
  private lastOutcome: MatchdayOutcome | undefined;
  private watched: WatchedMatch | undefined;

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
    if (this.open && decision.type !== 'halftime') {
      throw new Error('finish the match in progress first');
    }
    switch (decision.type) {
      case 'lineup':
        this.setLineup(decision);
        break;
      case 'kickoff': {
        this.requirePhase('matchday');
        this.setLineup(decision);
        const pending = this.season.beginMatchday();
        this.open = { pending, user: pending.user! };
        break;
      }
      case 'halftime': {
        const play = this.open;
        if (!play) throw new Error('no match in progress');
        const club = this.userClubId;
        const changes: SideChanges = {
          ...(decision.tactic ? { tactic: decision.tactic } : {}),
          ...(decision.substitutions?.length
            ? {
                substitutions: decision.substitutions.map((sub) => ({
                  off: seasonPlayerId(club, sub.off),
                  on: seasonPlayerId(club, sub.on),
                })),
              }
            : {}),
        };
        const round = this.season.round;
        // The snapshot's event list is live; count the first half before the second is played.
        const firstHalfEvents = play.user.snapshot.events.length;
        this.lastOutcome = play.pending.finish(changes);
        this.open = undefined;
        this.watched = {
          round,
          fixture: play.user.fixture,
          home: play.user.home,
          away: play.user.away,
          userSide: play.user.userSide,
          result: this.lastOutcome.userMatch!.result,
          firstHalfEvents,
        };
        break;
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
        this.requirePhase('window');
        this.swap(decision.out, decision.in);
        break;
      case 'closeWindow':
        this.requirePhase('window');
        this.windowClosed = true;
        break;
    }
    this.decisions.push(decision);
  }

  /** Sell `outId` and sign `inId` in his position, or throw with the rule that stops it. */
  private swap(outId: string, inId: string): void {
    if (this.transfersMade >= MAX_TRANSFERS) {
      throw new Error(`The window allows ${MAX_TRANSFERS} transfers.`);
    }
    const squad = this.season.squadOf(this.userClubId);
    const sold = squad.find((p) => p.id === outId);
    if (!sold) throw new Error('That player is not in your squad.');
    if (squad.some((p) => p.id === inId)) throw new Error('That player is already in your squad.');
    const target = this.season.findSignable(inId);
    if (!target) throw new Error('That player is not on the market.');
    if (target.player.position !== sold.position) {
      throw new Error(`A transfer must be a ${sold.position} for a ${sold.position}.`);
    }
    const clubOf = (id: string) => this.season.findSignable(id)?.clubId;
    const fromClub = squad.filter((p) => p.id !== outId && clubOf(p.id) === target.clubId).length;
    if (fromClub >= MAX_PER_CLUB) {
      throw new Error(`You already have ${MAX_PER_CLUB} players from that club.`);
    }
    const market = this.season.transferMarket;
    if (market) {
      const value = (id: string) => market.values[id] ?? 0;
      const cost = squad.reduce((sum, p) => sum + value(p.id), 0) - value(outId) + value(inId);
      if (cost > market.budget + 1e-9) throw new Error('That signing is over budget.');
    }
    this.season.swapUserPlayer(outId, target.player, target.clubId);
  }

  private setLineup(decision: { formation: string; starters: string[]; tactic: Tactic }): void {
    const squad = new Set(this.season.squadOf(this.userClubId).map((p) => p.id));
    if (!decision.starters.every((id) => squad.has(id))) {
      throw new Error('every starter must belong to the squad');
    }
    this.season.setUserLineup({
      formation: decision.formation,
      starters: decision.starters,
      tactic: decision.tactic,
    });
  }

  /** Kick off the next match with this lineup (logged now) and play the first half. */
  kickOff(lineup: UserLineup): PendingPlay {
    this.apply({ type: 'kickoff', ...lineup, starters: [...lineup.starters] });
    return this.open!;
  }

  /** Log half-time changes and play the second half. */
  halfTime(changes: HalfTimeDecision = {}): void {
    this.apply({ type: 'halftime', ...changes });
  }

  /** Kick off and decide the match at once, with no half-time changes (instant mode). */
  playInstant(lineup: UserLineup): void {
    this.kickOff(lineup);
    this.halfTime();
  }

  /** The user's most recent match played through kick-off and half-time, with its full result. */
  get lastWatched(): WatchedMatch | undefined {
    return this.watched;
  }

  /**
   * End-of-season awards. League-wide, a player counts for all the clubs he played for (a signing
   * the user made has a line at his real club too), under the club where he played most.
   */
  awards(): SeasonAwards {
    const stats = this.season.playerStats();
    const merged = new Map<string, AwardLine>();
    for (const s of stats) {
      const mine = line(s);
      const seen = merged.get(s.playerId);
      if (!seen) {
        merged.set(s.playerId, mine);
        continue;
      }
      const goals = seen.goals + mine.goals;
      const assists = seen.assists + mine.assists;
      const appearances = seen.appearances + mine.appearances;
      const total = seen.averageRating * seen.appearances + mine.averageRating * mine.appearances;
      const home = mine.appearances > seen.appearances ? mine.clubId : seen.clubId;
      merged.set(s.playerId, {
        ...seen,
        clubId: home,
        goals,
        assists,
        appearances,
        averageRating: total / appearances,
      });
    }
    const all = [...merged.values()];
    const eligible = all.filter((p) => p.appearances >= MIN_AWARD_APPEARANCES);
    const mineOnly = stats.filter((s) => s.clubId === this.userClubId).map(line);
    const mineEligible = mineOnly.filter((p) => p.appearances >= MIN_USER_APPEARANCES);
    const rank = (list: AwardLine[], order: (a: AwardLine, b: AwardLine) => number) =>
      [...list].sort(order).slice(0, AWARD_RACE_SIZE);
    const scorers = rank(
      all.filter((p) => p.goals > 0),
      byGoals,
    );
    const userScorers = rank(
      mineOnly.filter((p) => p.goals > 0),
      byGoals,
    );
    const best = rank(eligible.length ? eligible : all, byRating);
    const userBest = rank(mineEligible.length ? mineEligible : mineOnly, byRating);
    return {
      topScorer: scorers[0] ?? null,
      playerOfSeason: best[0] ?? null,
      userTopScorer: userScorers[0] ?? null,
      userBestPlayer: userBest[0] ?? null,
      races: {
        topScorer: scorers,
        playerOfSeason: best,
        userTopScorer: userScorers,
        userBestPlayer: userBest,
      },
    };
  }

  /** Swaps made in the January window so far. */
  get transfersMade(): number {
    return this.decisions.filter((d) => d.type === 'transfer').length;
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
