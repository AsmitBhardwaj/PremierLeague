import type { SeasonPrediction } from '@pl/engine';

/** Fan-facing reading of a season prediction. Pure functions, no engine calls. */

export const ordinal = (position: number): string => {
  const mod100 = position % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${position}th`;
  return `${position}${['th', 'st', 'nd', 'rd'][position % 10] ?? 'th'}`;
};

export interface Finish {
  /** The most likely finishing position. */
  likely: number;
  /** Roughly the 10th percentile (the good end). */
  best: number;
  /** Roughly the 90th percentile (the bad end). */
  worst: number;
}

type Distribution = readonly { position: number; probability: number }[];

/** Most likely finish with the 10th–90th percentile range around it. */
export function finishRange(distribution: Distribution): Finish {
  const ordered = [...distribution].sort((a, b) => a.position - b.position);
  const likely = ordered.reduce((top, row) =>
    row.probability > top.probability ? row : top,
  ).position;
  let cumulative = 0;
  let best = ordered[0]!.position;
  let worst = ordered[ordered.length - 1]!.position;
  let foundBest = false;
  for (const row of ordered) {
    cumulative += row.probability;
    if (!foundBest && cumulative >= 0.1) {
      best = row.position;
      foundBest = true;
    }
    if (cumulative >= 0.9) {
      worst = row.position;
      break;
    }
  }
  return { likely, best: Math.min(best, likely), worst: Math.max(worst, likely) };
}

export type VerdictKey =
  'title' | 'champions-league' | 'europa-league' | 'mid-table' | 'survival' | 'relegation';

export interface Verdict {
  key: VerdictKey;
  label: string;
}

/**
 * The headline in words, from the most likely finish and the odds. First match wins:
 *  - Title contenders: title chance 15%+, or most likely finish top two
 *  - Champions League chase: most likely finish top four, or top-four chance 40%+
 *  - Europa League contenders: most likely finish 5th–7th
 *  - Relegation scrap: relegation chance 50%+, or most likely finish 18th or lower
 *  - Survival fight: relegation chance 20%+, or most likely finish 15th–17th
 *  - Comfortable mid-table: everything else
 */
export function verdictOf(
  prediction: Pick<
    SeasonPrediction,
    'positionDistribution' | 'titleProbability' | 'top4Probability' | 'relegationProbability'
  >,
): Verdict {
  const { likely } = finishRange(prediction.positionDistribution);
  if (prediction.titleProbability >= 0.15 || likely <= 2)
    return { key: 'title', label: 'Title contenders' };
  if (likely <= 4 || prediction.top4Probability >= 0.4)
    return { key: 'champions-league', label: 'Champions League chase' };
  if (likely <= 7) return { key: 'europa-league', label: 'Europa League contenders' };
  if (prediction.relegationProbability >= 0.5 || likely >= 18)
    return { key: 'relegation', label: 'Relegation scrap' };
  if (prediction.relegationProbability >= 0.2 || likely >= 15)
    return { key: 'survival', label: 'Survival fight' };
  return { key: 'mid-table', label: 'Comfortable mid-table' };
}

/** "1 in N" rounded the way people say it: exact below 10, to the nearest 5 below 50, then 1 figure. */
export function oneIn(probability: number): number {
  const n = 1 / probability;
  if (n < 10) return Math.max(2, Math.round(n));
  if (n < 50) return Math.round(n / 5) * 5;
  const magnitude = 10 ** Math.floor(Math.log10(n));
  return Math.round(n / magnitude) * magnitude;
}

/**
 * A chance in the words fans use. Thresholds:
 *  under 0.1%  very unlikely            0.1% to 2%  a long shot (1 in N)
 *  2% to 15%   unlikely (1 in N)        15% to 35%  a real chance (1 in N)
 *  35% to 65%  about even               65% to 90%  likely (N in 10)
 *  90%+        very likely
 */
export function oddsPhrase(probability: number): string {
  if (probability < 0.001) return 'very unlikely';
  if (probability < 0.02) return `a long shot (1 in ${oneIn(probability)})`;
  if (probability < 0.15) return `unlikely (1 in ${oneIn(probability)})`;
  if (probability < 0.35) return `a real chance (1 in ${oneIn(probability)})`;
  if (probability < 0.65) return 'about even';
  if (probability < 0.9) return `likely (${Math.round(probability * 10)} in 10)`;
  return 'very likely';
}

export interface OddsLine {
  label: string;
  phrase: string;
}

export function oddsLines(
  prediction: Pick<
    SeasonPrediction,
    'titleProbability' | 'top4Probability' | 'relegationProbability'
  >,
): OddsLine[] {
  return [
    { label: 'Title', phrase: oddsPhrase(prediction.titleProbability) },
    { label: 'Top four', phrase: oddsPhrase(prediction.top4Probability) },
    { label: 'Relegation', phrase: oddsPhrase(prediction.relegationProbability) },
  ];
}

export interface FixturePick {
  opponent: string;
  venue: 'home' | 'away';
}

export interface FixturePicks {
  toughestTrip: FixturePick;
  toughestHome: FixturePick;
  banker: FixturePick;
}

/** Toughest trip and toughest home match (fewest expected points), and the banker (most). */
export function fixturePicks(
  expected: SeasonPrediction['perOpponentExpectedPoints'],
): FixturePicks | null {
  if (expected.length === 0) return null;
  const lowest = (venue: 'home' | 'away'): FixturePick => {
    const row = expected.reduce((low, r) => (r[venue] < low[venue] ? r : low));
    return { opponent: row.opponentName, venue };
  };
  let banker: FixturePick & { points: number } = { opponent: '', venue: 'home', points: -1 };
  for (const row of expected) {
    for (const venue of ['home', 'away'] as const) {
      if (row[venue] > banker.points)
        banker = { opponent: row.opponentName, venue, points: row[venue] };
    }
  }
  return {
    toughestTrip: lowest('away'),
    toughestHome: lowest('home'),
    banker: { opponent: banker.opponent, venue: banker.venue },
  };
}

const POSITION_WORDS: Record<string, string> = {
  GK: 'keeper',
  DEF: 'defender',
  MID: 'midfielder',
  FWD: 'forward',
};

/** "+0.62 on the average forward": a rating set against his position's average. */
export function againstPosition(ratingVsPosition: number, position: string): string {
  const sign = ratingVsPosition >= 0 ? '+' : '−';
  return `${sign}${Math.abs(ratingVsPosition).toFixed(2)} on the average ${POSITION_WORDS[position] ?? 'player'}`;
}

/** Whole numbers with a tilde: "~54". */
export const about = (value: number): string => `~${Math.round(value)}`;

export function recordLine(stats: { wins: number; draws: number; losses: number }): string {
  const w = Math.round(stats.wins);
  const d = Math.round(stats.draws);
  return `${w}–${d}–${38 - w - d}`;
}

export const pointsFrom = (stats: { wins: number; draws: number }): number =>
  Math.round(3 * Math.round(stats.wins) + Math.round(stats.draws));

export const signed = (value: number): string => (value > 0 ? `+${value}` : `${value}`);

/** "Predicted ~54 goals, scored 61": the prediction next to what happened. */
export const predictedVersus = (predicted: number, actual: number, noun: string): string =>
  `Predicted ${about(predicted)} ${noun}, ${noun === 'goals' ? 'scored' : 'finished on'} ${actual}`;
