import { createRng, type Rng } from './rng';
import { TUNING as T } from './tuning';
import type {
  ActionType,
  HalfTimeChanges,
  MatchEvent,
  MatchInput,
  MatchResult,
  MatchSnapshot,
  Outcome,
  Player,
  PlayerMatchRating,
  PlayerRatings,
  Point,
  Position,
  Side,
  SideChanges,
  Tactic,
  Team,
  TeamStats,
} from './types';

export const PITCH_LENGTH = 105;
export const PITCH_WIDTH = 68;
const ZONE_COLS = 6;
const ZONE_LANES = 3;
const HALF_SECONDS = 45 * 60;
const GOAL_HALF_WIDTH = 3.66;

/** A zone from the possessing team's point of view: col 0 = own goal line, col 5 = opponent box. */
interface Zone {
  col: number;
  lane: number;
}

interface PlayerState {
  player: Player;
  teamId: string;
  side: Side;
  stamina: number;
  yellow: number;
  sentOff: boolean;
  injured: boolean;
  onPitch: boolean;
  onAt: number | null;
  offAt: number | null;
  goals: number;
  assists: number;
  shots: number;
  saves: number;
  delta: number;
}

interface SideState {
  side: Side;
  team: Team;
  tactic: Tactic;
  players: PlayerState[];
  subsUsed: number;
  manDown: number;
  possessionSeconds: number;
  counterMode: boolean;
  counterSteps: number;
  stats: Omit<TeamStats, 'possession'>;
}

type ShotKind = 'open_play' | 'penalty';

/** Keep `spread` of a rating's edge over 50 (see `TUNING.selectionSkillSpread`). */
const spread = (v: number, k: number): number => 50 + k * (v - 50);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const logit = (p: number): number => Math.log(p / (1 - p));
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

function validateTeam(team: Team, label: string): void {
  if (team.players.length !== 11) throw new Error(`${label} must have exactly 11 players`);
  if (team.players.filter((p) => p.position === 'GK').length !== 1) {
    throw new Error(`${label} must have exactly one GK`);
  }
  const parts = team.formation.split('-').map(Number);
  if (
    parts.length < 3 ||
    parts.length > 5 ||
    parts.some((n) => !Number.isInteger(n) || n < 1) ||
    parts.reduce((a, b) => a + b, 0) !== 10
  ) {
    throw new Error(`${label} has an invalid formation "${team.formation}"`);
  }
}

export class Match {
  private readonly rng: Rng;
  private readonly sides: Record<Side, SideState>;
  private readonly events: MatchEvent[] = [];
  private readonly score = { home: 0, away: 0 };

  private period: MatchSnapshot['period'] = 'not_started';
  private clock = 0;
  private halfStart = 0;
  private disruptions = 0;
  private poss: Side = 'home';
  private zone: Zone = { col: 2, lane: 1 };
  private preferred: PlayerState | undefined;
  private lastPasser: PlayerState | undefined;
  private lastPasserAge = 99;

  constructor(input: MatchInput) {
    if (!Number.isInteger(input.seed)) throw new Error('seed must be an integer');
    validateTeam(input.home, 'home team');
    validateTeam(input.away, 'away team');
    const ids = [...input.home.players, ...(input.home.bench ?? []), ...input.away.players]
      .concat(input.away.bench ?? [])
      .map((p) => p.id);
    if (new Set(ids).size !== ids.length) throw new Error('player ids must be unique');

    this.rng = createRng(input.seed);
    this.sides = {
      home: this.buildSide('home', input.home, input.startStamina),
      away: this.buildSide('away', input.away, input.startStamina),
    };
  }

  // ---------------------------------------------------------------- public API

  /** Simulate up to the end of first-half stoppage time and pause. */
  playFirstHalf(): void {
    if (this.period !== 'not_started') throw new Error('first half already played');
    this.period = 'first_half';
    this.halfStart = 0;
    this.poss = 'home';
    this.zone = { col: 2, lane: 1 };
    const start = this.centre();
    this.emit('home', null, 'kickoff', 'none', start, start, 'Kick-off! We are under way.');
    this.runHalf();
    for (const side of ['home', 'away'] as const) {
      for (const p of this.sides[side].players) {
        if (p.onPitch) p.stamina = Math.min(100, p.stamina + T.halftimeRecovery);
      }
    }
    this.period = 'half_time';
    this.emit(null, null, 'half_time', 'none', this.centre(), this.centre(), this.halfTimeText());
  }

  /** Swap an on-pitch player for a bench player. Returns false if not allowed. */
  substitute(side: Side, offId: string, onId: string): boolean {
    const s = this.sides[side];
    if (s.subsUsed >= T.maxSubstitutions) return false;
    const off = s.players.find((p) => p.player.id === offId);
    const on = s.players.find((p) => p.player.id === onId);
    if (!off || !on || !off.onPitch || on.onPitch || on.onAt !== null || on.sentOff) return false;
    this.swap(s, off, on, false);
    return true;
  }

  setTactic(side: Side, tactic: Tactic): void {
    const s = this.sides[side];
    if (s.tactic === tactic) return;
    s.tactic = tactic;
    s.counterMode = false;
    const c = this.centre();
    this.emit(
      side,
      null,
      'tactic_change',
      'none',
      c,
      c,
      `${s.team.name} switch to a ${tactic.replace('_', ' ')} approach.`,
    );
  }

  applyHalfTime(changes: HalfTimeChanges): void {
    for (const side of ['home', 'away'] as const) {
      const c: SideChanges | undefined = changes[side];
      if (!c) continue;
      if (c.tactic) this.setTactic(side, c.tactic);
      for (const sub of c.substitutions ?? []) this.substitute(side, sub.off, sub.on);
    }
  }

  /** Continue the same seeded random stream through the second half and finish the match. */
  playSecondHalf(): MatchResult {
    if (this.period !== 'half_time') throw new Error('play the first half before the second');
    this.halfStart = this.clock;
    this.disruptions = 0;
    this.poss = 'away';
    this.zone = { col: 2, lane: 1 };
    this.sides.home.counterMode = false;
    this.sides.away.counterMode = false;
    this.preferred = undefined;
    this.lastPasser = undefined;
    this.period = 'full_time';
    this.clockPeriod = 2;
    const start = this.centre();
    this.emit('away', null, 'kickoff', 'none', start, start, 'The second half begins.');
    this.runHalf();
    this.emit(
      null,
      null,
      'full_time',
      'none',
      this.centre(),
      this.centre(),
      `Full time: ${this.sides.home.team.name} ${this.score.home}-${this.score.away} ${this.sides.away.team.name}.`,
    );
    return this.result();
  }

  snapshot(): MatchSnapshot {
    const players = (['home', 'away'] as const).flatMap((side) =>
      this.sides[side].players.map((p) => ({
        playerId: p.player.id,
        teamId: p.teamId,
        position: p.player.position,
        stamina: p.stamina,
        yellowCards: p.yellow,
        sentOff: p.sentOff,
        injured: p.injured,
        onPitch: p.onPitch,
      })),
    );
    return {
      period: this.period,
      score: { ...this.score },
      events: this.events,
      players,
      substitutionsUsed: { home: this.sides.home.subsUsed, away: this.sides.away.subsUsed },
      tactics: { home: this.sides.home.tactic, away: this.sides.away.tactic },
      ratings: this.buildRatings(),
      possession: this.possessionShares(),
    };
  }

  /** Percentage of playing time with the ball so far; read-only, never touches the random stream. */
  private possessionShares(): Record<Side, number> {
    const total = this.sides.home.possessionSeconds + this.sides.away.possessionSeconds || 1;
    const share = (s: SideState): number => Math.round((s.possessionSeconds / total) * 1000) / 10;
    return { home: share(this.sides.home), away: share(this.sides.away) };
  }

  // ------------------------------------------------------------------ set-up

  private clockPeriod: 1 | 2 = 1;

  private buildSide(side: Side, team: Team, startStamina: MatchInput['startStamina']): SideState {
    const mk = (player: Player, starter: boolean): PlayerState => ({
      player,
      teamId: team.id,
      side,
      stamina: clamp(startStamina?.[player.id] ?? 100, T.minStamina, 100),
      yellow: 0,
      sentOff: false,
      injured: false,
      onPitch: starter,
      onAt: starter ? 0 : null,
      offAt: null,
      goals: 0,
      assists: 0,
      shots: 0,
      saves: 0,
      delta: 0,
    });
    return {
      side,
      team,
      tactic: team.tactic,
      players: [
        ...team.players.map((p) => mk(p, true)),
        ...(team.bench ?? []).map((p) => mk(p, false)),
      ],
      subsUsed: 0,
      manDown: 0,
      possessionSeconds: 0,
      counterMode: false,
      counterSteps: 0,
      stats: {
        shots: 0,
        shotsOnTarget: 0,
        xg: 0,
        fouls: 0,
        yellowCards: 0,
        redCards: 0,
        corners: 0,
        injuries: 0,
      },
    };
  }

  // ------------------------------------------------------------ main loop

  private runHalf(): void {
    let stoppage = -1;
    for (;;) {
      const elapsed = this.clock - this.halfStart;
      if (stoppage < 0 && elapsed >= HALF_SECONDS) {
        stoppage = Math.min(420, 60 * (1 + Math.floor(this.rng() * 2)) + 25 * this.disruptions);
      }
      if (stoppage >= 0 && elapsed >= HALF_SECONDS + stoppage) return;
      this.step();
    }
  }

  private step(): void {
    const atk = this.sides[this.poss];
    const def = this.sides[other(this.poss)];

    const dt = this.between(atk.counterMode ? T.counterStepSeconds : T.stepSeconds);
    this.tick(dt, atk);
    this.lastPasserAge++;
    if (atk.counterMode && ++atk.counterSteps > T.counterMaxSteps) atk.counterMode = false;
    this.maybeInjury();

    let actor: PlayerState | undefined;
    if (this.preferred?.onPitch && this.preferred.side === atk.side) actor = this.preferred;
    this.preferred = undefined;
    actor ??= this.pickByZone(atk, this.zone.col, 'attack', true);
    if (!actor) return;

    if (this.rng() < T.backgroundFoul) {
      const fouler = this.pickByZone(def, ZONE_COLS - 1 - this.zone.col, 'defend', false);
      if (fouler) {
        this.doFoul(atk, def, actor, fouler);
        return;
      }
    }

    const action = this.chooseAction(atk, actor);
    switch (action) {
      case 'shot':
        this.doShot(atk, def, actor, 'open_play');
        break;
      case 'dribble':
        this.doDribble(atk, def, actor);
        break;
      default:
        this.doPass(atk, def, actor, action === 'long_ball');
    }
  }

  private tick(dt: number, atk: SideState): void {
    this.clock += dt;
    atk.possessionSeconds += dt;
    for (const side of ['home', 'away'] as const) {
      const s = this.sides[side];
      const tact = T.tactics[s.tactic].stamina;
      for (const p of s.players) {
        if (!p.onPitch) continue;
        const loss =
          (T.fatiguePer90 / (90 * 60)) * dt * tact * T.positionStamina[p.player.position];
        p.stamina = Math.max(T.minStamina, p.stamina - loss);
      }
    }
  }

  // --------------------------------------------------------------- actions

  private chooseAction(
    atk: SideState,
    actor: PlayerState,
  ): 'shot' | 'dribble' | 'long_ball' | 'pass' {
    const col = this.zone.col;
    const tac = T.tactics[atk.tactic];
    const pos = actor.player.position;
    const counter = atk.counterMode ? T.counterShotBoost : 1;

    const shotW =
      (T.shotWeight[col] ?? 0) *
      (this.zone.lane === 1 ? 1 : T.wideShotFactor) *
      (0.4 + spread(this.eff(actor, 'shooting'), T.shotShootingSpread) / 100) *
      T.shotPositionFactor[pos] *
      tac.shot *
      counter;
    const dribbleW =
      pos === 'GK' ? 0 : T.dribbleWeight * (0.4 + this.eff(actor, 'dribbling') / 100) * tac.dribble;
    const longW =
      (T.longBallWeight[col] ?? 0) * tac.longBall * (atk.counterMode ? T.counterLongBallBoost : 1);
    const passW = 1;

    const total = shotW + dribbleW + longW + passW;
    let r = this.rng() * total;
    if ((r -= shotW) < 0) return 'shot';
    if ((r -= dribbleW) < 0) return 'dribble';
    return r - longW < 0 ? 'long_ball' : 'pass';
  }

  private doPass(atk: SideState, def: SideState, actor: PlayerState, long: boolean): void {
    const from = this.zone;
    const target = this.targetZone(atk, from, long);
    const defender = this.pickByZone(def, ZONE_COLS - 1 - target.col, 'defend', false);
    const buildUpPenalty =
      atk.tactic === 'counter' && !atk.counterMode && from.col <= 2 ? T.counterBuildPenalty : 0;
    const att = this.eff(actor, 'passing') - buildUpPenalty;
    const dr = defender ? this.defRating(atk, def, defender, 'positioning', target.col) : 20;
    const backward = target.col <= from.col;
    const base = long ? T.longBallBase : T.passBase + (backward ? T.safePassBonus : 0);
    const ok = this.rng() < sigmoid(logit(base) + T.ratingSlope * (att - dr));

    const start = this.zonePoint(atk.side, from);
    const end = this.zonePoint(atk.side, target);
    const action: ActionType = long ? 'long_ball' : 'pass';
    if (ok) {
      actor.delta += 0.015;
      this.zone = target;
      this.lastPasser = actor;
      this.lastPasserAge = 0;
      this.emit(
        atk.side,
        actor,
        action,
        'success',
        start,
        end,
        this.passText(actor, long, target, true),
      );
    } else {
      actor.delta -= 0.03;
      this.emit(
        atk.side,
        actor,
        action,
        'fail',
        start,
        end,
        this.passText(actor, long, target, false, defender),
      );
      this.turnover(def, defender, { col: ZONE_COLS - 1 - target.col, lane: target.lane });
    }
  }

  private doDribble(atk: SideState, def: SideState, actor: PlayerState): void {
    const from = this.zone;
    const forward = from.col < ZONE_COLS - 1 && this.rng() < 0.7;
    const target: Zone = {
      col: forward ? from.col + 1 : from.col,
      lane: forward ? from.lane : this.shiftLane(from.lane),
    };
    const defender = this.pickByZone(def, ZONE_COLS - 1 - from.col, 'defend', false);
    const att = this.eff(actor, 'dribbling');
    const dr = defender ? this.defRating(atk, def, defender, 'tackling', from.col) : 20;
    const ok = this.rng() < sigmoid(logit(T.dribbleBase) + T.ratingSlope * (att - dr));
    const start = this.zonePoint(atk.side, from);
    const end = this.zonePoint(atk.side, ok ? target : from);

    if (ok) {
      actor.delta += 0.05;
      this.zone = target;
      this.emit(
        atk.side,
        actor,
        'dribble',
        'success',
        start,
        end,
        `${actor.player.name} dribbles past his man and carries it forward.`,
      );
      return;
    }
    actor.delta -= 0.05;
    if (defender && this.rng() < T.foulOnLostDuel) {
      this.emit(
        atk.side,
        actor,
        'dribble',
        'fail',
        start,
        end,
        `${actor.player.name} is brought down by ${defender.player.name}.`,
      );
      this.doFoul(atk, def, actor, defender);
      return;
    }
    if (defender) {
      defender.delta += 0.12;
    }
    this.emit(
      atk.side,
      actor,
      'dribble',
      'fail',
      start,
      end,
      defender
        ? `${defender.player.name} dispossesses ${actor.player.name} with a sharp tackle.`
        : `${actor.player.name} loses control.`,
    );
    this.turnover(def, defender, { col: ZONE_COLS - 1 - from.col, lane: from.lane });
  }

  private doFoul(atk: SideState, def: SideState, victim: PlayerState, fouler: PlayerState): void {
    const at = this.zonePoint(atk.side, this.zone);
    def.stats.fouls++;
    fouler.delta -= 0.12;
    this.disruptions++;

    const col = this.zone.col;
    const penaltyProb =
      col === ZONE_COLS - 1
        ? this.zone.lane === 1
          ? T.penaltyShare.central
          : T.penaltyShare.wide
        : 0;
    const penalty = this.rng() < penaltyProb;
    this.emit(
      def.side,
      fouler,
      'foul',
      penalty ? 'penalty' : 'free_kick',
      at,
      at,
      penalty
        ? `Penalty! ${fouler.player.name} fouls ${victim.player.name} in the box.`
        : `${fouler.player.name} commits a foul on ${victim.player.name}.`,
    );

    const cardMult = T.tactics[def.tactic].cards * (fouler.yellow > 0 ? T.secondYellowFactor : 1);
    const roll = this.rng();
    if (roll < T.redGivenFoul) {
      this.sendOff(def, fouler, at, 'Straight red card');
    } else if (roll < T.redGivenFoul + T.yellowGivenFoul * cardMult) {
      fouler.yellow++;
      def.stats.yellowCards++;
      fouler.delta -= 0.4;
      this.emit(
        def.side,
        fouler,
        'card',
        'yellow_card',
        at,
        at,
        `${fouler.player.name} goes into the book.`,
      );
      if (fouler.yellow >= 2) this.sendOff(def, fouler, at, 'Second yellow');
    }

    if (penalty) {
      const takers = atk.players.filter((p) => p.onPitch && p.player.position !== 'GK');
      const taker = takers.reduce<PlayerState | undefined>(
        (best, p) => (!best || this.eff(p, 'shooting') > this.eff(best, 'shooting') ? p : best),
        undefined,
      );
      if (taker) this.doShot(atk, def, taker, 'penalty');
    }
  }

  private doShot(atk: SideState, def: SideState, shooter: PlayerState, kind: ShotKind): void {
    const col = this.zone.col;
    const lane = this.zone.lane;
    const shootEff = this.eff(shooter, 'shooting');
    const keeper = def.players.find((p) => p.onPitch && p.player.position === 'GK');
    const gkEff = keeper ? this.eff(keeper, 'goalkeeping') : 25;

    let xg: number;
    if (kind === 'penalty') {
      xg = T.penaltyXg * (0.9 + 0.2 * (shootEff / 100));
    } else {
      const defender = this.pickByZone(def, ZONE_COLS - 1 - col, 'defend', false);
      const pressure = defender ? this.defRating(atk, def, defender, 'positioning', col) : 50;
      xg =
        (T.xgTable[col]?.[lane] ?? 0) * (0.45 + (1.1 * spread(shootEff, T.xgShootingSpread)) / 100);
      xg *= clamp(1 - (pressure - 50) * T.pressureSlope, 0.7, 1.3);
      xg *= T.tactics[def.tactic].xgAgainst * T.xgScale;
      if (atk.counterMode) xg *= T.counterXgBonus;
    }
    xg = clamp(xg, 0.002, 0.95);

    const goalProb = clamp(xg * (1 - (gkEff - 50) * T.keeperSlope), 0.002, 0.95);
    const onTarget = Math.max(goalProb + 0.03, T.onTargetBase + (0.2 * (shootEff - 50)) / 50);
    const u = this.rng();
    let outcome: Outcome;
    if (u < goalProb) outcome = 'goal';
    else if (u < onTarget) outcome = 'saved';
    else outcome = kind === 'penalty' || this.rng() >= T.blockedShare ? 'off_target' : 'blocked';

    atk.stats.shots++;
    atk.stats.xg += xg;
    shooter.shots++;
    if (outcome === 'goal' || outcome === 'saved') {
      atk.stats.shotsOnTarget++;
      shooter.delta += 0.12;
    }

    const goalX = atk.side === 'home' ? PITCH_LENGTH : 0;
    const start = this.zonePoint(atk.side, this.zone);
    const wide = outcome === 'off_target' ? 2 + this.rng() * 5 : 0;
    const sign = this.rng() < 0.5 ? -1 : 1;
    const end: Point =
      outcome === 'blocked'
        ? { x: clamp(start.x + (atk.side === 'home' ? 3 : -3), 0, PITCH_LENGTH), y: start.y }
        : {
            x: goalX,
            y: clamp(
              PITCH_WIDTH / 2 +
                sign *
                  (outcome === 'off_target'
                    ? GOAL_HALF_WIDTH + wide
                    : this.rng() * GOAL_HALF_WIDTH * 1.6),
              0,
              PITCH_WIDTH,
            ),
          };

    const text = this.shotText(shooter, keeper, outcome, kind, xg);
    this.emit(atk.side, shooter, 'shot', outcome, start, end, text, xg);

    if (outcome === 'goal') {
      this.score[atk.side]++;
      shooter.goals++;
      shooter.delta += shooter.player.position === 'FWD' ? 0.9 : 1.1;
      if (
        kind === 'open_play' &&
        this.lastPasser &&
        this.lastPasser !== shooter &&
        this.lastPasserAge <= 1
      ) {
        this.lastPasser.assists++;
        this.lastPasser.delta += 0.6;
      }
      this.disruptions++;
      this.restart(def.side, { col: 2, lane: 1 }, undefined);
      return;
    }
    if (keeper && outcome === 'saved') {
      keeper.saves++;
      keeper.delta += 0.3;
    }
    const cornerChance =
      outcome === 'saved' ? T.cornerAfterSave : outcome === 'blocked' ? T.cornerAfterBlock : 0;
    if (this.rng() < cornerChance) {
      atk.stats.corners++;
      const cornerLane = this.rng() < 0.5 ? 0 : 2;
      const cs = this.zonePoint(atk.side, { col: ZONE_COLS - 1, lane: cornerLane });
      this.emit(atk.side, null, 'corner', 'none', cs, cs, `Corner to ${atk.team.name}.`);
      this.restart(atk.side, { col: ZONE_COLS - 1, lane: cornerLane }, undefined);
      return;
    }
    this.restart(def.side, { col: 0, lane: 1 }, keeper);
  }

  // ------------------------------------------------------ discipline, injuries

  private sendOff(s: SideState, p: PlayerState, at: Point, why: string): void {
    p.sentOff = true;
    s.stats.redCards++;
    p.delta -= 1.5;
    this.disruptions++;
    this.emit(s.side, p, 'card', 'red_card', at, at, `${why}: ${p.player.name} is sent off!`);
    this.removeFromPitch(s, p);
  }

  private removeFromPitch(s: SideState, p: PlayerState): void {
    p.onPitch = false;
    p.offAt = this.clock;
    s.manDown++;
    if (this.preferred === p) this.preferred = undefined;
    if (this.lastPasser === p) this.lastPasser = undefined;
  }

  private maybeInjury(): void {
    if (this.rng() >= T.injuryPerStep) return;
    const pool = [...this.sides.home.players, ...this.sides.away.players].filter((p) => p.onPitch);
    const victim = pool[Math.floor(this.rng() * pool.length)];
    if (!victim) return;
    const s = this.sides[victim.side];
    victim.injured = true;
    s.stats.injuries++;
    this.disruptions++;
    const at = this.zonePoint(victim.side, this.zone);
    this.emit(s.side, victim, 'injury', 'none', at, at, `${victim.player.name} is down injured.`);

    const replacement = this.pickReplacement(s, victim);
    if (replacement && s.subsUsed < T.maxSubstitutions) this.swap(s, victim, replacement, true);
    else this.removeFromPitch(s, victim);
  }

  private pickReplacement(s: SideState, off: PlayerState): PlayerState | undefined {
    const bench = s.players.filter((p) => !p.onPitch && p.onAt === null && !p.sentOff);
    const wanted = off.player.position;
    return (
      bench.find((p) => p.player.position === wanted) ??
      (wanted === 'GK' ? undefined : bench.find((p) => p.player.position !== 'GK'))
    );
  }

  private swap(s: SideState, off: PlayerState, on: PlayerState, injury: boolean): void {
    off.onPitch = false;
    off.offAt = this.clock;
    on.onPitch = true;
    on.onAt = this.clock;
    s.subsUsed++;
    if (this.preferred === off) this.preferred = undefined;
    if (this.lastPasser === off) this.lastPasser = undefined;
    const at = this.centre();
    this.emit(
      s.side,
      on,
      'substitution',
      'none',
      at,
      at,
      `${on.player.name} replaces ${injury ? 'injured ' : ''}${off.player.name}.`,
      undefined,
      off.player.id,
    );
  }

  // ----------------------------------------------------------- possession

  private turnover(winner: SideState, who: PlayerState | undefined, zone: Zone): void {
    const loser = this.sides[other(winner.side)];
    loser.counterMode = false;
    this.lastPasser = undefined;
    this.restart(winner.side, zone, who);
    if (winner.tactic === 'counter' && zone.col <= T.counterTriggerMaxCol) {
      winner.counterMode = true;
      winner.counterSteps = 0;
    }
  }

  private restart(side: Side, zone: Zone, preferred: PlayerState | undefined): void {
    this.poss = side;
    this.zone = zone;
    this.preferred = preferred;
    this.sides.home.counterMode = false;
    this.sides.away.counterMode = false;
    this.lastPasser = undefined;
  }

  private targetZone(atk: SideState, from: Zone, long: boolean): Zone {
    let dCol: number;
    if (long) {
      dCol = Math.min(ZONE_COLS - 1 - from.col, 2 + (this.rng() < 0.4 ? 1 : 0));
    } else {
      const forward = T.tactics[atk.tactic].forward * (atk.counterMode ? T.counterForwardBoost : 1);
      const r = this.rng();
      if (r < forward) dCol = from.col < ZONE_COLS - 1 ? 1 : 0;
      else if (r < forward + (1 - forward) * 0.6) dCol = 0;
      else dCol = from.col > 0 ? -1 : 0;
      if (
        atk.counterMode &&
        dCol === 1 &&
        this.rng() < T.counterSkipColChance &&
        from.col < ZONE_COLS - 2
      )
        dCol = 2;
    }
    const lane = this.rng() < 0.5 ? from.lane : this.shiftLane(from.lane);
    return { col: clamp(from.col + dCol, 0, ZONE_COLS - 1), lane };
  }

  private shiftLane(lane: number): number {
    if (lane === 0) return 1;
    if (lane === ZONE_LANES - 1) return ZONE_LANES - 2;
    return this.rng() < 0.5 ? 0 : 2;
  }

  // -------------------------------------------------------------- ratings

  /** Effective rating after fatigue, numerical disadvantage and home advantage. */
  private eff(p: PlayerState, stat: keyof PlayerRatings): number {
    const s = this.sides[p.side];
    const tired = ((100 - p.stamina) / 100) * T.fatigueImpact * (stat === 'goalkeeping' ? 0.3 : 1);
    let v = p.player.ratings[stat] * (1 - tired) * (1 - T.manDownPenalty * s.manDown);
    if (p.side === 'home') v += T.homeBonus;
    return v;
  }

  /** Defender rating with tactical context applied. */
  private defRating(
    atk: SideState,
    def: SideState,
    defender: PlayerState,
    stat: keyof PlayerRatings,
    atkCol: number,
  ): number {
    let v = this.eff(defender, stat);
    if (def.tactic === 'high_press' && atkCol <= 2) v += T.pressBonus;
    if (def.tactic === 'defensive' && atkCol >= 3) v += T.defensiveBonus;
    if (atk.counterMode) v -= T.counterDefPenalty;
    return v;
  }

  private pickByZone(
    s: SideState,
    col: number,
    kind: 'attack' | 'defend',
    includeGK: boolean,
  ): PlayerState | undefined {
    const candidates = s.players.filter(
      (p) => p.onPitch && (includeGK || p.player.position !== 'GK'),
    );
    return this.weighted(candidates, (p) => {
      const w = T.zoneWeight[p.player.position][col] ?? 0;
      const r = p.player.ratings;
      const skill =
        kind === 'attack'
          ? spread((r.passing + r.dribbling) / 2, T.selectionSkillSpread) / 100
          : (r.tackling + r.positioning) / 200;
      return w * (0.5 + skill);
    });
  }

  private weighted<V>(items: V[], weight: (v: V) => number): V | undefined {
    let total = 0;
    const ws = items.map((i) => {
      const w = weight(i);
      total += w;
      return w;
    });
    if (items.length === 0) return undefined;
    if (total <= 0) return items[0];
    let r = this.rng() * total;
    for (let i = 0; i < items.length; i++) {
      r -= ws[i] ?? 0;
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  // ------------------------------------------------------------- geometry

  private between(range: readonly [number, number]): number {
    return range[0] + this.rng() * (range[1] - range[0]);
  }

  private zonePoint(side: Side, z: Zone): Point {
    const along = ((z.col + 0.15 + this.rng() * 0.7) / ZONE_COLS) * PITCH_LENGTH;
    const y = ((z.lane + 0.15 + this.rng() * 0.7) / ZONE_LANES) * PITCH_WIDTH;
    return { x: round1(side === 'home' ? along : PITCH_LENGTH - along), y: round1(y) };
  }

  private centre(): Point {
    return { x: PITCH_LENGTH / 2, y: PITCH_WIDTH / 2 };
  }

  // ---------------------------------------------------------- event output

  private emit(
    side: Side | null,
    player: PlayerState | null,
    action: ActionType,
    outcome: Outcome,
    start: Point,
    end: Point,
    commentary: string,
    xg?: number,
    offPlayerId?: string,
  ): void {
    const rel = this.clock - this.halfStart;
    let minute: number;
    let addedTime = 0;
    if (this.period === 'half_time') {
      minute = 45;
    } else {
      const m = Math.floor(rel / 60) + 1;
      const offset = this.clockPeriod === 1 ? 0 : 45;
      if (m > 45) {
        minute = offset + 45;
        addedTime = m - 45;
      } else {
        minute = offset + m;
      }
    }
    const event: MatchEvent = {
      minute,
      addedTime,
      elapsed: Math.round(this.clock),
      period: this.clockPeriod,
      teamId: side ? this.sides[side].team.id : null,
      playerId: player ? player.player.id : null,
      action,
      outcome,
      start,
      end,
      commentary,
    };
    if (xg !== undefined) event.xg = Math.round(xg * 1000) / 1000;
    if (offPlayerId !== undefined) event.offPlayerId = offPlayerId;
    this.events.push(event);
  }

  private pick(options: string[]): string {
    return options[this.events.length % options.length] ?? '';
  }

  private passText(
    actor: PlayerState,
    long: boolean,
    target: Zone,
    ok: boolean,
    defender?: PlayerState,
  ): string {
    const n = actor.player.name;
    if (long) {
      return ok
        ? this.pick([
            `${n} hits a long ball forward and finds a teammate.`,
            `${n} goes direct with a raking pass.`,
          ])
        : this.pick([
            `${n}'s long ball is cut out${defender ? ` by ${defender.player.name}` : ''}.`,
            `${n} overhits the long ball and possession is lost.`,
          ]);
    }
    const area =
      target.col >= 4 ? 'in the final third' : target.col >= 2 ? 'through midfield' : 'at the back';
    return ok
      ? this.pick([
          `${n} plays it ${area}.`,
          `Neat pass from ${n} ${area}.`,
          `${n} keeps it moving ${area}.`,
        ])
      : this.pick([
          `${n}'s pass is intercepted${defender ? ` by ${defender.player.name}` : ''}.`,
          `${n} gives it away ${area}.`,
        ]);
  }

  private shotText(
    shooter: PlayerState,
    keeper: PlayerState | undefined,
    outcome: Outcome,
    kind: ShotKind,
    xg: number,
  ): string {
    const n = shooter.player.name;
    const k = keeper?.player.name ?? 'the stand-in keeper';
    const big = xg >= 0.25;
    if (kind === 'penalty') {
      if (outcome === 'goal')
        return `${n} sends the keeper the wrong way and scores from the spot!`;
      if (outcome === 'saved') return `${k} saves the penalty from ${n}!`;
      return `${n} misses the penalty!`;
    }
    switch (outcome) {
      case 'goal':
        return this.pick([
          `GOAL! ${n} ${big ? 'tucks away a big chance' : 'finds the net'}!`,
          `${n} scores! ${big ? 'Clinical finish' : 'What a strike'}!`,
        ]);
      case 'saved':
        return this.pick([
          `${n} shoots and ${k} makes the save.`,
          `Good stop from ${k} to deny ${n}.`,
        ]);
      case 'blocked':
        return `${n}'s shot is blocked by a defender.`;
      default:
        return this.pick([
          `${n} fires wide.`,
          `${n} drags the shot off target.`,
          `${n} blazes over.`,
        ]);
    }
  }

  private halfTimeText(): string {
    return `Half time: ${this.sides.home.team.name} ${this.score.home}-${this.score.away} ${this.sides.away.team.name}.`;
  }

  // ---------------------------------------------------------------- result

  private result(): MatchResult {
    const possession = this.possessionShares();
    const statsFor = (s: SideState): TeamStats => ({
      possession: possession[s.side],
      ...s.stats,
      xg: Math.round(s.stats.xg * 100) / 100,
    });
    return {
      events: this.events,
      score: { ...this.score },
      playerRatings: this.buildRatings(),
      stats: { home: statsFor(this.sides.home), away: statsFor(this.sides.away) },
    };
  }

  private buildRatings(): PlayerMatchRating[] {
    const out: PlayerMatchRating[] = [];
    for (const side of ['home', 'away'] as const) {
      const s = this.sides[side];
      const scored = this.score[side];
      const conceded = this.score[other(side)];
      for (const p of s.players) {
        if (p.onAt === null) continue;
        const pos: Position = p.player.position;
        let r = 6 + p.delta;
        if (conceded === 0)
          r += pos === 'GK' ? 0.8 : pos === 'DEF' ? 0.5 : pos === 'MID' ? 0.15 : 0;
        else if (pos === 'GK' || pos === 'DEF') r -= 0.15 * Math.min(conceded, 4);
        r += scored > conceded ? 0.25 : scored < conceded ? -0.2 : 0;
        const minutes = Math.min(90, Math.round(((p.offAt ?? this.clock) - p.onAt) / 60));
        out.push({
          playerId: p.player.id,
          teamId: p.teamId,
          name: p.player.name,
          rating: Math.round(clamp(r, 1, 10) * 10) / 10,
          individual: Math.round(clamp(6 + p.delta, 1, 10) * 10) / 10,
          minutesPlayed: minutes,
          goals: p.goals,
          assists: p.assists,
          shots: p.shots,
          saves: p.saves,
          yellowCards: p.yellow,
          redCard: p.sentOff,
        });
      }
    }
    return out;
  }
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * Simulate a whole match. Pass `halfTime` to inspect the match at the break and return
 * substitutions / tactic changes; the second half continues the same seeded random stream.
 */
export function simulateMatch(
  input: MatchInput,
  halfTime?: (snapshot: MatchSnapshot) => HalfTimeChanges | void,
): MatchResult {
  const match = new Match(input);
  match.playFirstHalf();
  const changes = halfTime?.(match.snapshot());
  if (changes) match.applyHalfTime(changes);
  return match.playSecondHalf();
}
