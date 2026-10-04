import {
  rateAll,
  toRatingInputs,
  type FplBootstrapRaw,
  type FplElementSummaryRaw,
  type RatedPlayer,
} from './ratings';
import type { Player, PlayerRatings, Position, Tactic, Team } from './types';

export const BENCH_SIZE = 7;

/** [defenders, midfielders, forwards] options the picker chooses between. */
export const FORMATIONS: readonly (readonly [number, number, number])[] = [
  [4, 4, 2],
  [4, 3, 3],
  [3, 5, 2],
  [5, 3, 2],
  [4, 5, 1],
  [3, 4, 3],
];

/** How good a player is at the job of his position, 0-100. */
export function overall(position: Position, r: PlayerRatings): number {
  switch (position) {
    case 'GK':
      return r.goalkeeping;
    case 'DEF':
      return 0.4 * r.tackling + 0.3 * r.positioning + 0.15 * r.passing + 0.15 * r.pace;
    case 'MID':
      return (
        0.3 * r.passing +
        0.2 * r.dribbling +
        0.2 * r.tackling +
        0.15 * r.shooting +
        0.15 * r.positioning
      );
    case 'FWD':
      return 0.5 * r.shooting + 0.2 * r.dribbling + 0.15 * r.pace + 0.15 * r.passing;
  }
}

const byOverall = (a: Player, b: Player): number =>
  overall(b.position, b.ratings) - overall(a.position, a.ratings) || a.id.localeCompare(b.id);

/** Pick the best XI (best-scoring feasible formation) and a bench from a club's players. */
export function pickSquad(
  clubId: string,
  clubName: string,
  players: readonly Player[],
  tactic: Tactic = 'balanced',
): Team {
  const pool: Record<Position, Player[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of [...players].sort(byOverall)) pool[p.position].push(p);
  if (pool.GK.length === 0) throw new Error(`${clubName} has no goalkeeper`);

  let best: { score: number; shape: readonly [number, number, number] } | undefined;
  for (const shape of FORMATIONS) {
    const [d, m, f] = shape;
    if (pool.DEF.length < d || pool.MID.length < m || pool.FWD.length < f) continue;
    const sum = (pos: Position, n: number): number =>
      pool[pos].slice(0, n).reduce((a, p) => a + overall(pos, p.ratings), 0);
    const score = sum('GK', 1) + sum('DEF', d) + sum('MID', m) + sum('FWD', f);
    if (!best || score > best.score) best = { score, shape };
  }
  if (!best) throw new Error(`${clubName} cannot field any supported formation`);

  const [d, m, f] = best.shape;
  const xi = [
    ...pool.GK.slice(0, 1),
    ...pool.DEF.slice(0, d),
    ...pool.MID.slice(0, m),
    ...pool.FWD.slice(0, f),
  ];
  const used = new Set(xi.map((p) => p.id));
  const rest = (pos: Position): Player[] => pool[pos].filter((p) => !used.has(p.id));

  // Bench: a keeper, then cover for each outfield line, then the best of whoever is left.
  const bench: Player[] = [];
  const take = (p: Player | undefined): void => {
    if (p && bench.length < BENCH_SIZE && !used.has(p.id)) {
      used.add(p.id);
      bench.push(p);
    }
  };
  take(rest('GK')[0]);
  for (const pos of ['DEF', 'DEF', 'MID', 'MID', 'FWD'] as const) take(rest(pos)[0]);
  for (const p of players.filter((x) => !used.has(x.id) && x.position !== 'GK').sort(byOverall))
    take(p);

  return {
    id: clubId,
    name: clubName,
    formation: `${d}-${m}-${f}`,
    tactic,
    players: xi,
    bench,
  };
}

export interface Club {
  team: Team;
  /** Mean overall of the starting XI, a rough strength figure for reports. */
  xiStrength: number;
}

/** Rate every FPL player and build one squad per club (players who left the league are ignored). */
export function buildClubs(
  bootstrap: FplBootstrapRaw,
  summaries: ReadonlyMap<number, FplElementSummaryRaw>,
): Club[] {
  const rated: RatedPlayer[] = rateAll(toRatingInputs(bootstrap, summaries));
  return bootstrap.teams.map((t) => {
    const squad = rated.filter((r) => r.input.clubId === t.id && r.input.status !== 'u');
    const team = pickSquad(
      t.short_name,
      t.name,
      squad.map((r) => r.player),
    );
    const xiStrength =
      team.players.reduce((a, p) => a + overall(p.position, p.ratings), 0) / team.players.length;
    return { team, xiStrength };
  });
}
