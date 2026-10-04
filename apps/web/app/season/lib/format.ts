import type { MatchRecord } from '@pl/engine';
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
