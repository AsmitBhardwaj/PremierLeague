import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  marketValues,
  overall,
  rateAll,
  toRatingInputs,
  type FplElementRaw,
  type ValuationInput,
} from '@pl/engine';
import { loadFplCache } from './lib/fpl-cache';

interface PricedElement extends FplElementRaw {
  now_cost?: number | string;
}

const { bootstrap, summaries } = loadFplCache();
const teams = new Map(bootstrap.teams.map((team) => [team.id, team]));
const elements = new Map(
  bootstrap.elements.map((element) => [element.id, element as PricedElement]),
);
const rated = rateAll(toRatingInputs(bootstrap, summaries)).filter(
  ({ input }) => input.status !== 'u',
);
const pool: ValuationInput[] = rated.map(({ input, player }) => {
  const source = elements.get(input.id);
  const fplPrice = Number(source?.now_cost);
  if (!source || !Number.isInteger(fplPrice) || fplPrice <= 0) {
    throw new Error(`Invalid price for ${player.name}`);
  }
  return {
    id: player.id,
    position: player.position,
    fplPrice,
    overall: Math.round(overall(player.position, player.ratings)),
  };
});
// Our own valuations (tenths of £m). FPL prices only feed this model; they are not written to the
// browser dataset.
const values = marketValues(pool);
const players = rated
  .map(({ input, player }) => {
    const club = teams.get(input.clubId);
    if (!club) throw new Error(`Missing FPL metadata for player ${input.id}`);
    return {
      ...player,
      clubId: String(club.id),
      clubName: club.name,
      clubShortName: club.short_name,
      value: values.get(player.id)!,
      status: input.status,
      overall: Math.round(overall(player.position, player.ratings)),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

const destination = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'apps',
  'web',
  'app',
  'play',
  'data',
  'players.json',
);
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, `${JSON.stringify(players, null, 2)}\n`);
console.log(`Wrote ${players.length} selectable players to ${destination}`);
