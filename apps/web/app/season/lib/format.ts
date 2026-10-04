import type { AwardLine, MatchRecord, SeasonPrediction } from '@pl/engine';
import { about, pointsFrom } from '../../play/lib/preview';
import type { TableEntry } from './protocol';
import { USER_CLUB_ID } from './setup';

export const percent = (value: number): string => `${Math.round(value * 100)}%`;

export const ordinal = (n: number): string => {
  const v = n % 100;
  const suffix = ['th', 'st', 'nd', 'rd'][(v - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][v] ?? 'th';
  return `${n}${suffix}`;
};

/** Position change since the previous matchday: positive when the club moved up. */
export const movement = (row: TableEntry, position: number): number =>
  row.previousPosition - position;

export const userPosition = (table: readonly TableEntry[]): number =>
  table.findIndex((row) => row.clubId === USER_CLUB_ID) + 1;

/** W, D or L from the user's point of view. */
export function resultLetter(record: MatchRecord): 'W' | 'D' | 'L' {
  const home = record.home === USER_CLUB_ID;
  const scored = home ? record.homeGoals : record.awayGoals;
  const conceded = home ? record.awayGoals : record.homeGoals;
  return scored > conceded ? 'W' : scored === conceded ? 'D' : 'L';
}

export const FORM_LABEL = (form: number): string =>
  Math.abs(form) < 0.05 ? 'Neutral' : `${form > 0 ? '+' : '−'}${Math.abs(form).toFixed(1)}`;

/** The pre-season prediction's most likely finishing position. */
export const predictedPosition = (prediction: {
  positionDistribution: { position: number; probability: number }[];
}): number =>
  prediction.positionDistribution.reduce((best, row) =>
    row.probability > best.probability ? row : best,
  ).position;

/** "Predicted 11th, finished 7th: +4 places". */
export function placesSummary(predicted: number, finished: number): string {
  const gained = predicted - finished;
  const change =
    gained === 0
      ? 'exactly as predicted'
      : `${gained > 0 ? '+' : '−'}${Math.abs(gained)} ${Math.abs(gained) === 1 ? 'place' : 'places'}`;
  return `Predicted ${ordinal(predicted)}, finished ${ordinal(finished)}: ${change}`;
}

/** Clean sheets the user's club kept in these matches. */
export function cleanSheets(results: readonly MatchRecord[]): number {
  return results.filter((r) => (r.home === USER_CLUB_ID ? r.awayGoals : r.homeGoals) === 0).length;
}

/**
 * The season against the preview, in the preview's words ("Predicted ~54 goals, scored 61").
 * Empty for a save made before the preview carried team stats.
 */
export function previewComparison(
  prediction: SeasonPrediction,
  actual: { points: number; goalsFor: number; goalsAgainst: number; cleanSheets: number },
  topScorer: AwardLine | null,
): string[] {
  const stats = prediction.teamStats;
  if (!stats) return [];
  const lines = [
    `Predicted ${about(pointsFrom(stats))} points, finished on ${actual.points}`,
    `Predicted ${about(stats.goalsFor)} goals, scored ${actual.goalsFor}`,
    `Predicted ${about(stats.goalsAgainst)} goals against, conceded ${actual.goalsAgainst}`,
    `Predicted ${about(stats.cleanSheets)} clean sheets, kept ${actual.cleanSheets}`,
  ];
  const tipped = prediction.forecast?.topScorer;
  if (tipped && topScorer) {
    lines.push(
      `Predicted top scorer ${tipped.name} ~${Math.round(tipped.goals)} goals; your top scorer ${topScorer.name} scored ${topScorer.goals}`,
    );
  }
  return lines;
}
