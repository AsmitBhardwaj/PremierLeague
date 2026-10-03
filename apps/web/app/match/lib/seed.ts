export type Venue = 'home' | 'away';

export const MATCH_SEED_SALT = 0x21c104;

/**
 * Deterministic match seed: a stable FNV-1a hash of club, opponent, venue and play counter.
 * Lineup and tactic are deliberately not part of it, so changing them replays the same stream.
 */
export function matchSeed(
  clubName: string,
  opponentId: string,
  venue: Venue,
  playCounter: number,
): number {
  const value = [clubName, opponentId, venue, playCounter].join('|');
  let hash = (0x811c9dc5 ^ MATCH_SEED_SALT) >>> 0;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash | 0;
}
