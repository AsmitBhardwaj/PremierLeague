// Compare each real squad's surrogate prediction with a full event-engine season calibration.
// Usage: pnpm --filter @pl/scripts sanity-predict-season [event-engine-seasons]
import { buildClubs, predictSeason, simulateMatch } from '@pl/engine';
import { loadFplCache } from './lib/fpl-cache';

const CALIBRATION_SEASONS = Number(process.argv[2] ?? 50);
const PREDICTION_SEASONS = 10_000;
const { bootstrap, summaries } = loadFplCache();
const clubs = buildClubs(bootstrap, summaries);
const calibrationPoints = new Array<number>(clubs.length).fill(0);
let matchCount = 0;
const started = Date.now();

for (let season = 0; season < CALIBRATION_SEASONS; season++) {
  for (let home = 0; home < clubs.length; home++) {
    for (let away = 0; away < clubs.length; away++) {
      if (home === away) continue;
      const result = simulateMatch({
        home: clubs[home]!.team,
        away: clubs[away]!.team,
        seed: season * 1_000 + matchCount++ + 1,
      });
      if (result.score.home > result.score.away) calibrationPoints[home]! += 3;
      else if (result.score.home < result.score.away) calibrationPoints[away]! += 3;
      else {
        calibrationPoints[home]!++;
        calibrationPoints[away]!++;
      }
    }
  }
}

console.log(
  `Event engine: ${CALIBRATION_SEASONS} seasons (${matchCount} matches); predictor: ${PREDICTION_SEASONS} seasons, replacing default promoted club`,
);
console.log('Club                Calibration  Prediction   Diff');
const differences: number[] = [];
for (let index = 0; index < clubs.length; index++) {
  const club = clubs[index]!;
  const calibration = calibrationPoints[index]! / CALIBRATION_SEASONS;
  const prediction = predictSeason(club.team, {
    seasons: PREDICTION_SEASONS,
    seed: 1,
  }).meanPoints;
  const difference = prediction - calibration;
  const signedDifference = `${difference >= 0 ? '+' : ''}${difference.toFixed(1)}`;
  differences.push(difference);
  console.log(
    `${club.team.name.padEnd(19)} ${calibration.toFixed(1).padStart(11)} ${prediction.toFixed(1).padStart(11)} ${signedDifference.padStart(7)}`,
  );
}
const rmse = Math.sqrt(
  differences.reduce((sum, difference) => sum + difference * difference, 0) / differences.length,
);
console.log(`RMSE ${rmse.toFixed(2)} points; completed in ${Date.now() - started} ms`);
