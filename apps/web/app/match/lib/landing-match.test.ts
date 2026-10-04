import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { simulateMatch } from '@pl/engine';
import { describe, expect, it } from 'vitest';
import landing from '../../data/landing-sample.json';
import { createPredictionTeam, type MarketPlayer } from '../../play/lib/squad';
import { createOpponentTeam } from './match';
import { market } from './fixtures';
import { MATCH_BUDGET_MS, buildSchedule, scoreAt } from './timeline';

const file = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'public', 'landing-match.json'), 'utf8'),
) as {
  seed: number;
  home: { id: string; name: string };
  away: { id: string; name: string };
  score: { home: number; away: number };
  events: Parameters<typeof scoreAt>[0];
};

describe('landing-page sample match', () => {
  it('is exactly what the engine produces for the stored seed, with no edits', () => {
    const squad = landing.club.squadPlayerIds.map(
      (id) => market.find((player) => player.id === id) as MarketPlayer,
    );
    const home = createPredictionTeam(
      landing.club.id,
      landing.club.name,
      squad,
      landing.club.starterIds,
      landing.club.formation as '4-3-3',
    );
    const away = createOpponentTeam(market, 'BHA');
    const result = simulateMatch({ home, away, seed: file.seed });
    expect(file.events).toEqual(result.events);
    expect(file.score).toEqual(result.score);
    expect(file.home.name).toBe(landing.club.name);
    expect(file.away.name).toBe('Brighton');
  });

  it('has at least two goals, a score matching its goal events, and loops within 30 seconds', () => {
    expect(file.score.home + file.score.away).toBeGreaterThanOrEqual(2);
    expect(scoreAt(file.events, file.home.id)).toEqual(file.score);
    expect(buildSchedule(file.events, MATCH_BUDGET_MS).totalMs).toBeLessThanOrEqual(
      MATCH_BUDGET_MS + 1e-6,
    );
  });
});
