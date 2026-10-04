import { TUNING } from '@pl/engine';
import { describe, expect, it } from 'vitest';
import { TACTICS } from './tactics';

const line = (id: string) => TACTICS.find((t) => t.id === id)!.tradeOff;

describe('tactic trade-offs', () => {
  it('covers the four engine tactics with a plain-English line and no numbers', () => {
    expect([...TACTICS.map((tactic) => tactic.id)].sort()).toEqual(
      Object.keys(TUNING.tactics).sort(),
    );
    for (const tactic of TACTICS) {
      expect(tactic.tradeOff.length).toBeGreaterThan(20);
      expect(tactic.tradeOff).not.toMatch(/\d/);
    }
  });

  it('only claims what the engine does: every non-balanced tactic has a gain and a cost', () => {
    const { high_press: press, counter, defensive } = TUNING.tactics;
    // High press: wins the ball higher, tires players, gives better chances and more cards.
    expect(line('high_press')).toMatch(/higher/);
    expect(TUNING.pressBonus).toBeGreaterThan(0);
    expect(line('high_press')).toMatch(/tires/);
    expect(press.stamina).toBeGreaterThan(1);
    expect(line('high_press')).toMatch(/better chances/);
    expect(press.xgAgainst).toBeGreaterThan(1);
    expect(line('high_press')).toMatch(/more cards/);
    expect(press.cards).toBeGreaterThan(1);
    // Counter: more long balls and better shots, weaker build-up from the back.
    expect(line('counter')).toMatch(/long balls/);
    expect(counter.longBall).toBeGreaterThan(1);
    expect(line('counter')).toMatch(/better shots/);
    expect(TUNING.counterXgBonus).toBeGreaterThan(0);
    expect(line('counter')).toMatch(/building from the back/);
    expect(TUNING.counterBuildPenalty).toBeGreaterThan(0);
    // Defensive: hard to break down, easy on the legs, fewer shots, less forward play.
    expect(line('defensive')).toMatch(/hard to break down/i);
    expect(defensive.xgAgainst).toBeLessThan(1);
    expect(line('defensive')).toMatch(/easy on the legs/);
    expect(defensive.stamina).toBeLessThan(1);
    expect(line('defensive')).toMatch(/shoot less/);
    expect(defensive.shot).toBeLessThan(1);
    expect(line('defensive')).toMatch(/rarely get forward/);
    expect(defensive.forward).toBeLessThan(TUNING.tactics.balanced.forward);
  });
});
