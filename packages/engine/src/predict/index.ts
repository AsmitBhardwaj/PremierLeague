import backgroundData from './data/season-background.json';
import { createRng } from '../rng';
import type { Team } from '../types';
import { aggregateTeamRatings, type TeamAggregateRatings } from './ratings';
import { simulateSurrogateMatch } from './surrogate';
import type {
  HistogramBin,
  OpponentExpectedPoints,
  PositionProbability,
  PredictSeasonOptions,
  SeasonPrediction,
} from './types';

interface BackgroundClub {
  id: string;
  name: string;
  ratings: TeamAggregateRatings;
}

interface ReplacementBackground {
  clubs: BackgroundClub[];
  /** Base64-encoded uint8s, season-major: season 0's clubs, then season 1's clubs, etc. */
  pointsBase64: string;
}

interface BackgroundData {
  version: number;
  seasons: number;
  seed: number;
  defaultReplacedClubId: string;
  replacements: Record<string, ReplacementBackground>;
}

const DATA = backgroundData as BackgroundData;
const decodedPoints = new Map<string, Uint8Array>();
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const decodeBase64 = (input: string): Uint8Array => {
  const padding = input.endsWith('==') ? 2 : input.endsWith('=') ? 1 : 0;
  const output = new Uint8Array((input.length * 3) / 4 - padding);
  let out = 0;
  for (let i = 0; i < input.length; i += 4) {
    const a = BASE64.indexOf(input[i]!);
    const b = BASE64.indexOf(input[i + 1]!);
    const c = input[i + 2] === '=' ? 0 : BASE64.indexOf(input[i + 2]!);
    const d = input[i + 3] === '=' ? 0 : BASE64.indexOf(input[i + 3]!);
    const bits = (a << 18) | (b << 12) | (c << 6) | d;
    if (out < output.length) output[out++] = bits >>> 16;
    if (out < output.length) output[out++] = (bits >>> 8) & 255;
    if (out < output.length) output[out++] = bits & 255;
  }
  return output;
};

const addResult = (points: number[], index: number, scored: number, conceded: number): number => {
  const won = scored > conceded;
  const drew = scored === conceded;
  points[index]! += won ? 3 : drew ? 1 : 0;
  return won ? 3 : drew ? 1 : 0;
};

const histogram = (values: readonly number[], binWidth = 5): HistogramBin[] => {
  const bins = new Map<number, number>();
  for (const value of values) {
    const min = Math.floor(value / binWidth) * binWidth;
    bins.set(min, (bins.get(min) ?? 0) + 1);
  }
  return [...bins.entries()]
    .sort(([a], [b]) => a - b)
    .map(([min, count]) => ({
      min,
      max: min + binWidth - 1,
      count,
      probability: count / values.length,
    }));
};

/**
 * Predict a 20-club season by combining precomputed real-club fixtures with only the 38 fixtures
 * involving the supplied squad. The default 10,000-season run is synchronous and sub-second.
 */
export function predictSeason(
  userSquad: Team,
  options: PredictSeasonOptions = {},
): SeasonPrediction {
  const seasons = options.seasons ?? 10_000;
  const seed = options.seed ?? 1;
  const replacedClubId = options.replacedClubId ?? DATA.defaultReplacedClubId;
  const background = DATA.replacements[replacedClubId];
  if (!background) {
    throw new Error(
      `No precomputed background for ${replacedClubId}; choose one of ${Object.keys(DATA.replacements).join(', ')}`,
    );
  }
  if (!Number.isInteger(seasons) || seasons < 1 || seasons > DATA.seasons) {
    throw new Error(`seasons must be an integer between 1 and ${DATA.seasons}`);
  }
  if (!Number.isInteger(seed)) throw new Error('seed must be an integer');

  const user = aggregateTeamRatings(userSquad);
  const clubCount = background.clubs.length;
  let storedPoints = decodedPoints.get(replacedClubId);
  if (!storedPoints) {
    storedPoints = decodeBase64(background.pointsBase64);
    decodedPoints.set(replacedClubId, storedPoints);
  }
  const pointsSamples = new Array<number>(seasons);
  const positions = new Array<number>(20).fill(0);
  const opponentPoints = background.clubs.map(() => ({ home: 0, away: 0 }));
  let titles = 0;
  let top4 = 0;
  let relegations = 0;
  // Offset selects a deterministic window/order through the fixed background without regenerating it.
  const offset = ((seed % DATA.seasons) + DATA.seasons) % DATA.seasons;
  const rng = createRng(seed ^ 0x9e3779b9);

  for (let season = 0; season < seasons; season++) {
    const backgroundSeason = (offset + season) % DATA.seasons;
    const base = backgroundSeason * clubCount;
    const points = Array.from(storedPoints.subarray(base, base + clubCount));
    let userPoints = 0;

    for (let club = 0; club < clubCount; club++) {
      const opponent = background.clubs[club]!;
      const atHome = simulateSurrogateMatch(user, opponent.ratings, rng);
      userPoints +=
        atHome.homeGoals > atHome.awayGoals ? 3 : atHome.homeGoals === atHome.awayGoals ? 1 : 0;
      addResult(points, club, atHome.awayGoals, atHome.homeGoals);
      opponentPoints[club]!.home +=
        atHome.homeGoals > atHome.awayGoals ? 3 : atHome.homeGoals === atHome.awayGoals ? 1 : 0;

      const away = simulateSurrogateMatch(opponent.ratings, user, rng);
      const awayPoints =
        away.awayGoals > away.homeGoals ? 3 : away.awayGoals === away.homeGoals ? 1 : 0;
      userPoints += awayPoints;
      addResult(points, club, away.homeGoals, away.awayGoals);
      opponentPoints[club]!.away += awayPoints;
    }

    let position = 1;
    for (let club = 0; club < clubCount; club++) {
      // Background storage intentionally contains points only. A seeded coin flip is an unbiased
      // proxy for goal difference when two clubs finish level on points.
      if (points[club]! > userPoints || (points[club] === userPoints && rng() < 0.5)) {
        position++;
      }
    }
    pointsSamples[season] = userPoints;
    positions[position - 1]!++;
    if (position === 1) titles++;
    if (position <= 4) top4++;
    if (position >= 18) relegations++;
  }

  const positionDistribution: PositionProbability[] = positions.map((count, index) => ({
    position: index + 1,
    count,
    probability: count / seasons,
  }));
  const perOpponentExpectedPoints: OpponentExpectedPoints[] = background.clubs.map(
    (club, index) => {
      const values = opponentPoints[index]!;
      const home = values.home / seasons;
      const away = values.away / seasons;
      return { opponentId: club.id, opponentName: club.name, home, away, total: home + away };
    },
  );

  return {
    seasons,
    seed,
    replacedClubId,
    meanPoints: pointsSamples.reduce((sum, value) => sum + value, 0) / seasons,
    pointsDistribution: histogram(pointsSamples),
    positionDistribution,
    titleProbability: titles / seasons,
    top4Probability: top4 / seasons,
    relegationProbability: relegations / seasons,
    perOpponentExpectedPoints,
  };
}

export { aggregateTeamRatings } from './ratings';
export type { TeamAggregateRatings } from './ratings';
export {
  expectedGoals,
  samplePoisson,
  simulateSurrogateMatch,
  SURROGATE_PARAMETERS,
  surrogateFeatures,
} from './surrogate';
export type { SurrogateMatch, SurrogateParameters } from './surrogate';
export type * from './types';
