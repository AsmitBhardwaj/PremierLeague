// How goals, shots, penalties and match ratings are distributed over full seasons (real-club
// squads, Phase 5 season dynamics on). Used to guard the scorer-realism guardrails in
// docs/PRODUCT_PLAN.md section 7 and to tune against them.
//   pnpm --filter @pl/scripts diagnose-scorers [seasons] [--set path=value ...]
// `--set` overrides a TUNING constant for this run only (for sweeps), for example
//   --set penaltyShare.central=0.08 --set zoneWeight.MID.5=0.6
import { Season, TUNING, type MatchEvent, type MatchResult } from '@pl/engine';
import { loadFplCache } from './lib/fpl-cache';
import { buildSeasonClubs } from './lib/season-clubs';

const args = process.argv.slice(2);
const SEASONS = Number(args.find((a) => /^\d+$/.test(a)) ?? 200);

// Runtime overrides: walk the path into TUNING and replace the leaf.
for (let i = 0; i < args.length; i++) {
  if (args[i] !== '--set') continue;
  const [path, raw] = (args[i + 1] ?? '').split('=');
  if (!path || raw === undefined || Number.isNaN(Number(raw))) throw new Error('use --set a.b=1.5');
  const keys = path.split('.');
  let target: Record<string, unknown> = TUNING as unknown as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) target = target[key] as Record<string, unknown>;
  target[keys.at(-1)!] = Number(raw);
}

const { bootstrap, summaries } = loadFplCache();
const clubs = buildSeasonClubs(bootstrap, summaries);
const positionOf = new Map(clubs.flatMap((c) => c.players.map((p) => [p.id, p.position] as const)));

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const sd = (xs: readonly number[]): number => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const percentile = (xs: readonly number[], p: number): number => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
};

/** Indexes of shots that are penalties: the shot straight after a foul marked as a penalty. */
function penaltyShots(events: readonly MatchEvent[]): Set<number> {
  const out = new Set<number>();
  events.forEach((event, index) => {
    if (event.action !== 'foul' || event.outcome !== 'penalty') return;
    for (let j = index + 1; j <= index + 3 && j < events.length; j++) {
      if (events[j]!.action === 'shot') {
        out.add(j);
        break;
      }
    }
  });
  return out;
}

interface PlayerTotals {
  name: string;
  club: string;
  position: string;
  goals: number;
  assists: number;
  appearances: number;
  shots: number;
}

const totals = new Map<string, PlayerTotals>();
const clubTotals = new Map<string, { shots: number; matches: number }>();
const topScorerGoals: number[] = [];
const topScorerShare: number[] = [];
const pointsByRank = new Array<number>(20).fill(0);
const byPosition = new Map<string, { rating: number[]; individual: number[] }>();
let matches = 0;
let goals = 0;
let draws = 0;
let sevenPlus = 0;
let reds = 0;
let teamShots = 0;
let penaltiesAwarded = 0;
let penaltyGoals = 0;

for (let s = 0; s < SEASONS; s++) {
  const season = new Season({ seed: s + 1, clubs });
  const clubGoals = new Map<string, number>();
  while (!season.finished) {
    season.playMatchday({
      onMatch: (fixture, result: MatchResult) => {
        matches++;
        goals += result.score.home + result.score.away;
        if (result.score.home === result.score.away) draws++;
        if (result.score.home + result.score.away >= 7) sevenPlus++;
        reds += result.stats.home.redCards + result.stats.away.redCards;
        const pens = penaltyShots(result.events);
        penaltiesAwarded += pens.size;
        for (const index of pens) {
          if (result.events[index]!.outcome === 'goal') penaltyGoals++;
        }
        for (const side of ['home', 'away'] as const) {
          const club = side === 'home' ? fixture.home : fixture.away;
          teamShots += result.stats[side].shots;
          const t = clubTotals.get(club) ?? { shots: 0, matches: 0 };
          t.shots += result.stats[side].shots;
          t.matches++;
          clubTotals.set(club, t);
          clubGoals.set(club, (clubGoals.get(club) ?? 0) + result.score[side]);
        }
        for (const rating of result.playerRatings) {
          const position = positionOf.get(rating.playerId.slice(rating.teamId.length + 1)) ?? '?';
          let t = totals.get(rating.playerId);
          if (!t) {
            t = {
              name: rating.name,
              club: rating.teamId,
              position,
              goals: 0,
              assists: 0,
              appearances: 0,
              shots: 0,
            };
            totals.set(rating.playerId, t);
          }
          t.goals += rating.goals;
          t.assists += rating.assists;
          t.appearances++;
          t.shots += rating.shots;
          if (rating.minutesPlayed >= 60) {
            const bucket = byPosition.get(position) ?? { rating: [], individual: [] };
            bucket.rating.push(rating.rating);
            bucket.individual.push(rating.individual);
            byPosition.set(position, bucket);
          }
        }
      },
    });
  }
  season.table().forEach((row, i) => (pointsByRank[i]! += row.points));
  const stats = season.playerStats();
  topScorerGoals.push(Math.max(...stats.map((p) => p.goals)));
  const best = new Map<string, number>();
  for (const p of stats) best.set(p.clubId, Math.max(best.get(p.clubId) ?? 0, p.goals));
  for (const [club, top] of best) topScorerShare.push(top / Math.max(1, clubGoals.get(club) ?? 1));
}

const f = (x: number, d = 1): string => x.toFixed(d);
console.log(`${SEASONS} seasons, ${matches} matches (season dynamics on)`);
console.log(
  `Goals/game ${f(goals / matches, 2)}  draws ${f((100 * draws) / matches)}%  7+ goals ${f((100 * sevenPlus) / matches)}%  reds/game ${f(reds / matches, 3)}`,
);
console.log(
  `Points by finishing place: 1st ${f(pointsByRank[0]! / SEASONS)}  4th ${f(pointsByRank[3]! / SEASONS)}  18th ${f(pointsByRank[17]! / SEASONS)}  20th ${f(pointsByRank[19]! / SEASONS)}`,
);
console.log(
  `Team shots per match ${f(teamShots / (2 * matches))}  penalties per match ${f(penaltiesAwarded / matches, 2)}  (conversion ${f((100 * penaltyGoals) / Math.max(1, penaltiesAwarded), 0)}%)  penalty goals ${f((100 * penaltyGoals) / goals)}% of all goals`,
);
console.log(
  `League top scorer goals: mean ${f(mean(topScorerGoals))}  median ${percentile(topScorerGoals, 0.5)}  p90 ${percentile(topScorerGoals, 0.9)}  p99 ${percentile(topScorerGoals, 0.99)}  max ${Math.max(...topScorerGoals)}`,
);
console.log(
  `Top scorer's share of his club's goals: mean ${f(100 * mean(topScorerShare))}%  p90 ${f(100 * percentile(topScorerShare, 0.9))}%  max ${f(100 * Math.max(...topScorerShare))}%`,
);

console.log('\nMatch ratings by position (appearances of 60+ minutes):');
console.log('Pos   n         rating mean  sd     individual mean  sd');
for (const position of ['GK', 'DEF', 'MID', 'FWD']) {
  const b = byPosition.get(position);
  if (!b) continue;
  console.log(
    `${position.padEnd(4)}  ${String(b.rating.length).padStart(7)}   ${f(mean(b.rating), 3)}      ${f(sd(b.rating), 3)}  ${f(mean(b.individual), 3)}            ${f(sd(b.individual), 3)}`,
  );
}

console.log('\nTop individual scorers (average a season):');
const top = [...totals.values()].sort((a, b) => b.goals - a.goals).slice(0, 8);
for (const t of top) {
  const club = clubTotals.get(t.club)!;
  const perMatch = t.shots / t.appearances;
  console.log(
    `  ${t.name.padEnd(16)} ${t.club} ${t.position}  ${f(t.goals / SEASONS).padStart(5)} goals  ${f(t.assists / SEASONS)} assists  ${f(t.appearances / SEASONS, 0)} apps  ${f(perMatch, 2)} shots/app (${f((100 * perMatch) / (club.shots / club.matches), 0)}% of his club's)  goals/shot ${f(t.goals / t.shots, 3)}`,
  );
}
