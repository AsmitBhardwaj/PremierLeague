import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { predictSeason } from '@pl/engine';
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
  'fpl-251',
  'fpl-273',
  'fpl-422',
  'fpl-446',
  'fpl-230',
  'fpl-114',
  'fpl-332',
  'fpl-112',
  'fpl-124',
  'fpl-403',
  'fpl-183',
  'fpl-339',
  'fpl-126',
  'fpl-17',
  'fpl-224',
  'fpl-465',
  'fpl-464',
  'fpl-166',
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
  { seasons: 10_000, seed, replacedClubId },
);
const likelyFinish = prediction.positionDistribution.reduce((best, item) =>
  item.probability > best.probability ? item : best,
).position;
if (likelyFinish < 8 || likelyFinish > 12) {
  throw new Error(`Landing sample must finish 8th–12th; generated ${likelyFinish}.`);
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
  `Wrote ${club.name}: ${likelyFinish}th most likely, ${prediction.meanPoints.toFixed(1)} mean points to ${destination}`,
);
