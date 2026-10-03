import { predictSeason } from '@pl/engine';
import { describe, expect, it } from 'vitest';
import playerData from '../data/players.json';
import {
  MAX_PER_REAL_CLUB,
  POSITION_QUOTAS,
  cheapestLegalCompletion,
  createPredictionTeam,
  pickFormationXI,
  squadCost,
  type Formation,
  type MarketPlayer,
} from './squad';

// Money must buy strength: with the current prices, a better-funded optimiser reaches a better
// predicted season and actually spends what it is given. This guards against cheap, low-evidence
// players being elite in the simulation (which made every budget produce the same squad).
const market = playerData as MarketPlayer[];
const FORMATION: Formation = '4-4-2';
const SEASONS = 200;
const ITERATIONS = 500;

const isLegal = (squad: readonly MarketPlayer[], budget: number): boolean => {
  if (new Set(squad.map((p) => p.id)).size !== squad.length || squadCost(squad) > budget) {
    return false;
  }
  const byPosition: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  const byClub = new Map<string, number>();
  for (const p of squad) {
    byPosition[p.position]!++;
    byClub.set(p.clubId, (byClub.get(p.clubId) ?? 0) + 1);
  }
  return (
    Object.entries(POSITION_QUOTAS).every(([pos, quota]) => byPosition[pos] === quota) &&
    [...byClub.values()].every((count) => count <= MAX_PER_REAL_CLUB)
  );
};

const meanPoints = (squad: readonly MarketPlayer[]): number =>
  predictSeason(
    createPredictionTeam('user', 'User FC', squad, pickFormationXI(squad, FORMATION), FORMATION),
    { seasons: SEASONS, seed: 7 },
  ).meanPoints;

/** Greedy upgrades by rating gained per unit spent, then a seeded random-swap hill climb. */
function optimise(budget: number): MarketPlayer[] {
  const cheapest = cheapestLegalCompletion([], market);
  if (!cheapest) throw new Error('No legal squad');
  let squad = cheapest.playerIds.map((id) => market.find((p) => p.id === id)!);
  for (let step = 0; step < 150; step++) {
    let best: { index: number; player: MarketPlayer; score: number } | null = null;
    for (let index = 0; index < squad.length; index++) {
      const current = squad[index]!;
      for (const player of market) {
        if (player.position !== current.position || player.overall <= current.overall) continue;
        if (player.status === 'u' || squad.includes(player)) continue;
        if (
          !isLegal(
            squad.map((p, i) => (i === index ? player : p)),
            budget,
          )
        )
          continue;
        const score =
          (player.overall - current.overall) / Math.max(1, player.price - current.price);
        if (!best || score > best.score) best = { index, player, score };
      }
    }
    if (!best) break;
    squad = squad.map((p, i) => (i === best!.index ? best!.player : p));
  }

  let seed = 12345;
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  let points = meanPoints(squad);
  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    const index = Math.floor(random() * squad.length);
    const out = squad[index]!;
    const pool = market.filter(
      (p) => p.position === out.position && p.status !== 'u' && !squad.includes(p),
    );
    const candidate = squad.map((p, i) =>
      i === index ? pool[Math.floor(random() * pool.length)]! : p,
    );
    if (!isLegal(candidate, budget)) continue;
    const candidatePoints = meanPoints(candidate);
    if (candidatePoints > points) {
      squad = candidate;
      points = candidatePoints;
    }
  }
  return squad;
}

describe('money buys strength', () => {
  it('raises the best predicted points with the budget and spends at least 95% of it', () => {
    const results = [800, 900, 1000, 1100].map((budget) => {
      const squad = optimise(budget);
      return { budget, spent: squadCost(squad), points: meanPoints(squad) };
    });
    for (const { budget, spent } of results) {
      expect(spent).toBeGreaterThanOrEqual(0.95 * budget);
      expect(spent).toBeLessThanOrEqual(budget);
    }
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.points).toBeGreaterThan(results[i - 1]!.points);
    }
  }, 240_000);
});
