import type { Tactic } from '@pl/engine';

export interface TacticInfo {
  id: Tactic;
  label: string;
  /**
   * One plain-English line with no numbers: what the tactic gains and what it costs. Every claim is
   * backed by a `TUNING.tactics` value or constant (see tactics.test.ts). Shared by pick-your-team
   * and half-time, listed from most cautious to most aggressive.
   */
  tradeOff: string;
}

export const TACTICS: TacticInfo[] = [
  {
    id: 'defensive',
    label: 'Defensive',
    tradeOff: 'Hard to break down and easy on the legs, but you shoot less and rarely get forward.',
  },
  {
    id: 'counter',
    label: 'Counter',
    tradeOff:
      'Quick breaks after winning the ball, with more long balls and better shots, but weaker at building from the back.',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    tradeOff: 'The all-round default: no bonuses and no penalties.',
  },
  {
    id: 'high_press',
    label: 'High press',
    tradeOff:
      'Wins the ball higher up the pitch, but tires your players fast and gives them better chances and more cards.',
  },
];

export const tacticInfo = (id: Tactic): TacticInfo => TACTICS.find((item) => item.id === id)!;
