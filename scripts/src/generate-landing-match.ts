import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulateMatch, type MatchResult, type Team } from '@pl/engine';
import { createOpponentTeam } from '../../apps/web/app/match/lib/match';
import {
  createPredictionTeam,
  validateLineup,
  type Formation,
  type MarketPlayer,
} from '../../apps/web/app/play/lib/squad';

// Generates the unedited engine match the landing-page hero loops. The web app never bundles the
// engine for it: the page fetches this checked-in timeline lazily and only plays it back.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const market = JSON.parse(
  readFileSync(join(root, 'apps', 'web', 'app', 'play', 'data', 'players.json'), 'utf8'),
) as MarketPlayer[];
const sample = JSON.parse(
  readFileSync(join(root, 'apps', 'web', 'app', 'data', 'landing-sample.json'), 'utf8'),
) as {
  club: {
    id: string;
    name: string;
    formation: Formation;
    squadPlayerIds: string[];
    starterIds: string[];
  };
};
const destination = join(root, 'apps', 'web', 'public', 'landing-match.json');
const OPPONENT_ID = 'BHA';

const { club } = sample;
const squad = club.squadPlayerIds.map((id) => market.find((player) => player.id === id)!);
const errors = validateLineup(squad, club.starterIds, club.formation);
if (errors.length) throw new Error(`Landing sample lineup is invalid: ${errors.join(' ')}`);
const home = createPredictionTeam(club.id, club.name, squad, club.starterIds, club.formation);
const away = createOpponentTeam(market, OPPONENT_ID);

/** The first seed with a watchable loop: a 3-5 goal home win, both sides scoring, no red card. */
let seed = 1;
let result: MatchResult | undefined;
for (; seed < 5_000; seed++) {
  const candidate = simulateMatch({ home, away, seed });
  const total = candidate.score.home + candidate.score.away;
  const redCard = candidate.events.some((event) => event.outcome === 'red_card');
  if (
    total >= 3 &&
    total <= 5 &&
    candidate.score.home > candidate.score.away &&
    candidate.score.away >= 1 &&
    !redCard
  ) {
    result = candidate;
    break;
  }
}
if (!result) throw new Error('No suitable landing seed found.');

const lineup = (team: Team) => ({
  id: team.id,
  name: team.name,
  formation: team.formation,
  players: team.players.map(({ id, name, position }) => ({ id, name, position })),
});

mkdirSync(dirname(destination), { recursive: true });
writeFileSync(
  destination,
  JSON.stringify({
    schemaVersion: 1,
    generatedBy: 'pnpm --filter @pl/scripts generate-landing-match',
    seed,
    home: lineup(home),
    away: lineup(away),
    score: result.score,
    events: result.events,
  }) + '\n',
);
console.log(
  `Wrote seed ${seed}: ${home.name} ${result.score.home}-${result.score.away} ${away.name}, ${result.events.length} events to ${destination}`,
);
