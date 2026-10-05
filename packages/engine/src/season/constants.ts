import type { Position } from '../types';

/** Season-dynamics constants (Phase 5). Match behaviour itself stays in `../tuning.ts`. */
export const SEASON = {
  /** Share of the gap to 100% fitness a player recovers between two matchdays. */
  fitnessRecovery: 0.75,
  /** Starters below this fitness are rested by AI clubs when a same-position player is fit. */
  restBelowFitness: 70,
  /** Weight of the previous form in the exponentially weighted average (last ~5 appearances). */
  formDecay: 0.6,
  /**
   * The individual match rating that counts as a neutral performance, by position. Keepers earn
   * saves and clean sheets, and the formula rewards midfielders and forwards differently, so one
   * shared baseline would give a whole position permanently good (or bad) form, a hidden
   * per-position bonus. Each is the mean over 200 simulated seasons of 60+ minute appearances
   * (`pnpm --filter @pl/scripts diagnose-scorers`). The same four numbers apply to every club.
   */
  formBaseline: { GK: 7.33, DEF: 6.04, MID: 6.61, FWD: 6.61 } as Record<Position, number>,
  /**
   * The mean match rating (team-result terms included) by position, measured the same way. A
   * player's rating is compared with this when players of different positions are ranked (star
   * player, player of the season), so a goalkeeper does not win on his position alone.
   */
  ratingBaseline: { GK: 7.37, DEF: 6.0, MID: 6.68, FWD: 6.62 } as Record<Position, number>,
  /** Rating points of modifier per point of form, and its cap either way. */
  formScale: 2,
  formCap: 2,
  /** Matches missed after a straight or second-yellow red card. */
  redCardBan: 1,
  /** Injury length in matches: cumulative probability up to, and the inclusive range drawn. */
  injuryLengths: [
    { upTo: 0.35, min: 1, max: 1 },
    { upTo: 0.6, min: 2, max: 2 },
    { upTo: 0.75, min: 3, max: 3 },
    { upTo: 0.9, min: 4, max: 6 },
    { upTo: 0.97, min: 7, max: 12 },
    { upTo: 1, min: 13, max: 20 },
  ] as const,
} as const;

/** How far an average rating is above (or below) the average for the player's position. */
export const ratingVsPosition = (averageRating: number, position: Position): number =>
  averageRating - SEASON.ratingBaseline[position];
