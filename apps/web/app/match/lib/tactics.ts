import { TUNING, type Tactic } from '@pl/engine';

export interface TacticInfo {
  id: Tactic;
  label: string;
  /** One line: what it does in the engine, and what it costs. Numbers come from TUNING. */
  tradeOff: string;
}

const T = TUNING;
const percent = (factor: number) => `${Math.round(Math.abs(factor - 1) * 100)}%`;

export const TACTICS: TacticInfo[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    tradeOff: 'No bonuses and no penalties: the baseline every other tactic is measured against.',
  },
  {
    id: 'high_press',
    label: 'High press',
    tradeOff: `Your defending is +${T.pressBonus} while the opponent builds in their own half, but players tire ${T.tactics.high_press.stamina}× faster, you concede ${percent(T.tactics.high_press.xgAgainst)} better chances and collect ${percent(T.tactics.high_press.cards)} more cards.`,
  },
  {
    id: 'counter',
    label: 'Counter',
    tradeOff: `Winning the ball deep starts a quick break with more long balls and ${percent(T.counterXgBonus)} better shots, but build-up passing from your own half is ${T.counterBuildPenalty} points weaker.`,
  },
  {
    id: 'defensive',
    label: 'Defensive',
    tradeOff: `Chances against you are ${percent(T.tactics.defensive.xgAgainst)} worse and your defending is +${T.defensiveBonus} once they reach your half, but you take ${percent(T.tactics.defensive.shot)} fewer shots and move forward less.`,
  },
];

export const tacticInfo = (id: Tactic): TacticInfo => TACTICS.find((item) => item.id === id)!;
