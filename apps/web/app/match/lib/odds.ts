import { expectedGoals, teamProfile, type Team } from '@pl/engine';
import type { Venue } from './seed';

export interface FixtureOdds {
  win: number;
  draw: number;
  loss: number;
  /** Expected league points for the user's club in this fixture: 3 × win + draw. */
  expectedPoints: number;
  userExpectedGoals: number;
  opponentExpectedGoals: number;
}

const MAX_GOALS = 20;

function poissonMass(lambda: number): number[] {
  const mass = new Array<number>(MAX_GOALS + 1);
  mass[0] = Math.exp(-lambda);
  for (let goals = 1; goals <= MAX_GOALS; goals++)
    mass[goals] = (mass[goals - 1]! * lambda) / goals;
  return mass;
}

/**
 * Exact W/D/L from the same scoreline model predictSeason samples: two independent Poisson goal
 * counts whose means come from the fitted surrogate's `expectedGoals` (which carries home
 * advantage). Nothing here sums player stats beyond the surrogate's own team aggregates.
 */
export function fixtureOdds(user: Team, opponent: Team, venue: Venue): FixtureOdds {
  const own = teamProfile(user);
  const other = teamProfile(opponent);
  const userExpectedGoals = expectedGoals(own, other, venue === 'home');
  const opponentExpectedGoals = expectedGoals(other, own, venue === 'away');
  const userMass = poissonMass(userExpectedGoals);
  const opponentMass = poissonMass(opponentExpectedGoals);
  let win = 0;
  let draw = 0;
  let loss = 0;
  for (let u = 0; u <= MAX_GOALS; u++) {
    for (let o = 0; o <= MAX_GOALS; o++) {
      const probability = userMass[u]! * opponentMass[o]!;
      if (u > o) win += probability;
      else if (u === o) draw += probability;
      else loss += probability;
    }
  }
  const total = win + draw + loss;
  win /= total;
  draw /= total;
  loss /= total;
  return {
    win,
    draw,
    loss,
    expectedPoints: 3 * win + draw,
    userExpectedGoals,
    opponentExpectedGoals,
  };
}
