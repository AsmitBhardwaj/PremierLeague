// Simulates full 38-game double round-robin seasons between the 20 real clubs (built from the
// FPL cache) and prints the average final table plus the spread vs a typical recent season.
//   pnpm --filter @pl/scripts calibrate-season [seasons] [--static]
// By default every season runs with the Phase 5 dynamics on (fitness, form, injuries,
// suspensions, rotation) across all 38 matchdays. `--static` plays the old fixed-strength seasons.
import { Season, buildClubs, simulateMatch } from '@pl/engine';
import { DistributionStats } from './lib/distribution';
import { loadFplCache } from './lib/fpl-cache';
import { buildSeasonClubs } from './lib/season-clubs';
import { fplNameOf, loadLastSeasonTable } from './lib/last-season-table';
import { forecastFplName, loadPreseasonForecast } from './lib/preseason-forecast';
import { buildTeamBenchmark, spearman } from './lib/team-benchmark';

const STATIC = process.argv.includes('--static');
const SEASONS = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 200);
const { bootstrap, summaries } = loadFplCache();
const clubs = buildClubs(bootstrap, summaries);
// buildClubs keeps bootstrap.teams order, so benchmark[i] is the same club as clubs[i].
const benchmark = buildTeamBenchmark(bootstrap, summaries);
const n = clubs.length;

interface Acc {
  points: number;
  positionSum: number;
  titles: number;
  top4: number;
  relegated: number;
  gf: number;
  ga: number;
  xgf: number;
  xga: number;
}
const acc: Acc[] = clubs.map(() => ({
  points: 0,
  positionSum: 0,
  titles: 0,
  top4: 0,
  relegated: 0,
  gf: 0,
  ga: 0,
  xgf: 0,
  xga: 0,
}));
const pointsByRank = new Array<number>(n).fill(0);
const dist = new DistributionStats();
let homeWins = 0;
let draws = 0;
let matches = 0;
const started = Date.now();

const seasonClubs = buildSeasonClubs(bootstrap, summaries);
const indexOf = new Map(clubs.map((c, i) => [c.team.id, i]));
const record = (
  h: number,
  a: number,
  r: ReturnType<typeof simulateMatch>,
  pts: number[],
  gf: number[],
  ga: number[],
): void => {
  dist.add(r, clubs[h]!.team.id);
  matches++;
  acc[h]!.xgf += r.stats.home.xg;
  acc[h]!.xga += r.stats.away.xg;
  acc[a]!.xgf += r.stats.away.xg;
  acc[a]!.xga += r.stats.home.xg;
  gf[h]! += r.score.home;
  ga[h]! += r.score.away;
  gf[a]! += r.score.away;
  ga[a]! += r.score.home;
  if (r.score.home > r.score.away) {
    pts[h]! += 3;
    homeWins++;
  } else if (r.score.home < r.score.away) pts[a]! += 3;
  else {
    pts[h]!++;
    pts[a]!++;
    draws++;
  }
};

for (let s = 0; s < SEASONS; s++) {
  const pts = new Array<number>(n).fill(0);
  const gf = new Array<number>(n).fill(0);
  const ga = new Array<number>(n).fill(0);
  if (STATIC) {
    let m = 0;
    for (let h = 0; h < n; h++) {
      for (let a = 0; a < n; a++) {
        if (h === a) continue;
        const r = simulateMatch({
          home: clubs[h]!.team,
          away: clubs[a]!.team,
          seed: s * 1000 + m++ + 1,
        });
        record(h, a, r, pts, gf, ga);
      }
    }
  } else {
    const season = new Season({ seed: s + 1, clubs: seasonClubs });
    while (!season.finished) {
      season.playMatchday({
        onMatch: (fixture, r) =>
          record(indexOf.get(fixture.home)!, indexOf.get(fixture.away)!, r, pts, gf, ga),
      });
    }
  }
  const order = [...pts.keys()].sort(
    (x, y) => pts[y]! - pts[x]! || gf[y]! - ga[y]! - (gf[x]! - ga[x]!) || gf[y]! - gf[x]! || x - y,
  );
  order.forEach((club, rank) => {
    const c = acc[club]!;
    c.points += pts[club]!;
    c.positionSum += rank + 1;
    c.gf += gf[club]!;
    c.ga += ga[club]!;
    if (rank === 0) c.titles++;
    if (rank < 4) c.top4++;
    if (rank >= n - 3) c.relegated++;
    pointsByRank[rank]! += pts[club]!;
  });
}

const pct = (x: number): string => `${((100 * x) / SEASONS).toFixed(1)}%`;
const rows = clubs.map((c, i) => ({ c, a: acc[i]! })).sort((x, y) => y.a.points - x.a.points);

console.log(
  `Average final table over ${SEASONS} seasons (${Date.now() - started} ms, ${matches} matches)`,
);
console.log('Pos Club               Str   Pts  AvgPos  GF/GA     Title    Top4   Relegated');
rows.forEach(({ c, a }, i) => {
  console.log(
    `${String(i + 1).padStart(2)}  ${c.team.name.padEnd(18)} ${c.xiStrength.toFixed(1).padStart(4)} ` +
      `${(a.points / SEASONS).toFixed(1).padStart(5)}  ${(a.positionSum / SEASONS).toFixed(1).padStart(5)}  ` +
      `${(a.gf / SEASONS).toFixed(0).padStart(3)}/${(a.ga / SEASONS).toFixed(0).padEnd(3)}  ` +
      `${pct(a.titles).padStart(6)}  ${pct(a.top4).padStart(6)}  ${pct(a.relegated).padStart(6)}`,
  );
});

// Independent benchmark: the real 2025/26 final table. Promoted clubs have no row and are skipped.
const realTable = loadLastSeasonTable();
const compared = clubs.flatMap((c, i) => {
  const row = realTable.find((r) => fplNameOf(r.club) === c.team.name);
  return row ? [{ name: c.team.name, sim: acc[i]!.points / SEASONS, real: row.points }] : [];
});
console.log(
  `\nSimulated avg points vs the real 2025/26 table (${compared.length} clubs that were in the league; ` +
    `${clubs.length - compared.length} promoted clubs skipped)`,
);
console.log('Club                Sim pts  Real pts   Diff');
const sd = (v: number): string => (v >= 0 ? '+' : '') + v.toFixed(1);
for (const x of [...compared].sort((p, q) => q.real - p.real)) {
  console.log(
    `${x.name.padEnd(18)} ${x.sim.toFixed(1).padStart(8)} ${String(x.real).padStart(9)} ${sd(x.sim - x.real).padStart(6)}`,
  );
}
const diffs = compared.map((x) => x.sim - x.real);
const meanDiff = diffs.reduce((p, v) => p + v, 0) / diffs.length;
const ptsRmse = Math.sqrt(diffs.reduce((p, v) => p + v * v, 0) / diffs.length);
const ptsRmseCentred = Math.sqrt(diffs.reduce((p, v) => p + (v - meanDiff) ** 2, 0) / diffs.length);
console.log(
  `Spearman vs real table: ${spearman(
    compared.map((x) => x.sim),
    compared.map((x) => x.real),
  ).toFixed(
    3,
  )}   points RMSE ${ptsRmse.toFixed(1)} (centred ${ptsRmseCentred.toFixed(1)}, mean diff ${sd(meanDiff)})`,
);
const promoted = clubs.flatMap((c, i) =>
  realTable.some((r) => fplNameOf(r.club) === c.team.name)
    ? []
    : [`${c.team.name} ${(acc[i]!.points / SEASONS).toFixed(1)}`],
);
console.log(`Promoted clubs (sim avg pts): ${promoted.join(', ')}`);

// Check-only: a published pre-season forecast for these (current) squads. Never tuned against.
const forecast = loadPreseasonForecast();
const vsForecast = clubs.map((c, i) => ({
  name: c.team.name,
  sim: acc[i]!.points / SEASONS,
  f: forecast.find((r) => forecastFplName(r.club) === c.team.name)!,
}));
console.log(
  '\nSimulated avg points vs Opta pre-season forecast, 2026/27 (check only, not tuned against)',
);
console.log('Club                Sim pts  Fcst pts  Sim pos  Fcst pos');
const simPos = new Map(
  [...vsForecast].sort((p, q) => q.sim - p.sim).map((x, i) => [x.name, i + 1] as const),
);
for (const x of [...vsForecast].sort((p, q) => p.f.position - q.f.position)) {
  console.log(
    `${x.name.padEnd(18)} ${x.sim.toFixed(1).padStart(8)} ${x.f.expectedPoints.toFixed(1).padStart(9)} ` +
      `${String(simPos.get(x.name)).padStart(8)} ${String(x.f.position).padStart(9)}`,
  );
}
console.log(
  `Spearman vs pre-season forecast: ${spearman(
    vsForecast.map((x) => x.sim),
    vsForecast.map((x) => x.f.expectedPoints),
  ).toFixed(3)}  (all ${vsForecast.length} clubs)`,
);
const fav = Math.max(...acc.map((a) => a.titles));
console.log(`\nFavourite's title probability: ${pct(fav)}   (target 45-65%)`);
console.log(
  `Highest relegation rate: ${pct(Math.max(...acc.map((a) => a.relegated)))}   (target <= ~85-90%)`,
);

// FPL-derived benchmark. Context-biased, for reference only: it is built from the same FPL stats
// as the ratings, so it cannot judge whether removing their team-context bias helped.
const perMatch = SEASONS * 2 * (n - 1);
const simAvgPoints = acc.map((a) => a.points / SEASONS);
const sim = acc.map((a, i) => ({
  name: clubs[i]!.team.name,
  f: a.xgf / perMatch,
  a: a.xga / perMatch,
  real: benchmark[i]!,
}));
console.log('\nxG per match: simulated vs FPL benchmark (context-biased, for reference only)');
console.log('Club                Sim F  Sim A  Sim D  | Real F Real A Real D | dF     dA     dD');
const signed = (v: number): string => (v >= 0 ? '+' : '') + v.toFixed(2);
for (const x of [...sim].sort((p, q) => q.real.strength - p.real.strength)) {
  const sd = x.f - x.a;
  console.log(
    `${x.name.padEnd(18)} ${x.f.toFixed(2).padStart(6)} ${x.a.toFixed(2).padStart(6)} ${signed(sd).padStart(6)}  | ` +
      `${x.real.xgFor.toFixed(2).padStart(6)} ${x.real.xgAgainst.toFixed(2).padStart(6)} ${signed(x.real.strength).padStart(6)} | ` +
      `${signed(x.f - x.real.xgFor).padStart(6)} ${signed(x.a - x.real.xgAgainst).padStart(6)} ${signed(sd - x.real.strength).padStart(6)}`,
  );
}
const rmse = (d: number[]): number => Math.sqrt(d.reduce((p, v) => p + v * v, 0) / d.length);
const bias = (d: number[]): number => d.reduce((p, v) => p + v, 0) / d.length;
// RMSE is shown raw and after removing the league-wide offset (engine xG is not on FPL's scale
// by construction; what matters for club strength is the shape across clubs).
const report = (label: string, d: number[]): string =>
  `${label} bias ${signed(bias(d))} rmse ${rmse(d).toFixed(3)} (centred ${rmse(d.map((v) => v - bias(d))).toFixed(3)})`;
console.log(
  `vs FPL benchmark (context-biased, for reference only): ${report(
    'xG for',
    sim.map((x) => x.f - x.real.xgFor),
  )}; ` +
    `${report(
      'against',
      sim.map((x) => x.a - x.real.xgAgainst),
    )}; ` +
    `${report(
      'difference',
      sim.map((x) => x.f - x.a - x.real.strength),
    )}`,
);
console.log(
  `Spearman vs FPL benchmark (context-biased, for reference only): ` +
    `${spearman(
      simAvgPoints,
      benchmark.map((b) => b.strength),
    ).toFixed(3)}   ` +
    `(sim xG diff vs benchmark: ${spearman(
      sim.map((x) => x.f - x.a),
      benchmark.map((b) => b.strength),
    ).toFixed(3)})`,
);

const avgRank = (rank: number): number => pointsByRank[rank - 1]! / SEASONS;
console.log('\nSpread by finishing position (average points)    target');
console.log(`  Champion   ${avgRank(1).toFixed(1).padStart(5)}    85-90`);
console.log(`  4th        ${avgRank(4).toFixed(1).padStart(5)}    ~70`);
console.log(`  18th       ${avgRank(18).toFixed(1).padStart(5)}    ~35 (relegation line)`);
console.log(`  20th       ${avgRank(20).toFixed(1).padStart(5)}    20-25`);
console.log(
  `\nGoals per game ${(dist.goals / matches).toFixed(2)}   home wins ${((100 * homeWins) / matches).toFixed(1)}%` +
    `   draws ${((100 * draws) / matches).toFixed(1)}%`,
);
dist.print('(season sim)', dist.goals / matches);
