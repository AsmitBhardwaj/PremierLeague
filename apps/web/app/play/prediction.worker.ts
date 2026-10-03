/// <reference lib="webworker" />

import { predictSeason, type SeasonPrediction, type Team } from '@pl/engine';

interface PredictionRequest {
  team: Team;
  seed: number;
  replacedClubId: string;
}

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = ({ data }: MessageEvent<PredictionRequest>) => {
  try {
    const prediction: SeasonPrediction = predictSeason(data.team, {
      seasons: 10_000,
      seed: data.seed,
      replacedClubId: data.replacedClubId,
    });
    self.postMessage({ prediction });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Prediction failed.' });
  }
};

export {};
