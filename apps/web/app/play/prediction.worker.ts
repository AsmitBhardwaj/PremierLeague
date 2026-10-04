/// <reference lib="webworker" />

import { predictSeason, type ForecastSummary, type SeasonPrediction, type Team } from '@pl/engine';
import playerData from './data/players.json';
import { runForecast } from './lib/forecast';
import type { Formation, MarketPlayer } from './lib/squad';

interface PredictionRequest {
  team: Team;
  seed: number;
  replacedClubId: string;
  opponents: Team[];
  squadIds: string[];
  clubName: string;
}

/** The team forecast arrives first; the player stats follow once the event-engine batch is done. */
export type PredictionMessage =
  | { prediction: SeasonPrediction }
  | { forecast: ForecastSummary | null; ms: number }
  | { error: string };

declare const self: DedicatedWorkerGlobalScope;

const market = playerData as MarketPlayer[];

self.onmessage = ({ data }: MessageEvent<PredictionRequest>) => {
  try {
    const prediction: SeasonPrediction = predictSeason(data.team, {
      seasons: 10_000,
      seed: data.seed,
      replacedClubId: data.replacedClubId,
      opponents: data.opponents,
    });
    self.postMessage({ prediction } satisfies PredictionMessage);
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'Prediction failed.',
    } satisfies PredictionMessage);
    return;
  }
  try {
    const started = performance.now();
    const byId = new Map(market.map((p) => [p.id, p]));
    const squad = data.squadIds.map((id) => byId.get(id)!);
    const forecast = runForecast(
      market,
      data.replacedClubId,
      data.clubName,
      squad,
      data.team.players.map((p) => p.id),
      data.team.formation as Formation,
    );
    self.postMessage({ forecast, ms: performance.now() - started } satisfies PredictionMessage);
  } catch {
    // The team forecast already arrived; the player stats are an extra.
    self.postMessage({ forecast: null, ms: 0 } satisfies PredictionMessage);
  }
};

export {};
