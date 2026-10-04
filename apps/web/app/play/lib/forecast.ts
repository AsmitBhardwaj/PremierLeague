import { forecastUserSeasons, summariseForecast, type ForecastSummary } from '@pl/engine';
import { buildSetup, USER_CLUB_ID } from '../../season/lib/setup';
import type { Formation, MarketPlayer } from './squad';

/**
 * Full event-engine seasons of the user's 38 matches behind the preview's player stats. Twelve
 * keeps the batch near a second on a phone; more would tighten the averages but not the budget.
 */
export const FORECAST_SEASONS = 12;
export const FORECAST_SEED = 7;

/** The preview's player and card stats, with season dynamics on and the balanced tactic. */
export function runForecast(
  market: readonly MarketPlayer[],
  replacedId: string,
  clubName: string,
  squad: readonly MarketPlayer[],
  starterIds: readonly string[],
  formation: Formation,
): ForecastSummary {
  const setup = buildSetup(market, replacedId, clubName, squad, 1);
  return summariseForecast(
    forecastUserSeasons(
      { ...setup, userClubId: USER_CLUB_ID },
      {
        seasons: FORECAST_SEASONS,
        seed: FORECAST_SEED,
        lineup: { formation, starters: starterIds, tactic: 'balanced' },
      },
    ),
  );
}
