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

/**
 * What the season surrogate sees of a side: the starting XI's mean rating for each outfield skill,
 * the goalkeeper's rating and the forwards' finishing. Plain means, so a squad is described the
 * same way however it was assembled (stars and scrubs included), with no composite weights to
 * mislead when a side sits outside the real clubs' range.
 */
export interface TeamProfile {
  passing: number;
  dribbling: number;
  shooting: number;
  tackling: number;
  positioning: number;
  pace: number;
  keeper: number;
  forwardShooting: number;
  /** Formation shape on the rating scale: 65 at four defenders, 5 points per defender more or fewer. */
  defenders: number;
  /** Likewise 65 at two forwards. */
  forwards: number;
}

export function teamProfile(team: Team): TeamProfile {
  const players = outfield(team);
  const skill = (key: 'passing' | 'dribbling' | 'shooting' | 'tackling' | 'positioning' | 'pace') =>
    mean(players.map(({ ratings }) => ratings[key]));
  const forwards = players.filter((player) => player.position === 'FWD');
  const shooting = skill('shooting');
  return {
    passing: skill('passing'),
    dribbling: skill('dribbling'),
    shooting,
    tackling: skill('tackling'),
    positioning: skill('positioning'),
    pace: skill('pace'),
    keeper: mean(
      team.players
        .filter((player) => player.position === 'GK')
        .map((player) => player.ratings.goalkeeping),
    ),
    forwardShooting: forwards.length
      ? mean(forwards.map(({ ratings }) => ratings.shooting))
      : shooting,
    defenders: 65 + 5 * (players.filter((player) => player.position === 'DEF').length - 4),
    forwards: 65 + 5 * (forwards.length - 2),
  };
}
