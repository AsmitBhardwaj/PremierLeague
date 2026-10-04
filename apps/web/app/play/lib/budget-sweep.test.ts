import { describe, expect, it } from 'vitest';
import { optimise, predict } from './budget-helpers';
import { squadCost } from './squad';

// Money must buy strength: with our valuations, a better-funded optimiser reaches a better
// predicted season and actually spends what it is given. This guards against cheap, low-evidence
// players being elite in the simulation (which made every budget produce the same squad).
describe('money buys strength', () => {
  it('raises the best predicted points with the budget and spends at least 95% of it', () => {
    const results = [1500, 2000, 2500].map((budget) => {
      const squad = optimise(budget);
      return { budget, spent: squadCost(squad), points: predict(squad, 200).meanPoints };
    });
    for (const { budget, spent } of results) {
      expect(spent).toBeGreaterThanOrEqual(0.95 * budget);
      expect(spent).toBeLessThanOrEqual(budget);
    }
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.points).toBeGreaterThan(results[i - 1]!.points);
    }
  }, 240_000);
});
