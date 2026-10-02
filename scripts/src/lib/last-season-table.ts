// Real final 2025/26 Premier League table (scripts/data/benchmarks/last-season-table.json): an
// outcome-based benchmark that does not share any inputs with the FPL stats the ratings are built from.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface TableRow {
  club: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

const FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'data',
  'benchmarks',
  'last-season-table.json',
);

/** The table's club names -> the names FPL's bootstrap-static uses. */
const FPL_NAME: Record<string, string> = {
  'Manchester City': 'Man City',
  'Manchester United': 'Man Utd',
  'Brighton & Hove Albion': 'Brighton',
  'Newcastle United': 'Newcastle',
  'Leeds United': 'Leeds',
  'Nottingham Forest': "Nott'm Forest",
  'Tottenham Hotspur': 'Spurs',
};
export const fplNameOf = (club: string): string => FPL_NAME[club] ?? club;

export function validateTable(rows: readonly TableRow[]): void {
  const fail = (msg: string): never => {
    throw new Error(`last-season-table.json is invalid: ${msg}`);
  };
  if (rows.length !== 20) fail(`${rows.length} clubs, expected 20`);
  if (new Set(rows.map((r) => r.club)).size !== 20) fail('duplicate club');
  for (const r of rows) {
    if (r.played !== 38) fail(`${r.club} played ${r.played}`);
    if (r.won + r.drawn + r.lost !== r.played) fail(`${r.club} W+D+L != played`);
    if (r.points !== 3 * r.won + r.drawn) fail(`${r.club} points != 3W + D`);
  }
  const sum = (f: (r: TableRow) => number): number => rows.reduce((a, r) => a + f(r), 0);
  if (sum((r) => r.won) !== sum((r) => r.lost)) fail('total wins != total losses');
  if (sum((r) => r.goalsFor) !== sum((r) => r.goalsAgainst)) fail('goals for != goals against');
}

export function loadLastSeasonTable(): TableRow[] {
  const file = JSON.parse(readFileSync(FILE, 'utf8')) as { table: TableRow[] };
  validateTable(file.table);
  return file.table;
}
