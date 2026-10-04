// Prediction honesty: play full automatically-managed seasons (event engine, season dynamics on)
// for a sample of squads and compare with `predictSeason`.
//   pnpm --filter @pl/scripts honesty-predict-season [seasons-per-squad]
// Squads: the landing sample, a balanced build, an optimised build and the cheapest legal squad,
// all at £275m. The user's club picks its XI with `pickSquad`, plays balanced, and keeps that XI
// (auto-replaced only when a player is unavailable); the other 19 clubs run the same rules.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Season, pickSquad, predictSeason, type Player, type Team } from '@pl/engine';
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

const SEASONS = Number(process.argv[2] ?? 200);
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
const allSamples: { label: string; squad: MarketPlayer[] }[] = [
  { label: 'landing sample', squad: byId(LANDING_IDS) },
  { label: 'balanced', squad: balancedBuild(SQUAD_BUDGET) },
  { label: 'optimised', squad: optimise(SQUAD_BUDGET) },
  { label: 'cheapest legal', squad: byId(cheapest.playerIds) },
];
const samples = only ? allSamples.slice(0, 1) : allSamples;

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
    while (!season.finished) season.playMatchday();
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
}
