import type { Player, Position, Team } from '@pl/engine';

/** Budget in tenths of £m (our own valuations): £275.0m. */
export const SQUAD_BUDGET = 2750;

/** Tenths of £m as a display string: whole millions stay whole, e.g. £175m, £12.5m, £0.9m. */
export const formatMoney = (units: number): string =>
  `£${units % 10 === 0 ? String(units / 10) : (units / 10).toFixed(1)}m`;
export const SQUAD_SIZE = 18;
export const MAX_PER_REAL_CLUB = 3;
export const POSITION_QUOTAS: Record<Position, number> = {
  GK: 2,
  DEF: 6,
  MID: 6,
  FWD: 4,
};
export const POSITION_ORDER: Position[] = ['GK', 'DEF', 'MID', 'FWD'];
export const FORMATIONS = {
  '4-4-2': { DEF: 4, MID: 4, FWD: 2 },
  '4-3-3': { DEF: 4, MID: 3, FWD: 3 },
  '3-5-2': { DEF: 3, MID: 5, FWD: 2 },
  '5-3-2': { DEF: 5, MID: 3, FWD: 2 },
  '4-5-1': { DEF: 4, MID: 5, FWD: 1 },
  '3-4-3': { DEF: 3, MID: 4, FWD: 3 },
} as const;
export type Formation = keyof typeof FORMATIONS;

export interface MarketPlayer extends Player {
  clubId: string;
  clubName: string;
  clubShortName: string;
  /** Our market value in tenths of £m (not an official or third-party figure). */
  value: number;
  status: string;
  overall: number;
}

export interface CompletionResult {
  cost: number;
  playerIds: string[];
}

export interface SelectionAssessment {
  allowed: boolean;
  message?: string;
  minimumFinalCost?: number;
}

const countBy = (players: readonly MarketPlayer[], value: (player: MarketPlayer) => string) => {
  const counts = new Map<string, number>();
  for (const player of players) counts.set(value(player), (counts.get(value(player)) ?? 0) + 1);
  return counts;
};

export const squadCost = (players: readonly MarketPlayer[]): number =>
  players.reduce((sum, player) => sum + player.value, 0);

export const positionCounts = (players: readonly MarketPlayer[]): Record<Position, number> => {
  const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const player of players) counts[player.position]++;
  return counts;
};

export function validateSquad(players: readonly MarketPlayer[]): string[] {
  const errors: string[] = [];
  const unique = new Set(players.map((player) => player.id));
  if (unique.size !== players.length) errors.push('A player can only be selected once.');
  if (players.length !== SQUAD_SIZE) errors.push(`Select exactly ${SQUAD_SIZE} players.`);
  if (squadCost(players) > SQUAD_BUDGET)
    errors.push(`The squad is over the ${formatMoney(SQUAD_BUDGET)} budget.`);
  const positions = positionCounts(players);
  for (const position of POSITION_ORDER) {
    if (positions[position] !== POSITION_QUOTAS[position]) {
      errors.push(`Select exactly ${POSITION_QUOTAS[position]} ${position} players.`);
    }
  }
  for (const [, count] of countBy(players, (player) => player.clubId)) {
    if (count > MAX_PER_REAL_CLUB) {
      errors.push(`Select no more than ${MAX_PER_REAL_CLUB} players from any real club.`);
    }
  }
  if (players.some((player) => player.status === 'u')) {
    errors.push('Unavailable players cannot be selected.');
  }
  return [...new Set(errors)];
}

type StateValue = CompletionResult;

const stateKey = (counts: readonly number[]): string => counts.join(',');

/** Exact minimum-cost completion under position quotas and the three-per-club cap. */
export function cheapestLegalCompletion(
  selected: readonly MarketPlayer[],
  market: readonly MarketPlayer[],
): CompletionResult | null {
  const selectedIds = new Set(selected.map((player) => player.id));
  if (selectedIds.size !== selected.length) return null;
  const positions = positionCounts(selected);
  const required = POSITION_ORDER.map(
    (position) => POSITION_QUOTAS[position] - positions[position],
  );
  if (required.some((count) => count < 0)) return null;

  const clubCounts = countBy(selected, (player) => player.clubId);
  if ([...clubCounts.values()].some((count) => count > MAX_PER_REAL_CLUB)) return null;
  const byClub = new Map<string, MarketPlayer[]>();
  for (const player of market) {
    if (player.status === 'u' || selectedIds.has(player.id)) continue;
    const group = byClub.get(player.clubId) ?? [];
    group.push(player);
    byClub.set(player.clubId, group);
  }

  let states = new Map<string, StateValue>([['0,0,0,0', { cost: 0, playerIds: [] }]]);
  for (const [clubId, clubPlayers] of byClub) {
    const capacity = MAX_PER_REAL_CLUB - (clubCounts.get(clubId) ?? 0);
    if (capacity <= 0) continue;
    const pools = POSITION_ORDER.map((position) =>
      clubPlayers
        .filter((player) => player.position === position)
        .sort((a, b) => a.value - b.value || a.id.localeCompare(b.id)),
    );
    const options: { counts: number[]; cost: number; playerIds: string[] }[] = [];
    for (let gk = 0; gk <= Math.min(capacity, required[0]!, pools[0]!.length); gk++) {
      for (let def = 0; def <= Math.min(capacity - gk, required[1]!, pools[1]!.length); def++) {
        for (
          let mid = 0;
          mid <= Math.min(capacity - gk - def, required[2]!, pools[2]!.length);
          mid++
        ) {
          for (
            let fwd = 0;
            fwd <= Math.min(capacity - gk - def - mid, required[3]!, pools[3]!.length);
            fwd++
          ) {
            const counts = [gk, def, mid, fwd];
            const chosen = counts.flatMap((count, index) => pools[index]!.slice(0, count));
            options.push({
              counts,
              cost: chosen.reduce((sum, player) => sum + player.value, 0),
              playerIds: chosen.map((player) => player.id),
            });
          }
        }
      }
    }
    const next = new Map<string, StateValue>();
    for (const [key, state] of states) {
      const current = key.split(',').map(Number);
      for (const option of options) {
        const counts = current.map((count, index) => count + option.counts[index]!);
        if (counts.some((count, index) => count > required[index]!)) continue;
        const nextKey = stateKey(counts);
        const cost = state.cost + option.cost;
        const existing = next.get(nextKey);
        if (!existing || cost < existing.cost) {
          next.set(nextKey, { cost, playerIds: [...state.playerIds, ...option.playerIds] });
        }
      }
    }
    states = next;
  }
  return states.get(stateKey(required)) ?? null;
}

export function assessSelection(
  player: MarketPlayer,
  selected: readonly MarketPlayer[],
  market: readonly MarketPlayer[],
): SelectionAssessment {
  if (selected.some((item) => item.id === player.id)) {
    return { allowed: false, message: `${player.name} is already in your squad.` };
  }
  if (player.status === 'u') {
    return { allowed: false, message: `${player.name} is unavailable for selection.` };
  }
  if (positionCounts(selected)[player.position] >= POSITION_QUOTAS[player.position]) {
    return { allowed: false, message: `Your ${player.position} quota is already full.` };
  }
  if (selected.filter((item) => item.clubId === player.clubId).length >= MAX_PER_REAL_CLUB) {
    return {
      allowed: false,
      message: `You already have ${MAX_PER_REAL_CLUB} players from ${player.clubName}.`,
    };
  }
  const next = [...selected, player];
  const currentCost = squadCost(next);
  if (currentCost > SQUAD_BUDGET) {
    return {
      allowed: false,
      message: `${player.name} would take the squad over ${formatMoney(SQUAD_BUDGET)}.`,
    };
  }
  const completion = cheapestLegalCompletion(next, market);
  if (!completion) {
    return {
      allowed: false,
      message: `${player.name} leaves no legal way to complete every position within the club limit.`,
    };
  }
  const minimumFinalCost = currentCost + completion.cost;
  if (minimumFinalCost > SQUAD_BUDGET) {
    return {
      allowed: false,
      message: `${player.name} would leave too little budget. The cheapest legal completion would cost ${formatMoney(
        minimumFinalCost,
      )} in total.`,
      minimumFinalCost,
    };
  }
  return { allowed: true, minimumFinalCost };
}

export function validateFormation(
  squad: readonly MarketPlayer[],
  starterIds: readonly string[],
  formation: Formation,
): string[] {
  const errors: string[] = [];
  const starters = squad.filter((player) => starterIds.includes(player.id));
  if (new Set(starterIds).size !== starterIds.length)
    errors.push('A starter can only appear once.');
  if (starters.length !== 11 || starterIds.length !== 11)
    errors.push('Select exactly 11 starters.');
  const counts = positionCounts(starters);
  if (counts.GK !== 1) errors.push('The starting XI must contain exactly one goalkeeper.');
  const shape = FORMATIONS[formation];
  for (const position of ['DEF', 'MID', 'FWD'] as const) {
    if (counts[position] !== shape[position]) {
      errors.push(`${formation} requires ${shape[position]} ${position} starters.`);
    }
  }
  return errors;
}

export function validateLineup(
  squad: readonly MarketPlayer[],
  starterIds: readonly string[],
  formation: Formation,
): string[] {
  const errors = [...validateSquad(squad), ...validateFormation(squad, starterIds, formation)];
  const starterSet = new Set(starterIds);
  const bench = squad.filter((player) => !starterSet.has(player.id));
  if (bench.length !== 7) errors.push('The substitutes bench must contain exactly seven players.');
  if (starterIds.some((id) => !squad.some((player) => player.id === id))) {
    errors.push('Every starter must belong to the selected squad.');
  }
  return [...new Set(errors)];
}

export function pickFormationXI(squad: readonly MarketPlayer[], formation: Formation): string[] {
  const shape = FORMATIONS[formation];
  const take = (position: Position, count: number) =>
    squad
      .filter((player) => player.position === position)
      .sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id))
      .slice(0, count)
      .map((player) => player.id);
  return [
    ...take('GK', 1),
    ...take('DEF', shape.DEF),
    ...take('MID', shape.MID),
    ...take('FWD', shape.FWD),
  ];
}

export function createPredictionTeam(
  clubId: string,
  clubName: string,
  squad: readonly MarketPlayer[],
  starterIds: readonly string[],
  formation: Formation,
): Team {
  const starters = starterIds.map((id) => squad.find((player) => player.id === id)!);
  const starterSet = new Set(starterIds);
  return {
    id: clubId,
    name: clubName,
    formation,
    tactic: 'balanced',
    players: starters,
    bench: squad.filter((player) => !starterSet.has(player.id)),
  };
}
