import { buildClubs, predictSeason } from '@pl/engine';
import { loadFplCache } from './lib/fpl-cache';

const { bootstrap, summaries } = loadFplCache();
const squad = buildClubs(bootstrap, summaries).find((club) => club.team.id === 'IPS')!.team;
// Warm module/data caches before measuring the public call.
predictSeason(squad, { seasons: 10, seed: 1 });
const started = performance.now();
const prediction = predictSeason(squad, { seasons: 10_000, seed: 1 });
const elapsed = performance.now() - started;
console.log(
  `predictSeason: ${prediction.seasons} seasons in ${elapsed.toFixed(1)} ms; mean ${prediction.meanPoints.toFixed(1)} points`,
);
