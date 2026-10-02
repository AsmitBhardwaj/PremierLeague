// Simulates full 38-game double round-robin seasons between the 20 real clubs (built from the
// FPL cache) and prints the average final table plus the spread vs a typical recent season.
//   pnpm --filter @pl/scripts calibrate-season [seasons]
import { buildClubs, simulateMatch } from '@pl/engine';
import { DistributionStats } from './lib/distribution';
import { loadFplCache } from './lib/fpl-cache';

const SEASONS = Number(process.argv[2] ?? 200);
const { bootstrap, summaries } = loadFplCache();
const clubs = buildClubs(bootstrap, summaries);
const n = clubs.length;

interface Acc {
  points: number;
  positionSum: number;
  titles: number;
  top4: number;
  relegated: number;
  gf: number;
  ga: number;
}
const acc: Acc[] = clubs.map(() => ({
  points: 0,
  positionSum: 0,
  titles: 0,
  top4: 0,
  relegated: 0,
  gf: 0,
  ga: 0,
}));
const pointsByRank = new Array<number>(n).fill(0);
const dist = new DistributionStats();
let homeWins = 0;
let draws = 0;
let matches = 0;
const started = Date.now();

for (let s = 0; s < SEASONS; s++) {
  const pts = new Array<number>(n).fill(0);
  const gf = new Array<number>(n).fill(0);
  const ga = new Array<number>(n).fill(0);
  let m = 0;
  for (let h = 0; h < n; h++) {
    for (let a = 0; a < n; a++) {
      if (h === a) continue;
      const home = clubs[h]!;
      const away = clubs[a]!;
      const r = simulateMatch({ home: home.team, away: away.team, seed: s * 1000 + m++ + 1 });
      dist.add(r, home.team.id);
      matches++;
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
