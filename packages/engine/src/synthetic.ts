import { createRng } from './rng';
import type { Player, PlayerRatings, Position, Tactic, Team } from './types';

export interface SyntheticTeamOptions {
  id: string;
  name?: string;
  /** Average outfield rating, roughly 30-90. */
  strength: number;
  formation?: string;
  tactic?: Tactic;
  /** Seeds the per-player rating noise so the same options give the same team. */
  seed?: number;
}

const PROFILE: Record<Position, PlayerRatings> = {
  GK: {
    passing: -5,
    dribbling: -25,
    shooting: -30,
    tackling: -25,
    positioning: 0,
    pace: -20,
    goalkeeping: 10,
  },
  DEF: {
    passing: -4,
    dribbling: -10,
    shooting: -22,
    tackling: 6,
    positioning: 6,
    pace: -2,
    goalkeeping: -40,
  },
  MID: {
    passing: 6,
    dribbling: 0,
    shooting: -6,
    tackling: 0,
    positioning: 0,
    pace: -2,
    goalkeeping: -40,
  },
  FWD: {
    passing: -4,
    dribbling: 5,
    shooting: 8,
    tackling: -22,
    positioning: -8,
    pace: 4,
    goalkeeping: -40,
  },
};

/** Build a plausible team (11 starters + 7 subs) of a given strength, for tests and tooling. */
export function createSyntheticTeam(opts: SyntheticTeamOptions): Team {
  const rng = createRng(opts.seed ?? 1);
  const formation = opts.formation ?? '4-4-2';
  const [def = 4, mid = 4, fwd = 2] = formation.split('-').map(Number);
  const layout: Position[] = [
    'GK',
    ...Array<Position>(def).fill('DEF'),
    ...Array<Position>(mid).fill('MID'),
    ...Array<Position>(fwd).fill('FWD'),
  ];
  const bench: Position[] = ['GK', 'DEF', 'DEF', 'MID', 'MID', 'FWD', 'FWD'];
  const make = (position: Position, i: number): Player => {
    const ratings = {} as PlayerRatings;
    for (const key of Object.keys(PROFILE[position]) as (keyof PlayerRatings)[]) {
      const v = opts.strength + PROFILE[position][key] + (rng() - 0.5) * 12;
      ratings[key] = Math.round(Math.min(99, Math.max(1, v)));
    }
    return { id: `${opts.id}-${i + 1}`, name: `${opts.id} ${position}${i + 1}`, position, ratings };
  };
  return {
    id: opts.id,
    name: opts.name ?? opts.id,
    formation,
    tactic: opts.tactic ?? 'balanced',
    players: layout.map(make),
    bench: bench.map((pos, i) => make(pos, layout.length + i)),
  };
}
