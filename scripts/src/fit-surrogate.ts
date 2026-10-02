// Fit the fast Poisson season surrogate to a large deterministic batch from the event engine.
// Usage: pnpm --filter @pl/scripts fit-surrogate [matches-per-matchup]
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aggregateTeamRatings,
  buildClubs,
  createSyntheticTeam,
  simulateMatch,
  surrogateFeatures,
  type SurrogateParameters,
  type Team,
} from '@pl/engine';
import { loadFplCache } from './lib/fpl-cache';

const REPEATS = Number(process.argv[2] ?? 30);
const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'packages',
  'engine',
  'src',
  'predict',
  'data',
  'surrogate-parameters.json',
);
const FEATURE_NAMES = [
  'intercept',
  'isHome',
  'ownAttack',
  'ownMidfield',
  'ownDefence',
  'ownKeeper',
  'ownBenchDepth',
  'opponentAttack',
  'opponentMidfield',
  'opponentDefence',
  'opponentKeeper',
  'opponentBenchDepth',
  'ownAttackSquared',
  'ownMidfieldSquared',
  'ownDefenceSquared',
  'ownKeeperSquared',
  'ownBenchDepthSquared',
  'opponentAttackSquared',
  'opponentMidfieldSquared',
  'opponentDefenceSquared',
  'opponentKeeperSquared',
  'opponentBenchDepthSquared',
];
const template: SurrogateParameters = {
  version: 1,
  ratingCenter: 65,
  ratingScale: 10,
  featureNames: FEATURE_NAMES,
  coefficients: new Array<number>(FEATURE_NAMES.length).fill(0),
  trainingMatches: 0,
};

interface Matchup {
  home: Team;
  away: Team;
  weight: number;
}
interface Observation {
  features: number[];
  goals: number;
  engineXg: number;
  matchup: number;
  side: 'home' | 'away';
  weight: number;
}

const solve = (matrix: number[][], rhs: number[]): number[] => {
  const n = rhs.length;
  const augmented = matrix.map((row, i) => [...row, rhs[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(augmented[row]![col]!) > Math.abs(augmented[pivot]![col]!)) pivot = row;
    }
    [augmented[col], augmented[pivot]] = [augmented[pivot]!, augmented[col]!];
    const divisor = augmented[col]![col]!;
    if (Math.abs(divisor) < 1e-10) throw new Error('Singular fit matrix');
    for (let j = col; j <= n; j++) augmented[col]![j]! /= divisor;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = augmented[row]![col]!;
      for (let j = col; j <= n; j++) augmented[row]![j]! -= factor * augmented[col]![j]!;
    }
  }
  return augmented.map((row) => row[n]!);
};

/** Ridge-regularised Poisson regression via Newton/IRLS. */
const fitPoisson = (rows: readonly Observation[]): number[] => {
  const p = FEATURE_NAMES.length;
  const beta = new Array<number>(p).fill(0);
  beta[0] = Math.log(rows.reduce((sum, row) => sum + row.goals, 0) / rows.length);
  for (let iteration = 0; iteration < 30; iteration++) {
    const information = Array.from({ length: p }, () => new Array<number>(p).fill(0));
    const gradient = new Array<number>(p).fill(0);
    for (const row of rows) {
      const eta = row.features.reduce((sum, x, j) => sum + x * beta[j]!, 0);
      const mu = Math.exp(Math.max(-3, Math.min(2, eta)));
      for (let j = 0; j < p; j++) {
        gradient[j]! += row.weight * row.features[j]! * (row.goals - mu);
        for (let k = 0; k < p; k++) {
          information[j]![k]! += row.weight * mu * row.features[j]! * row.features[k]!;
        }
      }
    }
    for (let j = 1; j < p; j++) {
      information[j]![j]! += 0.5;
      gradient[j]! -= 0.5 * beta[j]!;
    }
    const delta = solve(information, gradient);
    for (let j = 0; j < p; j++) beta[j]! += delta[j]!;
    if (Math.max(...delta.map(Math.abs)) < 1e-8) break;
  }
  return beta;
};

const { bootstrap, summaries } = loadFplCache();
const real = buildClubs(bootstrap, summaries).map((club) => club.team);
const strengths = [35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90];
const synthetic = strengths.map((strength, index) =>
  createSyntheticTeam({ id: `S${strength}`, strength, seed: 800 + index }),
);
const matchups: Matchup[] = [];
for (let h = 0; h < real.length; h++) {
  for (let a = 0; a < real.length; a++)
    if (h !== a) matchups.push({ home: real[h]!, away: real[a]!, weight: 8 });
}
for (const home of synthetic) {
  for (const awayBase of synthetic) {
    const away = {
      ...awayBase,
      id: `${awayBase.id}a`,
      players: awayBase.players.map((p) => ({ ...p, id: `${p.id}a` })),
      bench: awayBase.bench?.map((p) => ({ ...p, id: `${p.id}a` })),
    };
    matchups.push({ home, away, weight: 1 });
  }
}
for (const club of real) {
  for (const syntheticTeam of synthetic.filter((_, index) => index % 2 === 0)) {
    matchups.push(
      { home: club, away: syntheticTeam, weight: 1 },
      { home: syntheticTeam, away: club, weight: 1 },
    );
  }
}

const observations: Observation[] = [];
let matchSeed = 10_000;
for (let matchup = 0; matchup < matchups.length; matchup++) {
  const { home, away, weight } = matchups[matchup]!;
  const homeRatings = aggregateTeamRatings(home);
  const awayRatings = aggregateTeamRatings(away);
  for (let repeat = 0; repeat < REPEATS; repeat++) {
    const result = simulateMatch({ home, away, seed: matchSeed++ });
    observations.push(
      {
        features: surrogateFeatures(homeRatings, awayRatings, true, template),
        goals: result.score.home,
        engineXg: result.stats.home.xg,
        matchup,
        side: 'home',
        weight,
      },
      {
        features: surrogateFeatures(awayRatings, homeRatings, false, template),
        goals: result.score.away,
        engineXg: result.stats.away.xg,
        matchup,
        side: 'away',
        weight,
      },
    );
  }
  if ((matchup + 1) % 200 === 0)
    console.log(`simulated ${matchup + 1}/${matchups.length} matchup batches`);
}

const heldOutMatchups = new Set(matchups.map((_, i) => i).filter((i) => i % 5 === 0));
const training = observations.filter((row) => !heldOutMatchups.has(row.matchup));
const heldOut = observations.filter((row) => heldOutMatchups.has(row.matchup));
const fitted: SurrogateParameters = {
  ...template,
  coefficients: fitPoisson(training),
  trainingMatches: training.length / 2,
};
writeFileSync(OUT, `${JSON.stringify(fitted, null, 2)}\n`);

const groups = new Map<string, { goals: number; xg: number; n: number; prediction: number }>();
for (const row of heldOut) {
  const key = `${row.matchup}-${row.side}`;
  const prediction = Math.exp(
    row.features.reduce((sum, x, j) => sum + x * fitted.coefficients[j]!, 0),
  );
  const group = groups.get(key) ?? { goals: 0, xg: 0, n: 0, prediction };
  group.goals += row.goals;
  group.xg += row.engineXg;
  group.n++;
  groups.set(key, group);
}
const grouped = [...groups.values()];
const rmse = (values: number[]): number =>
  Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
const mae = (values: number[]): number =>
  values.reduce((sum, value) => sum + Math.abs(value), 0) / values.length;
const goalErrors = grouped.map((g) => g.prediction - g.goals / g.n);
const xgErrors = grouped.map((g) => g.prediction - g.xg / g.n);

const factorial = (n: number): number => (n < 2 ? 1 : n * factorial(n - 1));
const poisson = (goals: number, lambda: number): number =>
  (Math.exp(-lambda) * lambda ** goals) / factorial(goals);
let actualW = 0,
  actualD = 0,
  predictedW = 0,
  predictedD = 0;
const actualGoals = new Array<number>(6).fill(0);
const predictedGoals = new Array<number>(6).fill(0);
for (const matchup of heldOutMatchups) {
  const rows = heldOut.filter((row) => row.matchup === matchup);
  for (let repeat = 0; repeat < REPEATS; repeat++) {
    const home = rows[repeat * 2]!;
    const away = rows[repeat * 2 + 1]!;
    if (home.goals > away.goals) actualW++;
    else if (home.goals === away.goals) actualD++;
    actualGoals[Math.min(5, home.goals)]!++;
    actualGoals[Math.min(5, away.goals)]!++;
  }
  const homeRow = rows.find((row) => row.side === 'home')!;
  const awayRow = rows.find((row) => row.side === 'away')!;
  const lh = Math.exp(homeRow.features.reduce((sum, x, j) => sum + x * fitted.coefficients[j]!, 0));
  const la = Math.exp(awayRow.features.reduce((sum, x, j) => sum + x * fitted.coefficients[j]!, 0));
  for (let h = 0; h <= 12; h++)
    for (let a = 0; a <= 12; a++) {
      const probability = poisson(h, lh) * poisson(a, la) * REPEATS;
      if (h > a) predictedW += probability;
      else if (h === a) predictedD += probability;
    }
  let belowFive = 0;
  for (let goals = 0; goals < 5; goals++) {
    const expected = REPEATS * (poisson(goals, lh) + poisson(goals, la));
    predictedGoals[goals]! += expected;
    belowFive += expected;
  }
  predictedGoals[5]! += 2 * REPEATS - belowFive;
}
const heldOutMatches = heldOut.length / 2;
console.log(`\nFitted ${training.length / 2} matches; held out ${heldOutMatches}`);
console.log(
  `Expected goals from scores: MAE ${mae(goalErrors).toFixed(3)}, RMSE ${rmse(goalErrors).toFixed(3)}`,
);
console.log(
  `Against event-engine xG: MAE ${mae(xgErrors).toFixed(3)}, RMSE ${rmse(xgErrors).toFixed(3)}`,
);
console.log(
  `W/D/L engine ${(actualW / heldOutMatches).toFixed(3)}/${(actualD / heldOutMatches).toFixed(3)}/${((heldOutMatches - actualW - actualD) / heldOutMatches).toFixed(3)}`,
);
console.log(
  `W/D/L model  ${(predictedW / heldOutMatches).toFixed(3)}/${(predictedD / heldOutMatches).toFixed(3)}/${((heldOutMatches - predictedW - predictedD) / heldOutMatches).toFixed(3)}`,
);
console.log(
  `Goals 0/1/2/3/4/5+ engine: ${actualGoals.map((v) => (v / heldOut.length).toFixed(3)).join(' ')}`,
);
console.log(
  `Goals 0/1/2/3/4/5+ model:  ${predictedGoals.map((v) => (v / heldOut.length).toFixed(3)).join(' ')}`,
);
console.log(`Wrote ${OUT}`);
