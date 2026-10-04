/** Season-dynamics constants (Phase 5). Match behaviour itself stays in `../tuning.ts`. */
export const SEASON = {
  /** Share of the gap to 100% fitness a player recovers between two matchdays. */
  fitnessRecovery: 0.75,
  /** Starters below this fitness are rested by AI clubs when a same-position player is fit. */
  restBelowFitness: 70,
  /** Weight of the previous form in the exponentially weighted average (last ~5 appearances). */
  formDecay: 0.6,
  /** Individual match rating that counts as a neutral performance. */
  formBaseline: 6,
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
