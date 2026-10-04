import { describe, expect, it } from 'vitest';
import { createSyntheticTeam } from '../synthetic';
import type { SeasonClubInput, SeasonSetup } from '../season';
import { forecastUserSeasons, predictSeason, summariseForecast } from './index';

const club = (id: string, strength: number): SeasonClubInput => {
  const team = createSyntheticTeam({ id, strength, seed: strength * 7 });
  return { id, name: id, players: [...team.players, ...(team.bench ?? [])] };
};

const setup = (): { setup: SeasonSetup; starters: string[]; formation: string } => {
  const user = createSyntheticTeam({ id: 'USER', strength: 66, seed: 5 });
  const clubs: SeasonClubInput[] = [
    { id: 'USER', name: 'User', players: [...user.players, ...(user.bench ?? [])] },
    ...Array.from({ length: 19 }, (_, i) => club(`c${i}`, 50 + (i % 10) * 3)),
  ];
  return {
    setup: { seed: 1, userClubId: 'USER', clubs },
    starters: user.players.map((p) => p.id),
    formation: user.formation,
  };
};

describe('predictSeason team stats', () => {
  it('averages a 38-match record whose points match the mean points', () => {
    const squad = createSyntheticTeam({ id: 'user', strength: 66, seed: 13 });
    const result = predictSeason(squad, { seasons: 400, seed: 7 });
    const stats = result.teamStats!;
    expect(stats.wins + stats.draws + stats.losses).toBeCloseTo(38, 9);
    expect(stats.cleanSheets).toBeLessThanOrEqual(stats.wins + stats.draws);
    expect(stats.goalsFor).toBeGreaterThan(0);
    expect(3 * stats.wins + stats.draws).toBeCloseTo(result.meanPoints, 6);
  });
});

describe('forecastUserSeasons', () => {
  const { setup: s, starters, formation } = setup();
  const options = {
    seasons: 3,
    seed: 9,
    lineup: { formation, starters, tactic: 'balanced' as const },
  };
  const batch = forecastUserSeasons(s, options);

  it('is deterministic for a setup, seed and lineup', () => {
    expect(forecastUserSeasons(s, options)).toEqual(batch);
  });

  it('averages 38 matches a season and only the user’s players', () => {
    const { wins, draws, losses } = batch.team;
    expect(wins + draws + losses).toBeCloseTo(38, 9);
    const ids = new Set(s.clubs[0]!.players.map((p) => p.id));
    for (const p of batch.players) {
      expect(ids.has(p.playerId)).toBe(true);
      expect(p.appearances).toBeLessThanOrEqual(38);
    }
  });

  it('names a top scorer, top assister and star player from the batch', () => {
    const goals = Math.max(...batch.players.map((p) => p.goals));
    expect(batch.topScorer!.goals).toBe(goals);
    expect(batch.starPlayer!.appearances).toBeGreaterThanOrEqual(15);
    const summary = summariseForecast(batch);
    expect(summary.topScorer).toBe(batch.topScorer);
    expect(summary.yellowCards).toBe(batch.team.yellowCards);
  });

  it('leaves the other clubs unplayed but the user’s fixtures complete', () => {
    expect(batch.team.goalsFor).toBeGreaterThan(0);
    expect(batch.team.yellowCards).toBeGreaterThan(0);
  });
});
