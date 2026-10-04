// Precompute fixtures that do not involve the user's club for each promoted-club replacement.
// Usage: pnpm --filter @pl/scripts generate-season-background [seasons]
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aggregateTeamRatings,
  buildClubs,
  createRng,
  simulateSurrogateMatch,
  teamProfile,
} from '@pl/engine';
import { loadFplCache } from './lib/fpl-cache';

const SEASONS = Number(process.argv[2] ?? 10_000);
const SEED = 2_026_270;
const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'packages',
  'engine',
  'src',
  'predict',
  'data',
  'season-background.json',
);
if (!Number.isInteger(SEASONS) || SEASONS < 1)
  throw new Error('seasons must be a positive integer');

const { bootstrap, summaries } = loadFplCache();
const allClubs = buildClubs(bootstrap, summaries).map(({ team }) => ({
  id: team.id,
  name: team.name,
  // The five legacy composites only rank the promoted clubs (the replaced-club rule); the
  // surrogate itself runs on the profile.
  ratings: aggregateTeamRatings(team),
  profile: teamProfile(team),
}));
const promotedIds = ['COV', 'HUL', 'IPS'];
const promoted = allClubs.filter((club) => promotedIds.includes(club.id));
if (promoted.length !== promotedIds.length)
  throw new Error('Expected promoted clubs COV, HUL and IPS');
const average = (club: (typeof allClubs)[number]): number =>
  Object.values(club.ratings).reduce((sum, value) => sum + value, 0) / 5;
const defaultReplacedClubId = [...promoted].sort((a, b) => average(a) - average(b))[0]!.id;

const replacements: Record<
  string,
  {
    clubs: { id: string; name: string; profile: ReturnType<typeof teamProfile> }[];
    pointsBase64: string;
  }
> = {};
for (const replacedClub of promoted) {
  const replaced = allClubs.findIndex((club) => club.id === replacedClub.id);
  const clubs = allClubs
    .filter((_, index) => index !== replaced)
    .map(({ id, name, profile }) => ({ id, name, profile }));
  const points = new Uint8Array(SEASONS * clubs.length);
  const rng = createRng(SEED + replaced * 100_003);
  for (let season = 0; season < SEASONS; season++) {
    const seasonPoints = new Uint8Array(clubs.length);
    for (let home = 0; home < clubs.length; home++) {
      for (let away = 0; away < clubs.length; away++) {
        if (home === away) continue;
        const result = simulateSurrogateMatch(clubs[home]!.profile, clubs[away]!.profile, rng);
        if (result.homeGoals > result.awayGoals) seasonPoints[home]! += 3;
        else if (result.homeGoals < result.awayGoals) seasonPoints[away]! += 3;
        else {
          seasonPoints[home]!++;
          seasonPoints[away]!++;
        }
      }
    }
    points.set(seasonPoints, season * clubs.length);
  }
  replacements[replacedClub.id] = {
    clubs,
    pointsBase64: Buffer.from(points).toString('base64'),
  };
  console.log(`generated ${SEASONS} backgrounds excluding ${replacedClub.name}`);
}

writeFileSync(
  OUT,
  `${JSON.stringify({ version: 1, seasons: SEASONS, seed: SEED, defaultReplacedClubId, replacements })}\n`,
);
console.log(`Wrote ${OUT}; default replacement is ${defaultReplacedClubId}`);
