// Published pre-season forecast for the current season (scripts/data/benchmarks/preseason-forecast-2026-27.json).
// Check-only: used to see whether the engine broadly agrees with expert forecasts for the current
// squads. Nothing is tuned against it.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ForecastRow {
  position: number;
  club: string;
  expectedPoints: number;
}

const FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'data',
  'benchmarks',
  'preseason-forecast-2026-27.json',
);

/** The forecast's club names -> the names FPL's bootstrap-static uses. */
const FPL_NAME: Record<string, string> = {
  Tottenham: 'Spurs',
  Coventry: 'Coventry City',
  Ipswich: 'Ipswich Town',
  Hull: 'Hull City',
};
export const forecastFplName = (club: string): string => FPL_NAME[club] ?? club;

export function loadPreseasonForecast(): ForecastRow[] {
  const { table } = JSON.parse(readFileSync(FILE, 'utf8')) as { table: ForecastRow[] };
  const fail = (msg: string): never => {
    throw new Error(`preseason-forecast-2026-27.json is invalid: ${msg}`);
  };
  if (table.length !== 20) fail(`${table.length} clubs, expected 20`);
  if (new Set(table.map((r) => r.club)).size !== 20) fail('duplicate club');
  table.forEach((r, i) => {
    if (r.position !== i + 1) fail(`${r.club} is not at position ${i + 1}`);
    if (i > 0 && r.expectedPoints > table[i - 1]!.expectedPoints) fail('points not descending');
  });
  return table;
}
