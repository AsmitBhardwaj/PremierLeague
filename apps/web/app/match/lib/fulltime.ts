import type { PlayerMatchRating } from '@pl/engine';

/** Highest engine rating first; ties go to the player with more goal involvements, then by name. */
export function rankPlayers(ratings: readonly PlayerMatchRating[]): PlayerMatchRating[] {
  return [...ratings].sort(
    (a, b) =>
      b.rating - a.rating ||
      b.goals + b.assists - (a.goals + a.assists) ||
      a.name.localeCompare(b.name) ||
      a.playerId.localeCompare(b.playerId),
  );
}

export function playerOfTheMatch(
  ratings: readonly PlayerMatchRating[],
): PlayerMatchRating | undefined {
  return rankPlayers(ratings)[0];
}
