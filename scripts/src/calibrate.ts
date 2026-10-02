// Simulates many matches and prints headline numbers to tune packages/engine/src/tuning.ts.
// Run with: pnpm --filter @pl/scripts calibrate
import { createRng, createSyntheticTeam, simulateMatch, type Tactic } from '@pl/engine';
import { DistributionStats } from './lib/distribution';

const MATCHES = 1000;
const STRONG_GAP = 6;
// Roughly the spread of the real clubs' starting XIs (see calibrate-season).
const STRENGTH_MIN = 58;
const STRENGTH_RANGE = 14;
const TACTICS: Tactic[] = [
  'balanced',
  'balanced',
  'balanced',
  'high_press',
  'counter',
  'defensive',
];

const rng = createRng(2026);
const pick = <T>(xs: T[]): T => xs[Math.floor(rng() * xs.length)] as T;

let goals = 0;
let homeWins = 0;
let draws = 0;
let awayWins = 0;
let strongGames = 0;
let strongWins = 0;
let strongDraws = 0;
let shots = 0;
let cards = 0;
let reds = 0;
let injuries = 0;
const dist = new DistributionStats();

const started = Date.now();
for (let i = 0; i < MATCHES; i++) {
  const hs = STRENGTH_MIN + rng() * STRENGTH_RANGE;
  const as = STRENGTH_MIN + rng() * STRENGTH_RANGE;
  const home = createSyntheticTeam({
    id: 'h',
    strength: hs,
    tactic: pick(TACTICS),
    seed: 2 * i + 1,
  });
  const away = createSyntheticTeam({
    id: 'a',
    strength: as,
    tactic: pick(TACTICS),
    seed: 2 * i + 2,
  });
  const r = simulateMatch({ home, away, seed: i + 1 });

  const total = r.score.home + r.score.away;
  goals += total;
  dist.add(r, 'h');
  if (r.score.home > r.score.away) homeWins++;
  else if (r.score.home === r.score.away) draws++;
  else awayWins++;
  shots += r.stats.home.shots + r.stats.away.shots;
  cards += r.stats.home.yellowCards + r.stats.away.yellowCards;
  reds += r.stats.home.redCards + r.stats.away.redCards;
  injuries += r.stats.home.injuries + r.stats.away.injuries;

  if (Math.abs(hs - as) >= STRONG_GAP) {
    strongGames++;
    const strongIsHome = hs > as;
    const diff = strongIsHome ? r.score.home - r.score.away : r.score.away - r.score.home;
    if (diff > 0) strongWins++;
    else if (diff === 0) strongDraws++;
  }
}

const pct = (n: number, d = MATCHES): string => `${((100 * n) / d).toFixed(1)}%`;
console.log(`Calibration over ${MATCHES} matches (${Date.now() - started} ms)`);
console.log('-----------------------------------------------');
console.log(`Goals per game     ${(goals / MATCHES).toFixed(2)}   (target ~2.8)`);
console.log(`Draws              ${pct(draws)}   (target ~25%)`);
console.log(`Home wins          ${pct(homeWins)}`);
console.log(`Away wins          ${pct(awayWins)}   (home should be a bit above away)`);
console.log(
  `Strong team wins   ${pct(strongWins, strongGames)}  draws ${pct(strongDraws, strongGames)}  (${strongGames} games with rating gap >= ${STRONG_GAP})`,
);
console.log(`Shots per game     ${(shots / MATCHES).toFixed(1)}`);
console.log(
  `Yellows per game   ${(cards / MATCHES).toFixed(2)}   reds ${(reds / MATCHES).toFixed(3)}   injuries ${(injuries / MATCHES).toFixed(2)}`,
);
dist.print('(match-level)', goals / MATCHES);

// Control: identical teams and tactics. Any scoreline-state effect here is a genuine snowball,
// unlike the table above where the stronger side is both more likely to lead and to score.
const control = new DistributionStats();
for (let i = 0; i < 2000; i++) {
  const home = createSyntheticTeam({ id: 'h', strength: 65, seed: 3 });
  const away = createSyntheticTeam({ id: 'a', strength: 65, seed: 4 });
  control.add(simulateMatch({ home, away, seed: 50_000 + i }), 'h');
}
control.print(
  '(control: 2000 matches, equal teams, balanced tactics)',
  control.goals / control.matches,
);
