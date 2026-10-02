import { overall } from '../squads';
import type { Player, Team } from '../types';

export interface TeamAggregateRatings {
  attack: number;
  midfield: number;
  defence: number;
  keeper: number;
  benchDepth: number;
}

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const outfield = (team: Team): Player[] =>
  team.players.filter((player) => player.position !== 'GK');

/** Reduce a full match-engine squad to the five inputs used by the season surrogate. */
export function aggregateTeamRatings(team: Team): TeamAggregateRatings {
  const players = outfield(team);
  const forwards = players.filter((player) => player.position === 'FWD');
  return {
    // Attack captures finishing in the advanced line; midfield captures whole-XI progression.
    // Together the composites follow phases of play more closely than positional overall ratings.
    attack: mean(
      forwards.map(
        ({ ratings }) =>
          0.2 * ratings.passing +
          0.25 * ratings.dribbling +
          0.45 * ratings.shooting +
          0.1 * ratings.pace,
      ),
    ),
    midfield: mean(
      players.map(
        ({ ratings }) =>
          0.45 * ratings.passing +
          0.25 * ratings.dribbling +
          0.15 * ratings.tackling +
          0.15 * ratings.positioning,
      ),
    ),
    defence: mean(players.map(({ ratings }) => 0.5 * ratings.tackling + 0.5 * ratings.positioning)),
    keeper: mean(
      team.players
        .filter((player) => player.position === 'GK')
        .map((player) => player.ratings.goalkeeping),
    ),
    benchDepth: mean((team.bench ?? []).map((player) => overall(player.position, player.ratings))),
  };
}
