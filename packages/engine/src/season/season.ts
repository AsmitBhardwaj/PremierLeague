import { Match } from '../engine';
import { createRng } from '../rng';
import { BENCH_SIZE, FORMATIONS, overall, pickSquad } from '../squads';
import type {
  HalfTimeChanges,
  MatchResult,
  MatchSnapshot,
  Player,
  PlayerRatings,
  Position,
  Side,
  SideChanges,
  Tactic,
  Team,
} from '../types';
import { SEASON } from './constants';
import { generateFixtures, type Fixture, type Round } from './fixtures';
import { hashSeed } from './hash';
import { addResult, emptyRow, sortTable, type TableRow } from './table';

export interface SeasonClubInput {
  id: string;
  name: string;
  /** The whole squad. Ids need only be unique within the club. */
  players: readonly Player[];
}

export interface UserLineup {
  formation: string;
  /** Eleven player ids from the user's squad. */
  starters: readonly string[];
  tactic: Tactic;
}

export interface SeasonSetup {
  seed: number;
  clubs: readonly SeasonClubInput[];
  /** The club a person manages; every other club (and this one, when absent) is automatic. */
  userClubId?: string;
  /**
   * Simulate only the user's matches (the other clubs never play, so they stay fresh and never get
   * hurt). For forecasts of the user's own season; every match the user plays is identical to the
   * full season's apart from the opponents' season dynamics.
   */
  userMatchesOnly?: boolean;
  /**
   * January-window money: the user's squad may never cost more than `budget` at these values.
   * Without it the window enforces only the squad shape.
   */
  transferMarket?: {
    budget: number;
    values: Readonly<Record<string, number>>;
    /** Players of real clubs that are not in the league (the replaced club): signable, never injured. */
    outside?: readonly { clubId: string; players: readonly Player[] }[];
  };
}

/** Per-player season state, tracked per club copy. */
export interface PlayerSeasonState {
  fitness: number;
  /** Weighted average of individual performance relative to the baseline (about -2 to +2). */
  form: number;
  injuredFor: number;
  suspendedFor: number;
  appearances: number;
  goals: number;
  assists: number;
  ratingSum: number;
}

/** One player's totals for one club (a player the user signed has a line for each club). */
export interface PlayerSeasonStat {
  playerId: string;
  name: string;
  position: Position;
  clubId: string;
  appearances: number;
  goals: number;
  assists: number;
  /** Sum of match ratings; divide by appearances for the average. */
  ratingSum: number;
}

export interface MatchRecord {
  round: number;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
}

export interface MatchdayOutcome {
  round: number;
  records: MatchRecord[];
  /** The full engine result of the user's match, when a user club is set. */
  userMatch?: { fixture: Fixture; result: MatchResult };
}

/** A matchday whose first halves are played, waiting on the user's half-time decisions. */
export interface PendingMatchday {
  readonly round: number;
  /** Present when a user club is set: the paused match and the sides as fielded. */
  readonly user?: {
    fixture: Fixture;
    home: Team;
    away: Team;
    userSide: Side;
    snapshot: MatchSnapshot;
  };
  /** Apply the user's half-time changes (season player ids) and play every match to full time. */
  finish(
    changes?: SideChanges,
    onMatch?: (fixture: Fixture, result: MatchResult) => void,
  ): MatchdayOutcome;
}

export interface PlayMatchdayOptions {
  /**
   * Half-time decisions for the user's club only; the opponent never changes. Player ids in the
   * snapshot and in the returned substitutions are season ids (see `seasonPlayerId`).
   */
  halfTime?: (snapshot: MatchSnapshot) => HalfTimeChanges | void;
  /** Called with every match of the round once played (calibration and statistics). */
  onMatch?: (fixture: Fixture, result: MatchResult) => void;
}

/** The id the season uses for a club's copy of a player. */
export const seasonPlayerId = (clubId: string, playerId: string): string => `${clubId}:${playerId}`;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const RATING_KEYS: readonly (keyof PlayerRatings)[] = [
  'passing',
  'dribbling',
  'shooting',
  'tackling',
  'positioning',
  'pace',
  'goalkeeping',
];

/**
 * `pickSquad`, except that a club short of a whole position (injuries to its only forward, say)
 * still fields a side: the missing slots go to the best remaining outfield players by their rating
 * for that position, playing out of position. The same rule applies to every club.
 */
export function fieldTeam(id: string, name: string, pool: readonly Player[], tactic: Tactic): Team {
  try {
    return pickSquad(id, name, pool, tactic);
  } catch {
    // fall through to the out-of-position fallback
  }
  const natural = (pos: Position): Player[] =>
    pool.filter((p) => p.position === pos).sort(byOverall);
  const keeper = natural('GK')[0];
  const outfield = pool.filter((p) => p.position !== 'GK');
  if (!keeper || outfield.length < 10) throw new Error(`${name} cannot field a team`);
  const shortage = (shape: readonly [number, number, number]): number =>
    (['DEF', 'MID', 'FWD'] as const).reduce(
      (sum, pos, i) => sum + Math.max(0, shape[i]! - natural(pos).length),
      0,
    );
  const shape = [...FORMATIONS].sort((a, b) => shortage(a) - shortage(b))[0]!;
  const xi: Player[] = [keeper];
  const used = new Set([keeper.id]);
  const slots = (['DEF', 'MID', 'FWD'] as const).map((pos, i) => ({ pos, need: shape[i]! }));
  for (const { pos, need } of slots) {
    for (const p of natural(pos).slice(0, need)) {
      xi.push(p);
      used.add(p.id);
    }
  }
  for (const { pos, need } of slots) {
    const have = xi.filter((p) => p.position === pos).length;
    const fill = outfield
      .filter((p) => !used.has(p.id))
      .sort((a, b) => overall(pos, b.ratings) - overall(pos, a.ratings) || a.id.localeCompare(b.id))
      .slice(0, need - have)
      .map((p) => ({ ...p, position: pos }));
    for (const p of fill) {
      xi.push(p);
      used.add(p.id);
    }
  }
  const rest = pool.filter((p) => !used.has(p.id)).sort(byOverall);
  const spareKeeper = rest.find((p) => p.position === 'GK');
  const bench = [
    ...(spareKeeper ? [spareKeeper] : []),
    ...rest.filter((p) => p !== spareKeeper && p.position !== 'GK'),
  ].slice(0, BENCH_SIZE);
  return { id, name, formation: shape.join('-'), tactic, players: xi, bench };
}

const byOverall = (a: Player, b: Player): number =>
  overall(b.position, b.ratings) - overall(a.position, a.ratings) || a.id.localeCompare(b.id);

/** Form as rating points added to all seven ratings, identical for every club. */
export const formModifier = (form: number): number =>
  clamp(SEASON.formScale * form, -SEASON.formCap, SEASON.formCap);

function drawInjuryLength(rng: () => number): number {
  const u = rng();
  const band = SEASON.injuryLengths.find((b) => u < b.upTo) ?? SEASON.injuryLengths.at(-1)!;
  return band.min + Math.floor(rng() * (band.max - band.min + 1));
}

/** A whole league season: fixtures, table, fitness, form, injuries and suspensions. */
export class Season {
  readonly seed: number;
  readonly rounds: Round[];
  readonly userClubId: string | undefined;
  private readonly userMatchesOnly: boolean;
  private clubs: ReadonlyMap<string, SeasonClubInput>;
  private readonly state = new Map<string, PlayerSeasonState>();
  private readonly rows = new Map<string, TableRow>();
  private readonly records: MatchRecord[] = [];
  private lineup: UserLineup | undefined;
  /** Players the user sold in the window, kept so their season totals still count. */
  private readonly departed = new Map<string, Player>();
  readonly transferMarket: SeasonSetup['transferMarket'];
  private nextRound = 0;
  private pending: PendingMatchday | undefined;

  constructor(setup: SeasonSetup) {
    this.seed = setup.seed;
    this.userClubId = setup.userClubId;
    this.userMatchesOnly = Boolean(setup.userMatchesOnly && setup.userClubId !== undefined);
    this.transferMarket = setup.transferMarket;
    this.clubs = new Map(setup.clubs.map((c) => [c.id, c]));
    if (this.clubs.size !== setup.clubs.length) throw new Error('club ids must be unique');
    if (this.userClubId !== undefined && !this.clubs.has(this.userClubId)) {
      throw new Error(`unknown user club ${this.userClubId}`);
    }
    for (const club of setup.clubs) {
      this.rows.set(club.id, emptyRow(club.id));
      for (const p of club.players) {
        this.state.set(seasonPlayerId(club.id, p.id), {
          fitness: 100,
          form: 0,
          injuredFor: 0,
          suspendedFor: 0,
          appearances: 0,
          goals: 0,
          assists: 0,
          ratingSum: 0,
        });
      }
    }
    this.rounds = generateFixtures(
      setup.clubs.map((c) => c.id),
      setup.seed,
    );
    if (this.userClubId !== undefined) {
      const squad = this.clubs.get(this.userClubId)!.players;
      this.lineup = this.defaultLineup(squad);
    }
  }

  // ------------------------------------------------------------------ state

  get round(): number {
    return this.nextRound;
  }

  get finished(): boolean {
    return this.nextRound >= this.rounds.length;
  }

  table(): TableRow[] {
    return sortTable([...this.rows.values()]);
  }

  matchRecords(): readonly MatchRecord[] {
    return this.records;
  }

  /** State of a club's copy of a player; `undefined` for an unknown player. */
  playerState(clubId: string, playerId: string): Readonly<PlayerSeasonState> | undefined {
    return this.state.get(seasonPlayerId(clubId, playerId));
  }

  /** Matches a player is still out for (injury or suspension, whichever is longer). */
  outFor(clubId: string, playerId: string): number {
    const s = this.playerState(clubId, playerId);
    return s ? Math.max(s.injuredFor, s.suspendedFor) : 0;
  }

  userLineup(): UserLineup | undefined {
    return this.lineup;
  }

  setUserLineup(lineup: UserLineup): void {
    if (this.userClubId === undefined) throw new Error('this season has no user club');
    if (lineup.starters.length !== 11) throw new Error('a lineup needs eleven starters');
    this.lineup = lineup;
  }

  /** A player of any club other than the user's, with the club that holds him. */
  findSignable(playerId: string): { player: Player; clubId: string } | undefined {
    for (const club of this.clubs.values()) {
      if (club.id === this.userClubId) continue;
      const player = club.players.find((p) => p.id === playerId);
      if (player) return { player, clubId: club.id };
    }
    for (const club of this.transferMarket?.outside ?? []) {
      const player = club.players.find((p) => p.id === playerId);
      if (player) return { player, clubId: club.clubId };
    }
    return undefined;
  }

  /**
   * January window: swap one of the user's players for another. The signing arrives with the
   * fitness, form and absence his real club's copy has today; the sold player's state is dropped.
   * The user's lineup keeps its shape: the new player takes the sold player's slot.
   */
  swapUserPlayer(outId: string, incoming: Player, fromClubId: string): void {
    const id = this.userClubId;
    if (id === undefined) throw new Error('this season has no user club');
    const club = this.clubs.get(id)!;
    // The sold player's totals stay in the books (end-of-season awards); his availability is moot.
    const sold = club.players.find((p) => p.id === outId);
    if (sold) this.departed.set(outId, sold);
    const source = this.state.get(seasonPlayerId(fromClubId, incoming.id));
    // A player bought back keeps what he did for the club earlier in the season.
    const earlier = this.state.get(seasonPlayerId(id, incoming.id));
    this.state.set(seasonPlayerId(id, incoming.id), {
      fitness: source?.fitness ?? 100,
      form: source?.form ?? 0,
      injuredFor: source?.injuredFor ?? 0,
      suspendedFor: source?.suspendedFor ?? 0,
      appearances: earlier?.appearances ?? 0,
      goals: earlier?.goals ?? 0,
      assists: earlier?.assists ?? 0,
      ratingSum: earlier?.ratingSum ?? 0,
    });
    this.departed.delete(incoming.id);
    this.clubs = new Map(this.clubs).set(id, {
      ...club,
      players: club.players.map((p) => (p.id === outId ? incoming : p)),
    });
    if (this.lineup) {
      this.lineup = {
        ...this.lineup,
        starters: this.lineup.starters.map((s) => (s === outId ? incoming.id : s)),
      };
    }
  }

  // -------------------------------------------------------------- selection

  private defaultLineup(squad: readonly Player[]): UserLineup {
    if (!squad.some((p) => p.position === 'GK'))
      throw new Error('the user squad needs a goalkeeper');
    const team = pickSquad('user', 'user', squad);
    return {
      formation: team.formation,
      starters: team.players.map((p) => p.id),
      tactic: 'balanced',
    };
  }

  /** A club's players as the engine should see them today: form-adjusted, copy-keyed, available. */
  private available(club: SeasonClubInput, excluded: ReadonlySet<string>): Player[] {
    const out: Player[] = [];
    for (const p of club.players) {
      if (excluded.has(p.id)) continue;
      const s = this.state.get(seasonPlayerId(club.id, p.id))!;
      if (s.injuredFor > 0 || s.suspendedFor > 0) continue;
      out.push(this.adjusted(club.id, p, s));
    }
    return this.withEmergencyKeeper(out);
  }

  private adjusted(clubId: string, p: Player, s: PlayerSeasonState): Player {
    const mod = formModifier(s.form);
    const ratings = { ...p.ratings };
    if (mod !== 0) for (const k of RATING_KEYS) ratings[k] = clamp(ratings[k] + mod, 1, 99);
    return { ...p, id: seasonPlayerId(clubId, p.id), ratings };
  }

  /** No keeper available: the outfield player with the best goalkeeping rating goes in goal. */
  private withEmergencyKeeper(players: Player[]): Player[] {
    if (players.some((p) => p.position === 'GK') || players.length === 0) return players;
    let best = 0;
    players.forEach((p, i) => {
      const b = players[best]!;
      if (
        p.ratings.goalkeeping > b.ratings.goalkeeping ||
        (p.ratings.goalkeeping === b.ratings.goalkeeping && p.id.localeCompare(b.id) < 0)
      )
        best = i;
    });
    return players.map((p, i) => (i === best ? { ...p, position: 'GK' as Position } : p));
  }

  private fitnessOf(player: Player): number {
    return this.state.get(player.id)?.fitness ?? 100;
  }

  private aiTeam(club: SeasonClubInput, excluded: ReadonlySet<string>): Team {
    const pool = this.available(club, excluded);
    const team = fieldTeam(club.id, club.name, pool, 'balanced');
    return this.rest(team, pool);
  }

  /** Rest starters below the fitness threshold when a fit same-position player is available. */
  private rest(team: Team, pool: readonly Player[]): Team {
    const xi = [...team.players];
    let bench = [...(team.bench ?? [])];
    const inXi = new Set(xi.map((p) => p.id));
    const rested: Player[] = [];
    for (let i = 0; i < xi.length; i++) {
      const starter = xi[i]!;
      if (this.fitnessOf(starter) >= SEASON.restBelowFitness) continue;
      const replacement = pool
        .filter(
          (p) =>
            p.position === starter.position &&
            !inXi.has(p.id) &&
            this.fitnessOf(p) >= SEASON.restBelowFitness,
        )
        .sort(byOverall)[0];
      if (!replacement) continue;
      xi[i] = replacement;
      inXi.delete(starter.id);
      inXi.add(replacement.id);
      rested.push(starter);
      bench = bench.filter((p) => p.id !== replacement.id);
    }
    if (rested.length === 0) return team;
    const taken = new Set([...inXi, ...rested.map((p) => p.id), ...bench.map((p) => p.id)]);
    const fill = pool.filter((p) => !taken.has(p.id) && p.position !== 'GK').sort(byOverall);
    const newBench = [...bench, ...rested, ...fill].slice(0, BENCH_SIZE);
    return { ...team, players: xi, bench: newBench };
  }

  private userTeam(club: SeasonClubInput, excluded: ReadonlySet<string>): Team {
    const lineup = this.lineup!;
    const pool = this.available(club, excluded);
    const byId = new Map(pool.map((p) => [p.id, p]));
    const squadPosition = new Map(club.players.map((p) => [seasonPlayerId(club.id, p.id), p]));
    const used = new Set<string>();
    const xi: (Player | undefined)[] = lineup.starters.map((raw) => {
      const key = seasonPlayerId(club.id, raw);
      const wanted = squadPosition.get(key)?.position;
      const p = byId.get(key);
      if (p && p.position === wanted) {
        used.add(key);
        return p;
      }
      return undefined;
    });
    for (let i = 0; i < xi.length; i++) {
      if (xi[i]) continue;
      const wanted = squadPosition.get(seasonPlayerId(club.id, lineup.starters[i]!))?.position;
      const sub = pool.filter((p) => p.position === wanted && !used.has(p.id)).sort(byOverall)[0];
      if (!sub) {
        // A position cannot be filled: only then does the formation change.
        return fieldTeam(club.id, club.name, pool, lineup.tactic);
      }
      used.add(sub.id);
      xi[i] = sub;
    }
    const rest = pool.filter((p) => !used.has(p.id)).sort(byOverall);
    const keeper = rest.find((p) => p.position === 'GK');
    const bench = [
      ...(keeper ? [keeper] : []),
      ...rest.filter((p) => p !== keeper && p.position !== 'GK'),
    ].slice(0, BENCH_SIZE);
    return {
      id: club.id,
      name: club.name,
      formation: lineup.formation,
      tactic: lineup.tactic,
      players: xi as Player[],
      bench,
    };
  }

  /** The XI and bench the user's club would field right now (for the pick-your-team screen). */
  userSelection(): Team {
    if (this.userClubId === undefined) throw new Error('this season has no user club');
    return this.userTeam(this.clubs.get(this.userClubId)!, new Set());
  }

  // ------------------------------------------------------------------- play

  /** Play every match of the next round with the full event engine. */
  playMatchday(options: PlayMatchdayOptions = {}): MatchdayOutcome {
    const pending = this.beginMatchday();
    const changes = pending.user ? options.halfTime?.(pending.user.snapshot) : undefined;
    return pending.finish(changes ? changes[pending.user!.userSide] : undefined, options.onMatch);
  }

  /**
   * First half of every match in the next round. The user's match is paused at half-time so a
   * person can watch it and decide; `finish` applies their changes and plays everything out.
   * Nothing is recorded until `finish`.
   */
  beginMatchday(): PendingMatchday {
    if (this.finished) throw new Error('the season is over');
    if (this.pending) throw new Error('a matchday is already in progress');
    const round = this.nextRound;
    const userSquadIds = new Set(
      this.userClubId === undefined
        ? []
        : this.clubs.get(this.userClubId)!.players.map((p) => p.id),
    );
    const none: ReadonlySet<string> = new Set();
    const played: { fixture: Fixture; match: Match; userSide?: Side }[] = [];
    let user: PendingMatchday['user'];

    for (const fixture of this.rounds[round]!) {
      const userHome = fixture.home === this.userClubId;
      const userAway = fixture.away === this.userClubId;
      if (this.userMatchesOnly && !userHome && !userAway) continue;
      const homeClub = this.clubs.get(fixture.home)!;
      const awayClub = this.clubs.get(fixture.away)!;
      // No facing himself: the opponent of the user's club cannot field the user's players.
      const home = userHome
        ? this.userTeam(homeClub, none)
        : this.aiTeam(homeClub, userAway ? userSquadIds : none);
      const away = userAway
        ? this.userTeam(awayClub, none)
        : this.aiTeam(awayClub, userHome ? userSquadIds : none);
      const startStamina: Record<string, number> = {};
      for (const p of [
        ...home.players,
        ...(home.bench ?? []),
        ...away.players,
        ...(away.bench ?? []),
      ]) {
        startStamina[p.id] = this.state.get(p.id)?.fitness ?? 100;
      }
      const match = new Match({
        home,
        away,
        seed: hashSeed(this.seed, round, fixture.home, fixture.away),
        startStamina,
      });
      match.playFirstHalf();
      const userSide: Side | undefined = userHome ? 'home' : userAway ? 'away' : undefined;
      played.push({ fixture, match, userSide });
      if (userSide) user = { fixture, home, away, userSide, snapshot: match.snapshot() };
    }

    const finish: PendingMatchday['finish'] = (changes, onMatch) => {
      if (this.pending !== handle) throw new Error('this matchday is no longer in progress');
      const records: MatchRecord[] = [];
      let userMatch: MatchdayOutcome['userMatch'];
      const results = played.map(({ fixture, match, userSide }) => {
        if (userSide && changes) match.applyHalfTime({ [userSide]: changes });
        const result = match.playSecondHalf();
        if (userSide) userMatch = { fixture, result };
        return { fixture, match, result };
      });
      for (const { fixture, match, result } of results) {
        records.push({
          round,
          home: fixture.home,
          away: fixture.away,
          homeGoals: result.score.home,
          awayGoals: result.score.away,
        });
        addResult(this.rows.get(fixture.home)!, result.score.home, result.score.away);
        addResult(this.rows.get(fixture.away)!, result.score.away, result.score.home);
        this.absorb(round, match.snapshot(), result);
        onMatch?.(fixture, result);
      }
      this.records.push(...records);
      this.endMatchday();
      this.nextRound++;
      this.pending = undefined;
      return userMatch ? { round, records, userMatch } : { round, records };
    };
    const handle: PendingMatchday = user ? { round, user, finish } : { round, finish };
    this.pending = handle;
    return handle;
  }

  /** The side a club would field against the user's club now (without the user's players). */
  opponentPreview(clubId: string): Team {
    const club = this.clubs.get(clubId);
    if (!club) throw new Error(`unknown club ${clubId}`);
    const owned =
      this.userClubId === undefined
        ? new Set<string>()
        : new Set(this.clubs.get(this.userClubId)!.players.map((p) => p.id));
    return this.aiTeam(club, owned);
  }

  /** The side a club would field today against anyone else, for projections. */
  nominalTeam(clubId: string): Team {
    const club = this.clubs.get(clubId);
    if (!club) throw new Error(`unknown club ${clubId}`);
    return clubId === this.userClubId
      ? this.userTeam(club, new Set())
      : this.aiTeam(club, new Set());
  }

  clubIds(): string[] {
    return [...this.clubs.keys()];
  }

  /** Every player's totals for each club he has played for, in a stable order. */
  playerStats(): PlayerSeasonStat[] {
    const out: PlayerSeasonStat[] = [];
    for (const club of this.clubs.values()) {
      const everyone =
        club.id === this.userClubId ? [...club.players, ...this.departed.values()] : club.players;
      for (const p of everyone) {
        const s = this.state.get(seasonPlayerId(club.id, p.id));
        if (!s || s.appearances === 0) continue;
        out.push({
          playerId: p.id,
          name: p.name,
          position: p.position,
          clubId: club.id,
          appearances: s.appearances,
          goals: s.goals,
          assists: s.assists,
          ratingSum: s.ratingSum,
        });
      }
    }
    return out;
  }

  /** Raw (un-namespaced) squad of a club. */
  squadOf(clubId: string): readonly Player[] {
    return this.clubs.get(clubId)?.players ?? [];
  }

  /** Fold one match into fitness, form, injuries, suspensions and player stats. */
  private absorb(round: number, snapshot: MatchSnapshot, result: MatchResult): void {
    for (const p of snapshot.players) {
      const s = this.state.get(p.playerId);
      if (s) s.fitness = p.stamina;
    }
    for (const r of result.playerRatings) {
      const s = this.state.get(r.playerId);
      if (!s) continue;
      s.appearances++;
      s.ratingSum += r.rating;
      s.goals += r.goals;
      s.assists += r.assists;
      // A cameo moves form in proportion to the minutes played (a full match counts in full).
      const weight = (1 - SEASON.formDecay) * Math.min(r.minutesPlayed / 90, 1);
      s.form = (1 - weight) * s.form + weight * (r.individual - SEASON.formBaseline);
    }
    // Both counters are set one over so the end-of-matchday tick leaves the full length.
    for (const p of snapshot.players) {
      if (!p.injured) continue;
      const rng = createRng(hashSeed(this.seed, round, 'injury', p.playerId));
      this.state.get(p.playerId)!.injuredFor = drawInjuryLength(rng) + 1;
    }
    for (const r of result.playerRatings) {
      if (r.redCard) this.state.get(r.playerId)!.suspendedFor = SEASON.redCardBan + 1;
    }
  }

  /** End of matchday: recover fitness and tick absences down. Called once per round. */
  private endMatchday(): void {
    for (const s of this.state.values()) {
      s.fitness += SEASON.fitnessRecovery * (100 - s.fitness);
      if (s.injuredFor > 0) s.injuredFor--;
      if (s.suspendedFor > 0) s.suspendedFor--;
    }
  }
}
