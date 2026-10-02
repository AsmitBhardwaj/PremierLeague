import { describe, expect, it } from 'vitest';
import {
  buildClubs,
  RATING_MAP,
  rateAll,
  simulateMatch,
  toRatingInputs,
  type FplBootstrapRaw,
  type FplElementRaw,
  type FplElementSummaryRaw,
  type FplSeasonRaw,
} from './index';

const season = (
  minutes: number,
  per90: { xg?: number; goals?: number; xa?: number; ast?: number },
): FplSeasonRaw => ({
  minutes,
  goals_scored: Math.round(((per90.goals ?? 0.2) * minutes) / 90),
  assists: Math.round(((per90.ast ?? 0.1) * minutes) / 90),
  expected_goals: (((per90.xg ?? 0.2) * minutes) / 90).toFixed(2),
  expected_assists: (((per90.xa ?? 0.1) * minutes) / 90).toFixed(2),
  creativity: String((minutes / 90) * 20),
  threat: String((minutes / 90) * 30),
  ict_index: String((minutes / 90) * 8),
  tackles: Math.round(minutes / 90),
  clearances_blocks_interceptions: Math.round(minutes / 45),
  recoveries: Math.round((minutes / 90) * 5),
  defensive_contribution: 0,
  saves: Math.round((minutes / 90) * 3),
  goals_conceded: Math.round(minutes / 90),
  expected_goals_conceded: String(minutes / 90),
});

let nextId = 1;
const element = (
  team: number,
  type: number,
  stats: FplSeasonRaw,
  extra: Partial<FplElementRaw> = {},
): FplElementRaw => ({
  id: nextId++,
  web_name: `P${nextId}`,
  team,
  element_type: type,
  status: 'a',
  ...stats,
  ...extra,
});

/** 20 clubs x (2 GK, 6 DEF, 7 MID, 4 FWD), all average, plus two special forwards. */
function fixture(): {
  bootstrap: FplBootstrapRaw;
  summaries: Map<number, FplElementSummaryRaw>;
  hot: number;
  hotRetired: number;
} {
  nextId = 1;
  const elements: FplElementRaw[] = [];
  const summaries = new Map<number, FplElementSummaryRaw>();
  const teams = Array.from({ length: 20 }, (_, i) => ({
    id: i + 1,
    name: `Club ${i + 1}`,
    short_name: `C${i + 1}`,
  }));
  for (const t of teams) {
    for (const [type, count] of [
      [1, 2],
      [2, 6],
      [3, 7],
      [4, 4],
    ] as const) {
      for (let k = 0; k < count; k++) {
        elements.push(
          element(t.id, type, season(2400, { xg: 0.2 + k * 0.01, goals: 0.2 + k * 0.01 })),
        );
      }
    }
  }
  // 200 minutes of absurd output: must not become elite.
  const hot = element(1, 4, season(200, { xg: 1.5, goals: 2, xa: 0.8, ast: 1 }));
  elements.push(hot);
  // Little current-season time but a strong history: history_past should carry him.
  const hotRetired = element(2, 4, season(90, { xg: 0.1, goals: 0 }));
  elements.push(hotRetired);
  summaries.set(hotRetired.id, {
    history_past: [season(2800, { xg: 0.8, goals: 0.9 }), season(2900, { xg: 0.8, goals: 0.9 })],
  });
  return { bootstrap: { teams, elements }, summaries, hot: hot.id, hotRetired: hotRetired.id };
}

describe('FPL rating mapping', () => {
  it('shrinks low-minute players towards the positional average', () => {
    const { bootstrap, summaries, hot } = fixture();
    const rated = rateAll(toRatingInputs(bootstrap, summaries));
    const others = rated.filter((r) => r.input.position === 'FWD' && r.input.id !== hot);
    const average = others.reduce((a, r) => a + r.player.ratings.shooting, 0) / others.length;
    const flash = rated.find((r) => r.input.id === hot)!;
    expect(flash.player.ratings.shooting).toBeGreaterThan(average);
    // Elite would be ~1.8 sd above average; 200 minutes of evidence must stay well short of it.
    expect(flash.player.ratings.shooting).toBeLessThan(average + 0.8 * RATING_MAP.spread.shooting);
  });

  it('falls back on history_past when the current season has few minutes', () => {
    const { bootstrap, summaries, hotRetired } = fixture();
    const withHistory = rateAll(toRatingInputs(bootstrap, summaries)).find(
      (r) => r.input.id === hotRetired,
    )!;
    const without = rateAll(toRatingInputs(bootstrap, new Map())).find(
      (r) => r.input.id === hotRetired,
    )!;
    expect(withHistory.player.ratings.shooting).toBeGreaterThan(
      without.player.ratings.shooting + 3,
    );
  });

  it('keeps every rating within 1-99', () => {
    const { bootstrap, summaries } = fixture();
    for (const r of rateAll(toRatingInputs(bootstrap, summaries))) {
      for (const v of Object.values(r.player.ratings)) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(99);
      }
    }
  });
});

describe('squad building', () => {
  it('builds a valid XI plus bench for every club, ignoring departed players', () => {
    const { bootstrap, summaries } = fixture();
    bootstrap.elements[5]!.status = 'u';
    const clubs = buildClubs(bootstrap, summaries);
    expect(clubs).toHaveLength(20);
    for (const { team } of clubs) {
      expect(team.players).toHaveLength(11);
      expect(team.players.filter((p) => p.position === 'GK')).toHaveLength(1);
      expect(team.bench!.length).toBe(7);
      expect(team.bench!.some((p) => p.position === 'GK')).toBe(true);
      expect(new Set([...team.players, ...team.bench!].map((p) => p.id)).size).toBe(18);
    }
    const a = clubs[0]!.team;
    expect(
      [...a.players, ...a.bench!].some((p) => p.id === `fpl-${bootstrap.elements[5]!.id}`),
    ).toBe(false);
    expect(() => simulateMatch({ home: a, away: clubs[1]!.team, seed: 1 })).not.toThrow();
  });
});
