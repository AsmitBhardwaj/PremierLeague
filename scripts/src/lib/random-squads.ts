import { createRng, type PlayerRatings, type Position } from '@pl/engine';
import { isLegal } from '../../../apps/web/app/play/lib/budget-helpers';
import { cheapestLegalCompletion, type MarketPlayer } from '../../../apps/web/app/play/lib/squad';

/**
 * Seeded, legal user-style squads at a spread of budgets and shapes, for training and checking
 * the season surrogate on the kind of squads people actually build (stars-and-scrubs squads sit
 * far from the real clubs' strength range).
 */
export function randomLegalSquads(
  market: readonly MarketPlayer[],
  count: number,
  seed: number,
): MarketPlayer[][] {
  const rng = createRng(seed);
  const cheapest = cheapestLegalCompletion([], market);
  if (!cheapest) throw new Error('No legal squad');
  const base = cheapest.playerIds.map((id) => market.find((p) => p.id === id)!);
  const eligible = market.filter((p) => p.status !== 'u');
  const squads: MarketPlayer[][] = [];
  for (let k = 0; k < count; k++) {
    const budget = 1200 + Math.floor(rng() * 1550);
    const mode = k % 3; // 0: any swap, 1: upgrades only, 2: a few stars, rest cheap
    const stars = new Set([0, 1, 2].map(() => Math.floor(rng() * 18)));
    let squad = [...base];
    for (let step = 0; step < 400; step++) {
      const index = Math.floor(rng() * squad.length);
      if (mode === 2 && !stars.has(index)) continue;
      const current = squad[index]!;
      const pool = eligible.filter(
        (p) =>
          p.position === current.position &&
          p.id !== current.id &&
          (mode === 0 || p.overall > current.overall),
      );
      const candidate = pool[Math.floor(rng() * pool.length)];
      if (!candidate || squad.includes(candidate)) continue;
      const next = squad.map((p, i) => (i === index ? candidate : p));
      if (isLegal(next, budget)) squad = next;
    }
    squads.push(squad);
  }
  return squads;
}

/**
 * Greedy "sensible" builds: from the cheapest legal squad, repeatedly take the upgrade with the
 * best rating gain per unit spent, with seeded noise on each candidate's score so squads differ.
 * These cover the region where people's squads actually sit (balanced, rating-led spending).
 */
export function noisyGreedySquads(
  market: readonly MarketPlayer[],
  count: number,
  seed: number,
): MarketPlayer[][] {
  const rng = createRng(seed);
  const cheapest = cheapestLegalCompletion([], market);
  if (!cheapest) throw new Error('No legal squad');
  const base = cheapest.playerIds.map((id) => market.find((p) => p.id === id)!);
  const eligible = market.filter((p) => p.status !== 'u');
  const squads: MarketPlayer[][] = [];
  for (let k = 0; k < count; k++) {
    const budget = 1200 + Math.floor(rng() * 1550);
    const noise = 0.2 + rng() * 0.8;
    let squad = [...base];
    for (let step = 0; step < 150; step++) {
      let best: { index: number; player: MarketPlayer; score: number } | null = null;
      for (let index = 0; index < squad.length; index++) {
        const current = squad[index]!;
        for (const player of eligible) {
          if (player.position !== current.position || player.overall <= current.overall) continue;
          if (squad.includes(player)) continue;
          const score =
            ((player.overall - current.overall) / Math.max(1, player.value - current.value)) *
            (1 + noise * (rng() - 0.5));
          if (best && score <= best.score) continue;
          if (
            !isLegal(
              squad.map((p, i) => (i === index ? player : p)),
              budget,
            )
          )
            continue;
          best = { index, player, score };
        }
      }
      if (!best) break;
      squad = squad.map((p, i) => (i === best!.index ? best!.player : p));
    }
    squads.push(squad);
  }
  return squads;
}

const SKILLS: readonly (keyof PlayerRatings)[] = [
  'passing',
  'dribbling',
  'shooting',
  'tackling',
  'positioning',
  'pace',
];

/**
 * Legal squads whose positions are lopsided in different directions: each position group is pushed
 * towards one skill (defensive midfielders, attacking defenders, a keeper-led side, and so on)
 * rather than towards overall rating. Real and "sensible" squads vary little by role, so without
 * these the surrogate cannot tell a defensive midfield from a defence (see `defenderDefending`).
 */
export function roleSkewedSquads(
  market: readonly MarketPlayer[],
  count: number,
  seed: number,
): MarketPlayer[][] {
  const rng = createRng(seed);
  const cheapest = cheapestLegalCompletion([], market);
  if (!cheapest) throw new Error('No legal squad');
  const base = cheapest.playerIds.map((id) => market.find((p) => p.id === id)!);
  const eligible = market.filter((p) => p.status !== 'u');
  const positions: Position[] = ['GK', 'DEF', 'MID', 'FWD'];
  const squads: MarketPlayer[][] = [];
  for (let k = 0; k < count; k++) {
    const budget = 1400 + Math.floor(rng() * 1350);
    // Per position: the skill pair to push up, or a down-weight so some groups are pushed down.
    const focus = new Map<Position, { skills: (keyof PlayerRatings)[]; direction: 1 | -1 }>();
    for (const position of positions) {
      const first = SKILLS[Math.floor(rng() * SKILLS.length)]!;
      const second = SKILLS[Math.floor(rng() * SKILLS.length)]!;
      focus.set(position, { skills: [first, second], direction: rng() < 0.7 ? 1 : -1 });
    }
    const score = (p: MarketPlayer): number => {
      const f = focus.get(p.position)!;
      const skill =
        f.skills.reduce(
          (sum, key) => sum + (p.position === 'GK' ? p.ratings.goalkeeping : p.ratings[key]),
          0,
        ) / f.skills.length;
      return f.direction * skill;
    };
    let squad = [...base];
    for (let step = 0; step < 500; step++) {
      const index = Math.floor(rng() * squad.length);
      const current = squad[index]!;
      const pool = eligible.filter(
        (p) => p.position === current.position && p.id !== current.id && score(p) > score(current),
      );
      const candidate = pool[Math.floor(rng() * pool.length)];
      if (!candidate || squad.includes(candidate)) continue;
      const next = squad.map((p, i) => (i === index ? candidate : p));
      if (isLegal(next, budget)) squad = next;
    }
    squads.push(squad);
  }
  return squads;
}
