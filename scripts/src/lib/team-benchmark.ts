// Team-level benchmark built from the cached FPL data: each club's attacking xG per 90 (sum of its
// players' expected_goals) and xG conceded per 90 (its goalkeepers' expected_goals_conceded, since
// exactly one keeper is on the pitch at a time), for the current and previous seasons.
//
// Caveat: history_past rows carry no club, so a past season is the *current* squad's past output
// (a player's old numbers are counted for his new club). It is a squad-quality benchmark, and the
// current season (a handful of matches) is the only strictly team-level figure; hence the blend.
import {
  parseSeason,
  type FplBootstrapRaw,
  type FplElementSummaryRaw,
  type SeasonTotals,
} from '@pl/engine';

/** Recency weight per season, most recent first: current, last season, two seasons ago, ... */
const SEASON_WEIGHTS = [1, 0.9, 0.5, 0.25] as const;

export interface TeamSeasonStat {
  /** Team matches' worth of outfield minutes behind the figure (sum of minutes / 990). */
  matches: number;
  xgFor: number;
  xgAgainst: number;
}

export interface TeamBenchmark {
  clubId: number;
  name: string;
  /** Index 0 = current season, then previous seasons; undefined where xG was not recorded. */
  seasons: (TeamSeasonStat | undefined)[];
  /** Weighted blend across seasons, per 90. */
  xgFor: number;
  xgAgainst: number;
  /** Implied strength: xG difference per 90 (higher is better). */
  strength: number;
}

interface Row {
  clubId: number;
  position: number;
  s: SeasonTotals;
}

export function buildTeamBenchmark(
  bootstrap: FplBootstrapRaw,
  summaries: ReadonlyMap<number, FplElementSummaryRaw>,
): TeamBenchmark[] {
  const bySeason: Row[][] = [];
  for (const e of bootstrap.elements) {
    const rows = [parseSeason(e)];
    for (const p of [...(summaries.get(e.id)?.history_past ?? [])].reverse()) {
      rows.push(parseSeason(p));
    }
    rows.slice(0, SEASON_WEIGHTS.length).forEach((s, i) => {
      (bySeason[i] ??= []).push({ clubId: e.team, position: e.element_type, s });
    });
  }

  return bootstrap.teams.map((t) => {
    const seasons = SEASON_WEIGHTS.map((_, i): TeamSeasonStat | undefined => {
      const rows = (bySeason[i] ?? []).filter((r) => r.clubId === t.id && r.s.minutes > 0);
      // xG only exists for recent seasons; skip seasons without it.
      if (!rows.some((r) => r.s.xg > 0)) return undefined;
      const minutes = rows.reduce((a, r) => a + r.s.minutes, 0);
      const keepers = rows.filter((r) => r.position === 1);
      const gkMinutes = keepers.reduce((a, r) => a + r.s.minutes, 0);
      if (minutes === 0 || gkMinutes === 0) return undefined;
      return {
        matches: minutes / 990,
        xgFor: (rows.reduce((a, r) => a + r.s.xg, 0) / minutes) * 990,
        xgAgainst: (keepers.reduce((a, r) => a + r.s.xgc, 0) / gkMinutes) * 90,
      };
    });
    let w = 0;
    let f = 0;
    let a = 0;
    seasons.forEach((s, i) => {
      if (!s) return;
      const weight = SEASON_WEIGHTS[i]! * s.matches;
      w += weight;
      f += weight * s.xgFor;
      a += weight * s.xgAgainst;
    });
    const xgFor = w > 0 ? f / w : 0;
    const xgAgainst = w > 0 ? a / w : 0;
    return {
      clubId: t.id,
      name: t.name,
      seasons,
      xgFor,
      xgAgainst,
      strength: xgFor - xgAgainst,
    };
  });
}

/** Spearman rank correlation (average ranks for ties). */
export function spearman(x: readonly number[], y: readonly number[]): number {
  const rank = (v: readonly number[]): number[] => {
    const order = v.map((_, i) => i).sort((i, j) => v[i]! - v[j]!);
    const r = new Array<number>(v.length).fill(0);
    for (let i = 0; i < order.length;) {
      let j = i;
      while (j + 1 < order.length && v[order[j + 1]!] === v[order[i]!]) j++;
      for (let k = i; k <= j; k++) r[order[k]!] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(x);
  const ry = rank(y);
  const mean = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
  const mx = mean(rx);
  const my = mean(ry);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < rx.length; i++) {
    sxy += (rx[i]! - mx) * (ry[i]! - my);
    sxx += (rx[i]! - mx) ** 2;
    syy += (ry[i]! - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

const f2 = (v: number | undefined): string =>
  v === undefined ? '   -  ' : v.toFixed(2).padStart(6);

export function printTeamBenchmark(rows: readonly TeamBenchmark[]): void {
  const sorted = [...rows].sort((a, b) => b.strength - a.strength);
  console.log('Team benchmark: xG for / against per 90 (current squad; seasons newest first)');
  console.log(
    'Club               Cur(n) F     A    | Prev F    A    | Prev2 F   A    | Blend F   A    Diff',
  );
  for (const r of sorted) {
    const cell = (i: number): string =>
      r.seasons[i] ? `${f2(r.seasons[i]!.xgFor)} ${f2(r.seasons[i]!.xgAgainst)}` : '   -      -  ';
    console.log(
      `${r.name.padEnd(18)} ${(r.seasons[0]?.matches ?? 0).toFixed(0).padStart(3)}  ${cell(0)} | ` +
        `${cell(1)} | ${cell(2)} | ${f2(r.xgFor)} ${f2(r.xgAgainst)} ${(r.strength >= 0 ? '+' : '') + r.strength.toFixed(2)}`,
    );
  }
}
