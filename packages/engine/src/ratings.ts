// Maps Fantasy Premier League stats to the engine's 0-100 player ratings.
// Pure functions only: callers fetch/cache the FPL JSON and hand it in.
//
// Caveats worth knowing:
//  - FPL has no pace data and no dribbling data. `pace` is the positional default nudged by
//    threat and `dribbling` is derived from threat + creativity; both are proxies, not measurements.
//  - Defensive-contribution stats (tackles, clearances/blocks/interceptions, recoveries) only exist
//    for recent seasons, so each metric is pooled only over seasons where it is actually recorded.
import type { Player, PlayerRatings, Position } from './types';

type Num = number | string | null | undefined;

/** The subset of an FPL element / history_past row that we read (strings are parsed). */
export interface FplSeasonRaw {
  minutes?: Num;
  goals_scored?: Num;
  assists?: Num;
  expected_goals?: Num;
  expected_assists?: Num;
  creativity?: Num;
  threat?: Num;
  ict_index?: Num;
  saves?: Num;
  goals_conceded?: Num;
  expected_goals_conceded?: Num;
  tackles?: Num;
  clearances_blocks_interceptions?: Num;
  recoveries?: Num;
  defensive_contribution?: Num;
}

export interface FplElementRaw extends FplSeasonRaw {
  id: number;
  web_name: string;
  first_name?: string;
  second_name?: string;
  team: number;
  /** 1 = GK, 2 = DEF, 3 = MID, 4 = FWD */
  element_type: number;
  /** "a" available, "i" injured, "s" suspended, "d" doubtful, "u" unavailable (left the league) */
  status: string;
  /** Price in tenths of £m. */
  now_cost?: Num;
}

export interface FplBootstrapRaw {
  teams: { id: number; name: string; short_name: string }[];
  elements: FplElementRaw[];
}

export interface FplElementSummaryRaw {
  /** Oldest season first, as the FPL API returns it. */
  history_past?: FplSeasonRaw[];
}

export interface SeasonTotals {
  minutes: number;
  goals: number;
  assists: number;
  xg: number;
  xa: number;
  creativity: number;
  threat: number;
  ict: number;
  saves: number;
  goalsConceded: number;
  xgc: number;
  tackles: number;
  cbi: number;
  recoveries: number;
  dc: number;
}

export interface RatingInput {
  id: number;
  name: string;
  clubId: number;
  position: Position;
  status: string;
  /** FPL price in tenths of £m: a weak crowd-sourced quality prior for outfield players only. */
  price?: number;
  current: SeasonTotals;
  /** Previous seasons, most recent first. */
  past: SeasonTotals[];
}

export interface RatedPlayer {
  input: RatingInput;
  player: Player;
  /** Pooled (recency-weighted) minutes behind the rating; low means heavily shrunk. */
  weightedMinutes: number;
}

/** Everything that decides how FPL numbers become ratings. */
export const RATING_MAP = {
  /** Rating of an average Premier League starter at his own position's job. */
  anchor: 60.0,
  /** Per-stat offset from the anchor for an average player of each position. */
  base: {
    GK: {
      passing: -5,
      dribbling: -25,
      shooting: -30,
      tackling: -25,
      positioning: 0,
      pace: -20,
      goalkeeping: 16,
    },
    DEF: {
      passing: -4,
      dribbling: -10,
      shooting: -22,
      tackling: 6,
      positioning: 6,
      pace: -2,
      goalkeeping: -40,
    },
    MID: {
      passing: 6,
      dribbling: 0,
      shooting: -6,
      tackling: 0,
      positioning: 0,
      pace: -2,
      goalkeeping: -40,
    },
    FWD: {
      passing: -4,
      dribbling: 5,
      shooting: 2,
      tackling: -22,
      positioning: -8,
      pace: 4,
      goalkeeping: -40,
    },
  } as Record<Position, PlayerRatings>,
  /** Rating points per standard deviation above/below the positional average. */
  spread: {
    shooting: 16,
    passing: 15,
    dribbling: 11,
    tackling: 15,
    goalkeeping: 15,
    positioning: 8,
    pace: 5,
  },
  /** Weighted minutes a player needs to count towards the positional norms. */
  normMinMinutes: 900,
  /**
   * Recency weights for the last three seasons in history_past, relative to the current season.
   * Everything is per-90 and weighted by minutes, so last season counts as much per minute as this
   * one (early in a season it is simply most of the evidence).
   */
  pastWeights: [1, 0.5, 0.25] as readonly number[],
  /** Weighted minutes of a regular season: the yardstick for the regulars' minutes nudge. */
  fullSeasonMinutes: 3000,
  /**
   * Evidence-based shrinkage. Each rating is standardised on well-evidenced players and then pulled
   * toward the positional average by rho = m / (m + K), with m the (weighted) minutes behind it and
   * K the minutes of evidence worth as much as the prior. K comes from how stable each kind of stat
   * is from one season to the next: xG, threat and ICT are stable; goals, assists and above all
   * goals prevented (the goalkeeper signal, season-to-season r ~ 0.3) are mostly noise.
   */
  reliabilityMinutes: {
    shooting: 1400,
    passing: 2200,
    dribbling: 1200,
    tackling: 1600,
    goalkeeping: 8000,
    positioning: 1600,
    pace: 1000,
  },
  /** Weighted minutes at which a player's rating may reach the full +/- maxZ standard deviations. */
  fullEvidenceMinutes: 2700,
  maxZ: 1.4,
  /**
   * Weak prior from FPL price (a crowd-sourced quality signal) for outfield players: the shrinkage
   * target moves `weight` standard deviations per within-position price z-score, capped so it can
   * move any rating by at most `maxPoints`. Goalkeepers get none: their price range is too narrow
   * to carry information, so their ratings come from their own (heavily shrunk) data alone.
   */
  pricePrior: { weight: 0.3, maxPoints: 5 },
  /**
   * A goalkeeper who has not featured this season (less than `featuredShare` of the minutes the
   * busiest player has played) is a backup until his data says otherwise: his shrinkage target sits
   * `backupPriorZ` standard deviations below the average keeper. Only one keeper plays, so this
   * never touches a club's starter; it stops unproven reserves rating like first choices.
   */
  goalkeeperBackup: { priorZ: 0.5, featuredShare: 0.5 },
  /**
   * Shape of the z -> rating curve (piecewise linear, an average player stays at 0):
   *  - below `knee` standard deviations it is `belowKneeSlope` steep: a club's starting XI is the
   *    best of its squad, so even weak clubs field above-average players and the gap that sets the
   *    relegation line and the bottom club lives in this band;
   *  - above `knee` it flattens to `aboveKneeSlope`: the best output numbers in FPL belong to the
   *    best-supplied players, so the very top is the least trustworthy part. This stops a
   *    super-team stacking outliers into a 90%+ title favourite.
   * Player ordering never changes, only how far apart the ratings sit.
   */
  knee: 0.7,
  belowKneeSlope: 1.9,
  aboveKneeSlope: 0.3,
  /** Rating points per 1.0 of (minutes/3000 - 0.5): regulars are trusted slightly more. */
  minutesNudge: 4,
  /**
   * How much of a club's own level is removed from a player's per-90 numbers (0 = raw, 1 = fully
   * relative to his club). FPL counting stats inflate players of dominant sides and deflate good
   * players of weak ones, so each stat is divided by (club level / league level)^exponent.
   * Never 1: good clubs really do contain better players, we only strip the part that is context.
   */
  teamContext: {
    /** Output stats (goals, assists, xG, xA, creativity, threat, ICT) vs the club's xG per 90. */
    attack: 0.1,
    /** Volume stats (tackles, CBI, recoveries, saves) vs the club's xGC per 90: defending more = more of them. */
    defenceVolume: 0.7,
    /** The xGC a player is on the pitch for is almost entirely the team; only part counts as his own. */
    conceded: 0.3,
  },
  /** How much of positioning is the side's defensive record (xGC) rather than the player's ICT. */
  defenceShare: { GK: 0, DEF: 0.8, MID: 0.25, FWD: 0 },
  /** Weight of per-90 individual-quality metrics vs raw totals inside each composite. */
  weights: {
    /** shooting = xg * w + goals * (1 - w): finishing luck and penalties are noise, xG is not. */
    shootingXg: 0.7,
    /** passing = xa * a + creativity * b + assists * (1 - a - b): assists need a teammate to score. */
    passingXa: 0.4,
    passingCreativity: 0.45,
  },
} as const;

const num = (v: Num): number => {
  const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function parseSeason(raw: FplSeasonRaw): SeasonTotals {
  return {
    minutes: num(raw.minutes),
    goals: num(raw.goals_scored),
    assists: num(raw.assists),
    xg: num(raw.expected_goals),
    xa: num(raw.expected_assists),
    creativity: num(raw.creativity),
    threat: num(raw.threat),
    ict: num(raw.ict_index),
    saves: num(raw.saves),
    goalsConceded: num(raw.goals_conceded),
    xgc: num(raw.expected_goals_conceded),
    tackles: num(raw.tackles),
    cbi: num(raw.clearances_blocks_interceptions),
    recoveries: num(raw.recoveries),
    dc: num(raw.defensive_contribution),
  };
}

const POSITION_BY_TYPE: Record<number, Position> = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };

/** Join bootstrap-static with each player's element-summary (missing summaries are tolerated). */
export function toRatingInputs(
  bootstrap: FplBootstrapRaw,
  summaries: ReadonlyMap<number, FplElementSummaryRaw>,
): RatingInput[] {
  const out: RatingInput[] = [];
  for (const e of bootstrap.elements) {
    const position = POSITION_BY_TYPE[e.element_type];
    if (!position) continue;
    const past = [...(summaries.get(e.id)?.history_past ?? [])].reverse().map(parseSeason);
    out.push({
      id: e.id,
      name: e.web_name,
      clubId: e.team,
      position,
      status: e.status,
      price: num(e.now_cost) || undefined,
      current: parseSeason(e),
      past,
    });
  }
  return out;
}

// ------------------------------------------------------------------ pooling

type MinutesGroup = 'all' | 'xg' | 'def' | 'gk';

/** Which club-level figure a metric's per-90 rate is measured against (see RATING_MAP.teamContext). */
type Context = 'attack' | 'defenceVolume' | 'conceded' | 'none';

interface MetricDef {
  group: MinutesGroup;
  value: (s: SeasonTotals) => number;
  context: Context;
}

const METRICS = {
  goals: { group: 'all', value: (s) => s.goals, context: 'attack' },
  assists: { group: 'all', value: (s) => s.assists, context: 'attack' },
  creativity: { group: 'all', value: (s) => s.creativity, context: 'attack' },
  threat: { group: 'all', value: (s) => s.threat, context: 'attack' },
  ict: { group: 'all', value: (s) => s.ict, context: 'attack' },
  xg: { group: 'xg', value: (s) => s.xg, context: 'attack' },
  xa: { group: 'xg', value: (s) => s.xa, context: 'attack' },
  tackles: { group: 'def', value: (s) => s.tackles, context: 'defenceVolume' },
  cbi: { group: 'def', value: (s) => s.cbi, context: 'defenceVolume' },
  recoveries: { group: 'def', value: (s) => s.recoveries, context: 'defenceVolume' },
  dc: { group: 'def', value: (s) => s.dc, context: 'defenceVolume' },
  saves: { group: 'gk', value: (s) => s.saves, context: 'defenceVolume' },
  /** Expected goals conceded while on the pitch: a team-level signal of how well the side defends. */
  xgcAgainst: { group: 'gk', value: (s) => s.xgc, context: 'conceded' },
  /** Goals prevented vs expectation (positive = better than the xGC suggests). */
  gkPrevented: { group: 'gk', value: (s) => s.xgc - s.goalsConceded, context: 'none' },
} as const satisfies Record<string, MetricDef>;

type MetricKey = keyof typeof METRICS;
const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];

/** Whether a season has real data for a minutes group (older seasons lack xG / defensive stats). */
function seasonHas(group: MinutesGroup, s: SeasonTotals): boolean {
  switch (group) {
    case 'all':
      return true;
    case 'xg':
      return s.xg + s.xa > 0;
    case 'def':
      return s.tackles + s.cbi + s.recoveries > 0;
    case 'gk':
      return s.xgc > 0;
  }
}

interface Pool {
  /** Recency-weighted minutes per group. */
  minutes: Record<MinutesGroup, number>;
  sums: Record<MetricKey, number>;
}

function poolFor(input: RatingInput): Pool {
  const seasons: { s: SeasonTotals; w: number }[] = [{ s: input.current, w: 1 }];
  input.past.slice(0, RATING_MAP.pastWeights.length).forEach((s, i) => {
    seasons.push({ s, w: RATING_MAP.pastWeights[i] ?? 0 });
  });

  const pool: Pool = {
    minutes: { all: 0, xg: 0, def: 0, gk: 0 },
    sums: Object.fromEntries(METRIC_KEYS.map((k) => [k, 0])) as Record<MetricKey, number>,
  };
  for (const { s, w } of seasons) {
    if (s.minutes <= 0) continue;
    for (const group of ['all', 'xg', 'def', 'gk'] as const) {
      if (seasonHas(group, s)) pool.minutes[group] += s.minutes * w;
    }
    for (const k of METRIC_KEYS) {
      const def = METRICS[k];
      if (seasonHas(def.group, s)) pool.sums[k] += def.value(s) * w;
    }
  }
  return pool;
}

/** A club's attacking and defensive level as a ratio to the league (1 = average). */
export interface ClubLevel {
  /** Its players' xG per minute / league's: > 1 = a side that creates a lot. */
  attack: number;
  /** Its xG conceded per minute on the pitch / league's: > 1 = a side that concedes a lot. */
  conceded: number;
}

const NEUTRAL_LEVEL: ClubLevel = { attack: 1, conceded: 1 };

/**
 * Per-club levels from the same pooled evidence the ratings use. Dominant clubs inflate their
 * players' output stats and deflate their conceded/volume stats, so rate90 divides that out.
 * Derived from FPL data only, so a user-built squad is rated by exactly the same rules: every
 * player is rated once, from the club his numbers were produced at.
 */
function clubLevels(inputs: readonly RatingInput[], pools: ReadonlyMap<RatingInput, Pool>) {
  const sums = new Map<number, { xg: number; xgMin: number; xgc: number; xgcMin: number }>();
  const league = { xg: 0, xgMin: 0, xgc: 0, xgcMin: 0 };
  for (const i of inputs) {
    const p = pools.get(i)!;
    const c = sums.get(i.clubId) ?? { xg: 0, xgMin: 0, xgc: 0, xgcMin: 0 };
    for (const t of [c, league]) {
      t.xg += p.sums.xg;
      t.xgMin += p.minutes.xg;
      t.xgc += p.sums.xgcAgainst;
      t.xgcMin += p.minutes.gk;
    }
    sums.set(i.clubId, c);
  }
  const ratio = (a: number, am: number, b: number, bm: number): number =>
    am > 0 && bm > 0 && b > 0 ? a / am / (b / bm) : 1;
  const out = new Map<number, ClubLevel>();
  for (const [id, c] of sums) {
    out.set(id, {
      attack: ratio(c.xg, c.xgMin, league.xg, league.xgMin),
      conceded: ratio(c.xgc, c.xgcMin, league.xgc, league.xgcMin),
    });
  }
  return out;
}

/** Divisor that turns a raw per-90 rate into a club-relative one. */
function contextFactor(k: MetricKey, level: ClubLevel): number {
  const tc = RATING_MAP.teamContext;
  switch (METRICS[k].context) {
    case 'attack':
      return level.attack ** tc.attack;
    case 'defenceVolume':
      return level.conceded ** tc.defenceVolume;
    case 'conceded':
      return level.conceded ** tc.conceded;
    case 'none':
      return 1;
  }
}

const rate90 = (
  pool: Pool,
  k: MetricKey,
  level: ClubLevel = NEUTRAL_LEVEL,
): { rate: number; minutes: number } => {
  const minutes = pool.minutes[METRICS[k].group];
  const raw = minutes > 0 ? (pool.sums[k] / minutes) * 90 : 0;
  return { rate: raw / contextFactor(k, level), minutes };
};

// -------------------------------------------------------------------- norms

interface Norm {
  mean: number;
  sd: number;
}

type CompositeKey =
  'shooting' | 'passing' | 'dribbling' | 'tackling' | 'goalkeeping' | 'positioning' | 'pace';
const COMPOSITE_KEYS: CompositeKey[] = [
  'shooting',
  'passing',
  'dribbling',
  'tackling',
  'goalkeeping',
  'positioning',
  'pace',
];

/**
 * Per-position statistics used to turn FPL numbers into ratings:
 * per-90 metric mean/sd, and the mean/sd of each blended composite (so that blending several
 * correlated stats does not squash the spread between players).
 */
export interface Norms {
  metrics: Record<Position, Record<MetricKey, Norm>>;
  composites: Record<Position, Record<CompositeKey, Norm>>;
  /** Club id -> level used to make that club's players' stats club-relative. */
  clubs: ReadonlyMap<number, ClubLevel>;
  /** Per-position mean/sd of ln(price): the price prior is a within-position z-score. */
  price: Record<Position, Norm>;
  /** Most minutes anyone has played this season (matches played x 90). */
  seasonMinutes: number;
}

/**
 * Raw (unshrunk) z-score of one metric. A player with no minutes behind it has no evidence and
 * sits at the positional average; shrinkage by evidence happens per rating in `ratePlayer`.
 */
function z(pool: Pool, norm: Norm, k: MetricKey, level: ClubLevel): number {
  const { rate, minutes } = rate90(pool, k, level);
  return minutes > 0 ? (rate - norm.mean) / norm.sd : 0;
}

/** Blend several metric z-scores into one raw (not yet standardised) composite per rating. */
function rawComposites(
  position: Position,
  pool: Pool,
  metrics: Record<MetricKey, Norm>,
  level: ClubLevel,
): Record<CompositeKey, number> {
  const zz = (k: MetricKey): number => z(pool, metrics[k], k, level);
  const w = RATING_MAP.weights;
  const gk = position === 'GK';
  // Tackle/recovery counts are *higher* for sides that defend more, so on their own they would
  // rate dominant clubs' defenders poorly. Conceding less than average (xGC) credits them instead.
  const defenceShare = RATING_MAP.defenceShare[position];
  return {
    // Per-90 quality (xG, xA, creativity) outweighs raw totals (goals, assists), which also depend
    // on finishing luck and on how many chances the team supplies.
    shooting: gk ? 0 : w.shootingXg * zz('xg') + (1 - w.shootingXg) * zz('goals'),
    passing:
      w.passingXa * zz('xa') +
      w.passingCreativity * zz('creativity') +
      (1 - w.passingXa - w.passingCreativity) * zz('assists'),
    dribbling: gk ? 0 : 0.5 * zz('threat') + 0.5 * zz('creativity'),
    tackling: gk ? 0 : 0.25 * (zz('tackles') + zz('cbi') + zz('recoveries') + zz('dc')),
    goalkeeping: gk ? 0.35 * zz('saves') + 0.65 * zz('gkPrevented') : 0,
    positioning: (1 - defenceShare) * zz('ict') - defenceShare * zz('xgcAgainst'),
    pace: gk ? 0 : zz('threat'),
  };
}

export function computeNorms(inputs: readonly RatingInput[]): Norms {
  const metrics = {} as Norms['metrics'];
  const pools = new Map<RatingInput, Pool>(inputs.map((i) => [i, poolFor(i)]));
  const clubs = clubLevels(inputs, pools);
  const levelOf = (i: RatingInput): ClubLevel => clubs.get(i.clubId) ?? NEUTRAL_LEVEL;
  for (const position of ['GK', 'DEF', 'MID', 'FWD'] as const) {
    const group = inputs.filter((i) => i.position === position);
    const byMetric = {} as Record<MetricKey, Norm>;
    for (const k of METRIC_KEYS) {
      // Norms are measured on club-relative rates, the same scale ratePlayer uses.
      const qualified = group
        .map((i) => rate90(pools.get(i)!, k, levelOf(i)))
        .filter((r) => r.minutes >= RATING_MAP.normMinMinutes);
      const total = qualified.reduce((a, r) => a + r.minutes, 0);
      const mean = total > 0 ? qualified.reduce((a, r) => a + r.rate * r.minutes, 0) / total : 0;
      const variance =
        total > 0 ? qualified.reduce((a, r) => a + r.minutes * (r.rate - mean) ** 2, 0) / total : 0;
      byMetric[k] = { mean, sd: Math.sqrt(variance) || 1 };
    }
    metrics[position] = byMetric;
  }

  const price = {} as Norms['price'];
  for (const position of ['GK', 'DEF', 'MID', 'FWD'] as const) {
    const logs = inputs
      .filter((i) => i.position === position && i.price)
      .map((i) => Math.log(i.price!));
    const mean = logs.reduce((a, v) => a + v, 0) / (logs.length || 1);
    const variance = logs.reduce((a, v) => a + (v - mean) ** 2, 0) / (logs.length || 1);
    price[position] = { mean, sd: Math.sqrt(variance) || 1 };
  }

  const composites = {} as Norms['composites'];
  for (const position of ['GK', 'DEF', 'MID', 'FWD'] as const) {
    const raws = inputs
      .filter(
        (i) => i.position === position && pools.get(i)!.minutes.all >= RATING_MAP.normMinMinutes,
      )
      .map((i) => rawComposites(position, pools.get(i)!, metrics[position], levelOf(i)));
    const byKey = {} as Record<CompositeKey, Norm>;
    for (const key of COMPOSITE_KEYS) {
      const values = raws.map((r) => r[key]);
      const mean = values.reduce((a, v) => a + v, 0) / (values.length || 1);
      const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / (values.length || 1);
      byKey[key] = { mean, sd: Math.sqrt(variance) || 1 };
    }
    composites[position] = byKey;
  }
  const seasonMinutes = Math.max(0, ...inputs.map((i) => i.current.minutes));
  return { metrics, composites, clubs, price, seasonMinutes };
}

// ------------------------------------------------------------------ ratings

/** Which evidence group (minutes with usable data) each rating is shrunk by. */
const RATING_GROUP: Record<CompositeKey, MinutesGroup> = {
  shooting: 'xg',
  passing: 'xg',
  dribbling: 'all',
  tackling: 'def',
  goalkeeping: 'gk',
  positioning: 'all',
  pace: 'all',
};

const clampRating = (v: number): number => Math.round(Math.min(99, Math.max(1, v)));

/** The z -> rating curve of RATING_MAP.knee, re-centred so an average player (z = 0) stays at 0. */
export function warpZ(x: number): number {
  const { knee, belowKneeSlope, aboveKneeSlope } = RATING_MAP;
  const warp = (v: number): number =>
    v > knee ? knee * belowKneeSlope + (v - knee) * aboveKneeSlope : v * belowKneeSlope;
  return warp(x);
}

export function ratePlayer(input: RatingInput, norms: Norms): PlayerRatings {
  const pool = poolFor(input);
  const raw = rawComposites(
    input.position,
    pool,
    norms.metrics[input.position],
    norms.clubs.get(input.clubId) ?? NEUTRAL_LEVEL,
  );
  // Thin evidence also caps how far the data can move a rating, however extreme the per-90
  // numbers are; the prior below is never clipped by it.
  const cap = RATING_MAP.maxZ * Math.min(1, pool.minutes.all / RATING_MAP.fullEvidenceMinutes);
  const priceZ =
    input.position !== 'GK' && input.price
      ? (Math.log(input.price) - norms.price[input.position].mean) / norms.price[input.position].sd
      : 0;
  const cz = (k: CompositeKey): number => {
    const n = norms.composites[input.position][k];
    const m = pool.minutes[RATING_GROUP[k]];
    const rho = m / (m + RATING_MAP.reliabilityMinutes[k]);
    // Price prior: at most `maxPoints` rating points however extreme the price.
    const priceCap =
      RATING_MAP.pricePrior.maxPoints / (RATING_MAP.spread[k] * RATING_MAP.belowKneeSlope);
    const featured =
      norms.seasonMinutes > 0
        ? Math.min(
            1,
            input.current.minutes / norms.seasonMinutes / RATING_MAP.goalkeeperBackup.featuredShare,
          )
        : 1;
    const backup =
      input.position === 'GK' ? RATING_MAP.goalkeeperBackup.priorZ * (1 - featured) : 0;
    const prior =
      Math.max(-priceCap, Math.min(priceCap, RATING_MAP.pricePrior.weight * priceZ)) - backup;
    const observed = Math.max(-cap, Math.min(cap, (rho * (raw[k] - n.mean)) / n.sd));
    return warpZ(observed + (1 - rho) * prior);
  };
  const base = RATING_MAP.base[input.position];
  const { spread, anchor } = RATING_MAP;
  const gk = input.position === 'GK';
  const minutesNudge =
    RATING_MAP.minutesNudge *
    (Math.min(1.2, pool.minutes.all / RATING_MAP.fullSeasonMinutes) - 0.5);

  return {
    shooting: clampRating(anchor + base.shooting + (gk ? 0 : spread.shooting * cz('shooting'))),
    passing: clampRating(anchor + base.passing + spread.passing * cz('passing')),
    dribbling: clampRating(anchor + base.dribbling + (gk ? 0 : spread.dribbling * cz('dribbling'))),
    tackling: clampRating(anchor + base.tackling + (gk ? 0 : spread.tackling * cz('tackling'))),
    goalkeeping: clampRating(
      anchor + base.goalkeeping + (gk ? spread.goalkeeping * cz('goalkeeping') : 0),
    ),
    positioning: clampRating(
      anchor + base.positioning + spread.positioning * cz('positioning') + minutesNudge,
    ),
    pace: clampRating(anchor + base.pace + (gk ? 0 : spread.pace * cz('pace')) + minutesNudge / 2),
  };
}

export function rateAll(inputs: readonly RatingInput[]): RatedPlayer[] {
  const norms = computeNorms(inputs);
  return inputs.map((input) => ({
    input,
    weightedMinutes: poolFor(input).minutes.all,
    player: {
      id: `fpl-${input.id}`,
      name: input.name,
      position: input.position,
      ratings: ratePlayer(input, norms),
    },
  }));
}
