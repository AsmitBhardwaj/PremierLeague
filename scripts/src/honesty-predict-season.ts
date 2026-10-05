// Prediction honesty: play full automatically-managed seasons (event engine, season dynamics on)
// for a sample of squads and compare with `predictSeason`.
//   pnpm --filter @pl/scripts honesty-predict-season [seasons-per-squad]
// Also compares the season-preview stats: the surrogate's team stats and the event-engine player
// batch (`forecastUserSeasons`, BATCH seasons of the user's 38 matches) with the played seasons.
// Squads: the landing sample, a balanced build, an optimised build and the cheapest legal squad,
// all at £275m. The user's club picks its XI with `pickSquad`, plays balanced, and keeps that XI
// (auto-replaced only when a player is unavailable); the other 19 clubs run the same rules.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Season,
  forecastUserSeasons,
  pickSquad,
  predictSeason,
  simulateMatch,
  type Player,
  type Team,
} from '@pl/engine';
import { applyTuningOverrides } from './lib/tuning-overrides';
import { balancedBuild, optimise } from '../../apps/web/app/play/lib/budget-helpers';
import {
  buildOpponentTeams,
  computeReplacedClub,
  listClubs,
} from '../../apps/web/app/play/lib/clubs';
import {
  SQUAD_BUDGET,
  squadCost,
  cheapestLegalCompletion,
  createPredictionTeam,
  pickFormationXI,
  type Formation,
  type MarketPlayer,
} from '../../apps/web/app/play/lib/squad';

applyTuningOverrides(process.argv.slice(2));
const SEASONS = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 200);
/** Only play the seasons (no prediction, static or batch checks): fast, for tuning sweeps. */
const PLAYED_ONLY = process.env.PLAYED_ONLY === '1';
/** Event-engine seasons in the web worker's player-stat batch. */
const BATCH = Number(process.env.BATCH ?? 12);
/** Static-engine repeats of the 38 fixtures (no season dynamics): the surrogate's own yardstick. */
const STATIC_REPEATS = Number(process.env.STATIC ?? 100);
/** Budget in tenths of £m for the balanced and optimised builds (a difficulty preset: 1750, 2750, 4000). */
const BUDGET = Number(process.env.BUDGET ?? SQUAD_BUDGET);
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const market = JSON.parse(
  readFileSync(join(root, 'apps', 'web', 'app', 'play', 'data', 'players.json'), 'utf8'),
) as MarketPlayer[];

const landing = (
  JSON.parse(
    readFileSync(
      process.env.LANDING_FILE ?? join(root, 'apps', 'web', 'app', 'data', 'landing-sample.json'),
      'utf8',
    ),
  ) as { club: { squadPlayerIds: string[]; starterIds: string[]; formation: Formation } }
).club;
const LANDING_IDS = landing.squadPlayerIds;
const byId = (ids: readonly string[]): MarketPlayer[] =>
  ids.map((id) => market.find((p) => p.id === id)!);
const cheapest = cheapestLegalCompletion([], market)!;
const only = process.env.ONLY_LANDING === '1';
const onlyLabels = process.env.ONLY?.split(',');
const builders: { label: string; build: () => MarketPlayer[] }[] = [
  { label: 'landing sample', build: () => byId(LANDING_IDS) },
  { label: 'balanced', build: () => balancedBuild(BUDGET) },
  { label: 'optimised', build: () => optimise(BUDGET) },
  { label: 'cheapest legal', build: () => byId(cheapest.playerIds) },
];
// Squads are built only when played (the optimiser is slow), so a sweep can ask for one.
const chosen = onlyLabels
  ? builders.filter((x) => onlyLabels.some((l) => x.label.startsWith(l)))
  : only
    ? builders.slice(0, 1)
    : builders;
const samples = chosen.map(({ label, build }) => ({ label, squad: build() }));

const replaced = computeReplacedClub(market);
const realClubs = listClubs(market)
  .filter((c) => c.id !== replaced.id)
  .map((c) => ({
    id: c.id,
    name: c.name,
    players: market.filter((p) => p.clubShortName === c.id) as Player[],
  }));

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]): number => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

console.log(
  'Spend: ' + samples.map((x) => `${x.label} £${(squadCost(x.squad) / 10).toFixed(1)}m`).join(', '),
);
console.log(
  `Replacing ${replaced.name}; ${SEASONS} played seasons per squad vs predictSeason (10,000 seasons)`,
);
console.log(
  'Squad            Played   sd   Pred   Diff | Pos(played/pred) | Title % | Top4 % | Relegated %',
);
for (const { label, squad } of samples) {
  const players = squad as Player[];
  // The landing sample is played as its page shows it (its own formation and XI).
  const team: Team =
    label === 'landing sample'
      ? createPredictionTeam(
          'USER',
          'User FC',
          squad,
          landing.starterIds.length
            ? landing.starterIds
            : pickFormationXI(squad, landing.formation),
          landing.formation,
        )
      : pickSquad('USER', 'User FC', players);
  const prediction = predictSeason(team, {
    seasons: 10_000,
    seed: 7,
    replacedClubId: replaced.id,
    opponents: buildOpponentTeams(market, replaced.id, squad),
  });
  const likely = prediction.positionDistribution.reduce((b, r) =>
    r.probability > b.probability ? r : b,
  ).position;
  const points: number[] = [];
  const positions: number[] = [];
  const played = {
    wins: [] as number[],
    draws: [] as number[],
    losses: [] as number[],
    goalsFor: [] as number[],
    goalsAgainst: [] as number[],
    cleanSheets: [] as number[],
    yellowCards: [] as number[],
    redCards: [] as number[],
  };
  const playerTotals = new Map<
    string,
    { goals: number; assists: number; ratings: number; apps: number }
  >();
  const topScorerGoals: number[] = [];
  for (let s = 0; s < SEASONS; s++) {
    const season = new Season({
      seed: 1000 + s,
      clubs: [{ id: 'USER', name: 'User FC', players }, ...realClubs],
      userClubId: 'USER',
    });
    season.setUserLineup({
      formation: team.formation,
      starters: team.players.map((p) => p.id),
      tactic: 'balanced',
    });
    const t = { w: 0, d: 0, l: 0, gf: 0, ga: 0, cs: 0, yc: 0, rc: 0 };
    while (!season.finished) {
      season.playMatchday({
        onMatch: (fixture, result) => {
          const side = fixture.home === 'USER' ? 'home' : fixture.away === 'USER' ? 'away' : null;
          if (!side) return;
          const other = side === 'home' ? 'away' : 'home';
          const scored = result.score[side];
          const conceded = result.score[other];
          t.gf += scored;
          t.ga += conceded;
          if (conceded === 0) t.cs++;
          if (scored > conceded) t.w++;
          else if (scored === conceded) t.d++;
          else t.l++;
          t.yc += result.stats[side].yellowCards;
          t.rc += result.stats[side].redCards;
        },
      });
    }
    played.wins.push(t.w);
    played.draws.push(t.d);
    played.losses.push(t.l);
    played.goalsFor.push(t.gf);
    played.goalsAgainst.push(t.ga);
    played.cleanSheets.push(t.cs);
    played.yellowCards.push(t.yc);
    played.redCards.push(t.rc);
    const mine = season.playerStats().filter((p) => p.clubId === 'USER');
    topScorerGoals.push(Math.max(0, ...mine.map((p) => p.goals)));
    for (const p of mine) {
      const line = playerTotals.get(p.playerId) ?? { goals: 0, assists: 0, ratings: 0, apps: 0 };
      line.goals += p.goals;
      line.assists += p.assists;
      line.ratings += p.ratingSum;
      line.apps += p.appearances;
      playerTotals.set(p.playerId, line);
    }
    const table = season.table();
    const index = table.findIndex((r) => r.clubId === 'USER');
    points.push(table[index]!.points);
    positions.push(index + 1);
  }
  const share = (test: (p: number) => boolean): number =>
    (100 * positions.filter(test).length) / SEASONS;
  const meanPosition = mean(positions);
  const predictedPosition = prediction.positionDistribution.reduce(
    (sum, r) => sum + r.position * r.probability,
    0,
  );
  const diff = prediction.meanPoints - mean(points);
  console.log(
    `${label.padEnd(16)} ${mean(points).toFixed(1).padStart(6)} ${sd(points).toFixed(1).padStart(4)} ` +
      `${prediction.meanPoints.toFixed(1).padStart(6)} ${(diff >= 0 ? '+' : '') + diff.toFixed(1).padStart(5)} | ` +
      `${meanPosition.toFixed(1).padStart(5)} / ${predictedPosition.toFixed(1).padEnd(5)} (mode ${likely}) | ` +
      `${share((p) => p === 1)
        .toFixed(1)
        .padStart(4)}/${(100 * prediction.titleProbability).toFixed(1).padEnd(4)} | ` +
      `${share((p) => p <= 4)
        .toFixed(1)
        .padStart(4)}/${(100 * prediction.top4Probability).toFixed(1).padEnd(4)} | ` +
      `${share((p) => p >= 18)
        .toFixed(1)
        .padStart(4)}/${(100 * prediction.relegationProbability).toFixed(1).padEnd(4)}`,
  );

  if (PLAYED_ONLY) continue;

  // ---- season-preview stats: surrogate team stats and the player batch against played seasons
  const lineup = {
    formation: team.formation,
    starters: team.players.map((p) => p.id),
    tactic: 'balanced' as const,
  };
  const startedAt = performance.now();
  const batch = forecastUserSeasons(
    {
      seed: 1,
      userClubId: 'USER',
      clubs: [{ id: 'USER', name: 'User FC', players }, ...realClubs],
    },
    { seasons: BATCH, seed: 7, lineup },
  );
  const batchMs = performance.now() - startedAt;
  // The same 38 fixtures against fresh opponents with no season dynamics, many times over. The
  // surrogate is fitted to exactly this, so it separates the fit from what dynamics change.
  const opponents = buildOpponentTeams(market, replaced.id, squad);
  const fixed = { w: 0, d: 0, l: 0, gf: 0, ga: 0, cs: 0 };
  let staticSeed = 77_000;
  for (let r = 0; r < STATIC_REPEATS; r++) {
    for (const opponent of opponents) {
      for (const home of [true, false]) {
        const result = simulateMatch({
          home: home ? team : opponent,
          away: home ? opponent : team,
          seed: staticSeed++,
        });
        const scored = home ? result.score.home : result.score.away;
        const conceded = home ? result.score.away : result.score.home;
        fixed.gf += scored;
        fixed.ga += conceded;
        if (conceded === 0) fixed.cs++;
        if (scored > conceded) fixed.w++;
        else if (scored === conceded) fixed.d++;
        else fixed.l++;
      }
    }
  }
  for (const key of Object.keys(fixed) as (keyof typeof fixed)[]) fixed[key] /= STATIC_REPEATS;
  const pct = (a: number, b: number): string =>
    `${a >= b ? '+' : ''}${((100 * (a - b)) / b).toFixed(1)}%`;
  const row = (
    name: string,
    pred: number,
    batchValue: number | null,
    actual: number,
    fixedValue: number | null,
  ): string =>
    `  ${name.padEnd(15)} played ${actual.toFixed(1).padStart(6)} | static ${fixedValue === null ? '   n/a' : fixedValue.toFixed(1).padStart(6)} (${fixedValue === null ? '    ' : pct(fixedValue, actual).padStart(7)}) | surrogate ${pred.toFixed(1).padStart(6)} (${pct(pred, actual).padStart(7)} played, ${fixedValue === null ? '  n/a' : pct(pred, fixedValue).padStart(7)} static)` +
    (batchValue === null
      ? ''
      : ` | batch ${batchValue.toFixed(1).padStart(6)} (${pct(batchValue, actual).padStart(7)})`);
  const ts = prediction.teamStats!;
  console.log(
    `  -- ${label}: preview stats (batch ${BATCH} seasons in ${batchMs.toFixed(0)} ms in Node)`,
  );
  console.log(row('wins', ts.wins, batch.team.wins, mean(played.wins), fixed.w));
  console.log(row('draws', ts.draws, batch.team.draws, mean(played.draws), fixed.d));
  console.log(row('losses', ts.losses, batch.team.losses, mean(played.losses), fixed.l));
  console.log(
    row('goals scored', ts.goalsFor, batch.team.goalsFor, mean(played.goalsFor), fixed.gf),
  );
  console.log(
    row(
      'goals conceded',
      ts.goalsAgainst,
      batch.team.goalsAgainst,
      mean(played.goalsAgainst),
      fixed.ga,
    ),
  );
  console.log(
    row('clean sheets', ts.cleanSheets, batch.team.cleanSheets, mean(played.cleanSheets), fixed.cs),
  );
  for (const [name, batchValue, actual] of [
    ['yellow cards', batch.team.yellowCards, mean(played.yellowCards)],
    ['red cards', batch.team.redCards, mean(played.redCards)],
  ] as const) {
    console.log(
      `  ${name.padEnd(15)} played ${actual.toFixed(1).padStart(6)} | batch ${batchValue.toFixed(1).padStart(6)} (${pct(batchValue, actual).padStart(7)})`,
    );
  }
  const avg = (id: string) => {
    const l = playerTotals.get(id);
    return l
      ? {
          goals: l.goals / SEASONS,
          assists: l.assists / SEASONS,
          rating: l.apps ? l.ratings / l.apps : 0,
        }
      : { goals: 0, assists: 0, rating: 0 };
  };
  const pick = (
    name: string,
    p: typeof batch.topScorer,
    field: 'goals' | 'assists' | 'rating',
  ): void => {
    if (!p) return;
    const actual = avg(p.playerId)[field];
    const predicted = field === 'rating' ? p.averageRating : p[field];
    console.log(
      `  ${name.padEnd(15)} ${p.name} (${p.position}): batch ${predicted.toFixed(2)}, played ${actual.toFixed(2)} (${pct(predicted, actual)})`,
    );
  };
  pick('top scorer', batch.topScorer, 'goals');
  pick('top assister', batch.topAssister, 'assists');
  pick('star player', batch.starPlayer, 'rating');
  const bestPlayed = [...playerTotals].sort(([, a], [, b]) => b.goals - a.goals)[0];
  console.log(
    `  played-seasons leading scorer averages ${(bestPlayed![1].goals / SEASONS).toFixed(2)} goals (batch top scorer: ${batch.topScorer?.name})`,
  );
}
