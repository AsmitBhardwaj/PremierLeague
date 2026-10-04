import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { predictSeason } from '@pl/engine';
import { buildOpponentTeams } from '../../apps/web/app/play/lib/clubs';
import {
  createPredictionTeam,
  pickFormationXI,
  squadCost,
  validateLineup,
  validateSquad,
  type Formation,
  type MarketPlayer,
} from '../../apps/web/app/play/lib/squad';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = join(root, 'apps', 'web', 'app', 'play', 'data', 'players.json');
const destination = join(root, 'apps', 'web', 'app', 'data', 'landing-sample.json');
const market = JSON.parse(readFileSync(source, 'utf8')) as MarketPlayer[];

const squadPlayerIds = [
  'fpl-572',
  'fpl-269',
  'fpl-17',
  'fpl-553',
  'fpl-300',
  'fpl-204',
  'fpl-244',
  'fpl-138',
  'fpl-577',
  'fpl-339',
  'fpl-224',
  'fpl-254',
  'fpl-100',
  'fpl-608',
  'fpl-364',
  'fpl-239',
  'fpl-145',
  'fpl-127',
] as const;
const formation: Formation = '4-3-3';
const seed = 2103;
const replacedClubId = 'IPS';
const club = { id: 'northstar-fc', name: 'Northstar FC' } as const;

const squad = squadPlayerIds.map((id) => {
  const player = market.find((item) => item.id === id);
  if (!player) throw new Error(`Landing sample player ${id} is missing from player data.`);
  return player;
});
const starterIds = pickFormationXI(squad, formation);
const errors = [...validateSquad(squad), ...validateLineup(squad, starterIds, formation)];
if (errors.length) throw new Error(`Landing sample is invalid: ${[...new Set(errors)].join(' ')}`);

const prediction = predictSeason(
  createPredictionTeam(club.id, club.name, squad, starterIds, formation),
  {
    seasons: 10_000,
    seed,
    replacedClubId,
    opponents: buildOpponentTeams(market, replacedClubId, squad),
  },
);
const likelyFinish = prediction.positionDistribution.reduce((best, item) =>
  item.probability > best.probability ? item : best,
).position;
const averageFinish = prediction.positionDistribution.reduce(
  (sum, item) => sum + item.position * item.probability,
  0,
);
if (averageFinish < 9 || averageFinish > 12) {
  throw new Error(`Landing sample must average 9th–12th; generated ${averageFinish.toFixed(1)}.`);
}

const output = {
  schemaVersion: 1,
  generatedBy: 'pnpm --filter @pl/scripts generate-landing-sample',
  club: {
    ...club,
    formation,
    seed,
    replacedClubId,
    budgetUsed: squadCost(squad),
    squadPlayerIds,
    starterIds,
  },
  prediction,
};

mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, `${JSON.stringify(output, null, 2)}\n`);
console.log(
  `Wrote ${club.name}: ${likelyFinish}th most likely (${averageFinish.toFixed(1)} on average), ${prediction.meanPoints.toFixed(1)} mean points to ${destination}`,
);
