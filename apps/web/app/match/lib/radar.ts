import type { Player, PlayerRatings } from '@pl/engine';

export interface RadarAxis {
  key: keyof PlayerRatings;
  label: string;
  /** Three-letter broadcast code shown on the radar itself. */
  short: string;
  value: number;
}

const OUTFIELD: [keyof PlayerRatings, string, string][] = [
  ['pace', 'Pace', 'PAC'],
  ['shooting', 'Shooting', 'SHO'],
  ['passing', 'Passing', 'PAS'],
  ['dribbling', 'Dribbling', 'DRI'],
  ['tackling', 'Tackling', 'TAC'],
  ['positioning', 'Positioning', 'POS'],
];

/** Goalkeepers swap Shooting for Goalkeeping; every axis is a direct engine rating. */
const GOALKEEPER: [keyof PlayerRatings, string, string][] = OUTFIELD.map(([key, label, short]) =>
  key === 'shooting' ? ['goalkeeping', 'Goalkeeping', 'GKP'] : [key, label, short],
);

export function radarAxes(player: Pick<Player, 'position' | 'ratings'>): RadarAxis[] {
  const layout = player.position === 'GK' ? GOALKEEPER : OUTFIELD;
  return layout.map(([key, label, short]) => ({ key, label, short, value: player.ratings[key] }));
}

/** All seven engine ratings, for the stat bars. */
export const RATING_LABELS: [keyof PlayerRatings, string][] = [
  ['pace', 'Pace'],
  ['shooting', 'Shooting'],
  ['passing', 'Passing'],
  ['dribbling', 'Dribbling'],
  ['tackling', 'Tackling'],
  ['positioning', 'Positioning'],
  ['goalkeeping', 'Goalkeeping'],
];
