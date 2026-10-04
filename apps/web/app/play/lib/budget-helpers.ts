import { pickSquad, predictSeason, type SeasonPrediction } from '@pl/engine';
import { buildOpponentTeams, computeReplacedClub } from './clubs';
import playerData from '../data/players.json';
import {
  MAX_PER_REAL_CLUB,
  POSITION_ORDER,
  POSITION_QUOTAS,
  cheapestLegalCompletion,
  createPredictionTeam,
  pickFormationXI,
  squadCost,
  type Formation,
  type MarketPlayer,
} from './squad';

// Test support: squad builders used to check that the budget balances the game. Deterministic.
export const market = playerData as MarketPlayer[];
export const FORMATION: Formation = '4-4-2';
const REPLACED_CLUB_ID = computeReplacedClub(market).id;

/** Legal under every squad rule except the budget, which is the argument. */
export const isLegal = (squad: readonly MarketPlayer[], budget: number): boolean => {
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

export const predict = (
  squad: readonly MarketPlayer[],
  seasons: number,
  formation?: Formation,
): SeasonPrediction =>
  predictSeason(
    // No formation: the engine's own picker chooses the XI, as it does for every club in a played
    // season (and in the prediction-honesty check).
    formation
      ? createPredictionTeam('user', 'User FC', squad, pickFormationXI(squad, formation), formation)
      : pickSquad('user', 'User FC', squad),
    {
      seasons,
      seed: 7,
      replacedClubId: REPLACED_CLUB_ID,
      opponents: buildOpponentTeams(market, REPLACED_CLUB_ID, squad),
    },
  );

/** Average finishing position: steadier than the most likely finish on a flat distribution. */
export const averageFinish = (prediction: SeasonPrediction): number =>
  prediction.positionDistribution.reduce((sum, row) => sum + row.position * row.probability, 0);

export const likelyFinish = (prediction: SeasonPrediction): number =>
  prediction.positionDistribution.reduce((best, row) =>
    row.probability > best.probability ? row : best,
  ).position;

/** Greedy upgrades by rating gained per unit spent, then a seeded random-swap hill climb. */
export function optimise(budget: number, seasons = 200, iterations = 500): MarketPlayer[] {
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
        ) {
          continue;
        }
        const score =
          (player.overall - current.overall) / Math.max(1, player.value - current.value);
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
  let points = predict(squad, seasons).meanPoints;
  for (let iteration = 0; iteration < iterations; iteration++) {
    const index = Math.floor(random() * squad.length);
    const out = squad[index]!;
    const pool = market.filter(
      (p) => p.position === out.position && p.status !== 'u' && !squad.includes(p),
    );
    const candidate = squad.map((p, i) =>
      i === index ? pool[Math.floor(random() * pool.length)]! : p,
    );
    if (!isLegal(candidate, budget)) continue;
    const candidatePoints = predict(candidate, seasons).meanPoints;
    if (candidatePoints > points) {
      squad = candidate;
      points = candidatePoints;
    }
  }
  // The prediction ignores the bench, so the climb may have sold bench players for nothing. Spend
  // what is left on the best rating gained per unit spent, as a person using the whole budget would.
  for (;;) {
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
        ) {
          continue;
        }
        const score =
          (player.overall - current.overall) / Math.max(1, player.value - current.value);
        if (!best || score > best.score) best = { index, player, score };
      }
    }
    if (!best) break;
    squad = squad.map((p, i) => (i === best!.index ? best!.player : p));
  }
  return squad;
}

/** Spending spread evenly by position: the best-rated player each slot can afford, round-robin. */
export function balancedBuild(budget: number): MarketPlayer[] {
  const chosen: MarketPlayer[] = [];
  const order: string[] = [];
  const left: Record<string, number> = { ...POSITION_QUOTAS };
  while (order.length < 18) {
    for (const position of POSITION_ORDER) {
      if (left[position]! > 0) {
        order.push(position);
        left[position]!--;
      }
    }
  }
  for (let slot = 0; slot < order.length; slot++) {
    const cap = (budget - squadCost(chosen)) / (order.length - slot);
    const candidates = market
      .filter(
        (p) =>
          p.position === order[slot] &&
          p.status !== 'u' &&
          !chosen.includes(p) &&
          p.value <= cap &&
          chosen.filter((x) => x.clubId === p.clubId).length < MAX_PER_REAL_CLUB,
      )
      .sort((a, b) => b.overall - a.overall || a.value - b.value);
    const pick = candidates.slice(0, 6).find((c) => {
      const completion = cheapestLegalCompletion([...chosen, c], market);
      return completion !== null && squadCost(chosen) + c.value + completion.cost <= budget;
    });
    if (!pick) throw new Error('Balanced build ran out of legal players');
    chosen.push(pick);
  }
  return chosen;
}
