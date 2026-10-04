import { Match } from './engine';
import { createSyntheticTeam } from './synthetic';
import type { MatchResult, Tactic } from './types';

const TACTICS: Tactic[] = ['balanced', 'high_press', 'counter', 'defensive'];

/** Stable FNV-1a hash of a string; used to fingerprint whole match results in golden tests. */
export function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * A result serialised without the additive fields: `offPlayerId` on substitution events and
 * `individual` on player ratings.
 */
export function serialiseWithoutOffPlayer(result: MatchResult): string {
  return JSON.stringify({
    ...result,
    playerRatings: result.playerRatings.map((rating) => {
      const rest: Partial<typeof rating> = { ...rating };
      delete rest.individual;
      return rest;
    }),
    events: result.events.map((event) => {
      const rest: Partial<typeof event> = { ...event };
      delete rest.offPlayerId;
      return rest;
    }),
  });
}

/**
 * 80 deterministic scenarios covering varied strengths and tactics, plus half-time tactic changes
 * and substitutions through the public Match API. Many produce injury auto-subs.
 */
export function goldenResults(): MatchResult[] {
  const results: MatchResult[] = [];
  for (let seed = 1; seed <= 80; seed++) {
    const home = createSyntheticTeam({
      id: 'h',
      strength: 45 + (seed % 7) * 5,
      tactic: TACTICS[seed % 4]!,
      seed,
    });
    const away = createSyntheticTeam({
      id: 'a',
      strength: 45 + (seed % 5) * 6,
      tactic: TACTICS[(seed + 1) % 4]!,
      seed: seed + 1000,
    });
    const match = new Match({ home, away, seed });
    match.playFirstHalf();
    if (seed % 2 === 0) {
      match.setTactic('home', TACTICS[(seed + 2) % 4]!);
      const off = home.players.find((p) => p.position === 'MID')!;
      const on = home.bench!.find((p) => p.position === 'MID')!;
      match.substitute('home', off.id, on.id);
    }
    results.push(match.playSecondHalf());
  }
  return results;
}
