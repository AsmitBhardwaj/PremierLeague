import { TUNING } from '@pl/engine';
import { describe, expect, it } from 'vitest';
import { TACTICS } from './tactics';

describe('tactic trade-offs', () => {
  it('covers the four engine tactics, each with a numeric one-liner from TUNING', () => {
    expect(TACTICS.map((tactic) => tactic.id)).toEqual(Object.keys(TUNING.tactics));
    expect(TACTICS.find((t) => t.id === 'high_press')!.tradeOff).toContain(
      `${TUNING.tactics.high_press.stamina}×`,
    );
    expect(TACTICS.find((t) => t.id === 'counter')!.tradeOff).toContain(
      String(TUNING.counterBuildPenalty),
    );
    for (const tactic of TACTICS) expect(tactic.tradeOff.length).toBeGreaterThan(20);
  });

  it('reflects real trade-offs: every non-balanced tactic has both a gain and a cost in TUNING', () => {
    const { high_press: press, counter, defensive } = TUNING.tactics;
    expect(press.stamina).toBeGreaterThan(1);
    expect(press.xgAgainst).toBeGreaterThan(1);
    expect(TUNING.pressBonus).toBeGreaterThan(0);
    expect(counter.longBall).toBeGreaterThan(1);
    expect(TUNING.counterBuildPenalty).toBeGreaterThan(0);
    expect(defensive.xgAgainst).toBeLessThan(1);
    expect(defensive.shot).toBeLessThan(1);
  });
});
