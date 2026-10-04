import type { Tactic } from '@pl/engine';

export type RatingTone = 'high' | 'low' | 'mid';
export type FitnessTone = 'good' | 'warn' | 'bad';

/** Volt from 7.0, pink below 6.0, neutral in between. */
export const ratingTone = (rating: number): RatingTone =>
  rating >= 7 ? 'high' : rating < 6 ? 'low' : 'mid';

/** Green from 75%, amber 50-74%, red below 50%. */
export const fitnessTone = (fitness: number): FitnessTone =>
  fitness >= 75 ? 'good' : fitness >= 50 ? 'warn' : 'bad';

/** Share of a pair that is "ours", for the stat bars (50 when both are zero). */
export const shareOf = (us: number, them: number): number =>
  us + them > 0 ? (us / (us + them)) * 100 : 50;

export interface TipPlayer {
  name: string;
  position: string;
}

/** Everything the assistant may cite. Each value is computed from the first half, never guessed. */
export interface TipInput {
  score: { us: number; them: number };
  shots: { us: number; them: number };
  /** Expected goals, as shown on the stats strip. */
  xg: { us: number; them: number };
  possession: { us: number; them: number };
  tactic: Tactic;
  subsLeft: number;
  /** Red cards so far. */
  reds: { us: number; them: number };
  /** Starters with the lowest fitness under 50%, who have a same-position bench player. */
  tired: (TipPlayer & { fitness: number }) | null;
  /** Lowest-rated starter under 5.5 who has a same-position bench player. */
  struggling: (TipPlayer & { rating: number }) | null;
  /** A starter on a yellow card, if any. */
  booked: TipPlayer | null;
  /** The highest-rated starter, if rated. */
  best: (TipPlayer & { rating: number }) | null;
}

const MEN = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const scoreText = (a: number, b: number): string => `${a}–${b}`;
const menText = (reds: number): string => MEN[11 - reds] ?? String(11 - reds);

/**
 * The assistant's one sentence. Twelve rules, first match wins:
 *  1 you are a man down (or more)        7  trailing and out-shot
 *  2 they are a man down (or more)       8  ahead but outplayed on expected goals
 *  3 a starter is below 50% fitness      9  ahead by two or more
 *  4 a starter is rated below 5.5        10 level and they have more of the ball
 *  5 a starter is on a yellow card       11 level and you are out-shooting them
 *  6 trailing but out-shooting them      12 otherwise (best player, lead, or a quiet half)
 * Rules 3 and 4 only fire when substitutes are left and one plays that position.
 */
export function halfTimeTip(input: TipInput): string {
  const { score, shots, xg, possession, tactic, subsLeft, reds } = input;
  const diff = score.us - score.them;
  const scoreline = scoreText(score.us, score.them);

  if (reds.us > 0) {
    return tactic === 'defensive'
      ? `You're down to ${menText(reds.us)} men and already set up defensively. Stay compact and protect what you have.`
      : `You're down to ${menText(reds.us)} men. Consider a Defensive approach to protect what you have.`;
  }
  if (reds.them > 0) {
    return `They're down to ${menText(reds.them)} men. Keep the ball moving and make the extra man count.`;
  }
  if (input.tired && subsLeft > 0) {
    const { name, position, fitness } = input.tired;
    return `${name} is running on empty at ${Math.round(fitness)}%. A fresh ${position} from the bench would help.`;
  }
  if (input.struggling && subsLeft > 0) {
    const { name, position, rating } = input.struggling;
    return `${name} is struggling, rated ${rating.toFixed(1)}. A fresh ${position} could help.`;
  }
  if (input.booked) {
    return `${input.booked.name} is on a yellow card. One more mistimed tackle could see him sent off.`;
  }
  if (diff < 0 && shots.us > shots.them + 1) {
    return `You're trailing ${scoreline} but have out-shot them ${scoreText(shots.us, shots.them)}. Stay patient; the goals should come.`;
  }
  if (diff < 0 && shots.them > shots.us + 1) {
    return tactic === 'high_press'
      ? `Trailing ${scoreline} and out-shot ${scoreText(shots.us, shots.them)} even with the press on. Balanced would steady things.`
      : `Trailing ${scoreline} and out-shot ${scoreText(shots.us, shots.them)}. A High press could win the ball back higher up, at the cost of tired legs.`;
  }
  if (diff > 0 && xg.them > xg.us + 0.3) {
    return tactic === 'defensive'
      ? `Ahead ${scoreline}, but they've had the better chances (expected goals ${xg.us.toFixed(2)}–${xg.them.toFixed(2)}). Your Defensive set-up suits the lead.`
      : `Ahead ${scoreline}, but they've had the better chances (expected goals ${xg.us.toFixed(2)}–${xg.them.toFixed(2)}). A Defensive approach could protect the lead.`;
  }
  if (diff >= 2) {
    return tactic === 'balanced'
      ? `Comfortably ahead at ${scoreline}. Stay Balanced and keep control.`
      : `Comfortably ahead at ${scoreline}. Balanced would keep control and save legs.`;
  }
  if (diff === 0 && possession.them >= 55) {
    return tactic === 'counter'
      ? `All square, and they've had ${Math.round(possession.them)}% of the ball. Your Counter set-up is built for this.`
      : `All square, but they've had ${Math.round(possession.them)}% of the ball. A Counter approach could hit them on the break.`;
  }
  if (diff === 0 && shots.us > shots.them + 1) {
    return `All square, but you've out-shot them ${scoreText(shots.us, shots.them)}. Keep going and the goal should come.`;
  }
  if (input.best && input.best.rating >= 7.5) {
    return `${input.best.name} is your man of the half, rated ${input.best.rating.toFixed(1)}. Keep him on.`;
  }
  if (diff > 0) return `Ahead ${scoreline}. Keep your shape and see it out.`;
  if (diff < 0)
    return `Trailing ${scoreline}, with the shots close at ${scoreText(shots.us, shots.them)}. One goal changes this.`;
  return 'Nothing needs fixing. Stay with your plan and start the second half.';
}
