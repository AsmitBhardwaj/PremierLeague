import {
  computeDataVersion,
  type Player,
  type SeasonClubInput,
  type SeasonSetup,
} from '@pl/engine';
import { listClubs } from '../../play/lib/clubs';
import { SQUAD_BUDGET, type MarketPlayer } from '../../play/lib/squad';

/** The user's club in the season; real clubs keep their FPL short codes. */
export const USER_CLUB_ID = 'USER';
/** Single career slot, JSON only so it can move to a server unchanged. */
export const SEASON_STORAGE_KEY = '21st-club-season-v1';

const plain = (player: MarketPlayer): Player => ({
  id: player.id,
  name: player.name,
  position: player.position,
  ratings: player.ratings,
});

/**
 * The 20-club league: the 19 real clubs with their whole squads, and the user's club in the place of
 * the replaced one. Every club is built by the same rule; none gets an adjustment.
 */
export function buildSetup(
  market: readonly MarketPlayer[],
  replacedId: string,
  userName: string,
  userSquad: readonly MarketPlayer[],
  seed: number,
  budget: number = SQUAD_BUDGET,
): SeasonSetup {
  const clubs: SeasonClubInput[] = listClubs(market)
    .filter((club) => club.id !== replacedId)
    .map((club) => ({
      id: club.id,
      name: club.name,
      players: market.filter((p) => p.clubShortName === club.id).map(plain),
    }));
  const values: Record<string, number> = {};
  for (const p of market) values[p.id] = p.value;
  return {
    seed,
    userClubId: USER_CLUB_ID,
    // January window: current market values, the budget chosen at founding, and the replaced club's players
    // (who are on the market but not in the league).
    transferMarket: {
      budget,
      values,
      outside: [
        {
          clubId: replacedId,
          players: market.filter((p) => p.clubShortName === replacedId).map(plain),
        },
      ],
    },
    clubs: [{ id: USER_CLUB_ID, name: userName, players: userSquad.map(plain) }, ...clubs],
  };
}

/** Hash of the player data and engine tuning; a save from other data is refused. */
export const marketDataVersion = (market: readonly MarketPlayer[]): string =>
  computeDataVersion(market.map(plain));
