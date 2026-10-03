import { aggregateTeamRatings, pickSquad, type Player, type Team } from '@pl/engine';
import type { MarketPlayer } from './squad';

/** The three clubs promoted into the 2026/27 league; the user's club replaces one of them. */
export const PROMOTED_CLUB_CODES = ['COV', 'HUL', 'IPS'] as const;

export interface RealClub {
  /** FPL short code, e.g. "ARS"; matches the ids in the precomputed season background. */
  id: string;
  name: string;
}

/** Real clubs present in the player data, sorted by name. */
export function listClubs(market: readonly MarketPlayer[]): RealClub[] {
  const clubs = new Map<string, RealClub>();
  for (const player of market) {
    if (!clubs.has(player.clubShortName)) {
      clubs.set(player.clubShortName, { id: player.clubShortName, name: player.clubName });
    }
  }
  return [...clubs.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** A real club's squad, picked by the engine's global picker (the same rules for every club). */
export function buildRealClubTeam(market: readonly MarketPlayer[], clubId: string): Team {
  const eligible = market.filter((player) => player.clubShortName === clubId);
  if (!eligible.length) throw new Error(`No eligible players found for club ${clubId}.`);
  const players: Player[] = eligible.map((player) => ({
    id: player.id,
    name: player.name,
    position: player.position,
    ratings: player.ratings,
  }));
  return pickSquad(clubId, eligible[0]!.clubName, players);
}

/**
 * The plan's rule: the user's club replaces the promoted club with the weakest squad, measured as
 * the mean of the five aggregate team ratings (the same measure the season background used).
 */
export function computeReplacedClub(market: readonly MarketPlayer[]): RealClub {
  const clubs = listClubs(market);
  const promoted = PROMOTED_CLUB_CODES.map((code) => {
    const club = clubs.find((item) => item.id === code);
    if (!club) throw new Error(`Promoted club ${code} is missing from the player data.`);
    const ratings = aggregateTeamRatings(buildRealClubTeam(market, code));
    const strength = Object.values(ratings).reduce((sum, value) => sum + value, 0) / 5;
    return { club, strength };
  });
  promoted.sort((a, b) => a.strength - b.strength || a.club.id.localeCompare(b.club.id));
  return promoted[0]!.club;
}

/** The 19 real clubs the user can face: every club except the one they replace. */
export function listOpponents(market: readonly MarketPlayer[], replacedId: string): RealClub[] {
  return listClubs(market).filter((club) => club.id !== replacedId);
}
