// Prints the team-level xG benchmark (attack / defence per 90) from the cached FPL data.
//   pnpm --filter @pl/scripts team-benchmark
import { loadFplCache } from './lib/fpl-cache';
import { buildTeamBenchmark, printTeamBenchmark } from './lib/team-benchmark';

const { bootstrap, summaries } = loadFplCache();
printTeamBenchmark(buildTeamBenchmark(bootstrap, summaries));
