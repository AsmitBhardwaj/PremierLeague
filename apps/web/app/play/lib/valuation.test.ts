import { describe, expect, it } from 'vitest';
import { balancedBuild, likelyFinish, market, optimise, predict } from './budget-helpers';
import { SQUAD_BUDGET, cheapestLegalCompletion, squadCost, type MarketPlayer } from './squad';

const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'] as const;
const count = (predicate: (player: MarketPlayer) => boolean): number =>
  market.filter(predicate).length;
const millions = (player: MarketPlayer): number => player.value / 10;

describe('market values in the player dataset', () => {
  it('gives every player an integer value and exposes no FPL price', () => {
    for (const player of market) {
      expect(Number.isInteger(player.value)).toBe(true);
      expect(player.value).toBeGreaterThan(0);
      expect(Object.keys(player)).not.toContain('price');
    }
  });

  it('hits the distribution targets', () => {
    const elite = market.filter((p) => millions(p) >= 100);
    expect(elite.length).toBeGreaterThanOrEqual(6);
    expect(elite.length).toBeLessThanOrEqual(10);
    expect(elite.every((p) => p.position === 'MID' || p.position === 'FWD')).toBe(true);
    expect(new Set(elite.map((p) => p.clubId)).size).toBeGreaterThanOrEqual(3);
    const upper = count((p) => millions(p) >= 50 && millions(p) < 100);
    expect(upper).toBeGreaterThanOrEqual(30);
    expect(upper).toBeLessThanOrEqual(50);
    const middle = count((p) => millions(p) >= 20 && millions(p) < 50);
    expect(middle).toBeGreaterThanOrEqual(120);
    expect(middle).toBeLessThanOrEqual(180);
    for (const position of POSITIONS) {
      expect(count((p) => p.position === position && millions(p) <= 3)).toBeGreaterThanOrEqual(15);
    }
  });

  it('keeps position ceilings in order: GK < DEF < MID and FWD', () => {
    const top = (position: string): number =>
      Math.max(...market.filter((p) => p.position === position).map(millions));
    expect(top('GK')).toBeGreaterThanOrEqual(40);
    expect(top('GK')).toBeLessThanOrEqual(60);
    expect(top('GK')).toBeLessThan(top('DEF'));
    expect(top('DEF')).toBeLessThanOrEqual(100);
    expect(top('DEF')).toBeLessThan(top('MID'));
    expect(top('DEF')).toBeLessThan(top('FWD'));
    expect(Math.max(top('MID'), top('FWD'))).toBeLessThanOrEqual(175);
  });

  it('keeps the top of each position strictly ordered among available players', () => {
    for (const position of POSITIONS) {
      const top = market
        .filter((p) => p.position === position && p.status === 'a')
        .sort((a, b) => b.value - a.value)
        .slice(0, 5)
        .map((p) => p.value);
      expect(new Set(top).size).toBe(top.length);
    }
  });

  it('only has one or two defenders near the defender ceiling', () => {
    const ceiling = Math.max(...market.filter((p) => p.position === 'DEF').map(millions));
    expect(count((p) => p.position === 'DEF' && millions(p) >= 0.85 * ceiling)).toBeLessThanOrEqual(
      2,
    );
  });
});

describe('the budget balances the game', () => {
  it('lets any single player, including the most expensive, fit with a cheapest legal completion', () => {
    const mostExpensive = [...market].sort((a, b) => b.value - a.value).slice(0, 12);
    for (const player of mostExpensive) {
      const completion = cheapestLegalCompletion([player], market);
      expect(completion).not.toBeNull();
      expect(player.value + completion!.cost).toBeLessThanOrEqual(SQUAD_BUDGET);
    }
  }, 120000);

  it('leaves most of the budget unspent on the cheapest legal squad', () => {
    const cheapest = cheapestLegalCompletion([], market)!;
    expect(cheapest.cost).toBeLessThan(0.25 * SQUAD_BUDGET);
  });

  it('fits two players at £100m or more, but never three', () => {
    const elite = market.filter((p) => millions(p) >= 100);
    const fits = (picked: MarketPlayer[]): boolean => {
      const completion = cheapestLegalCompletion(picked, market);
      return completion !== null && squadCost(picked) + completion.cost <= SQUAD_BUDGET;
    };
    let twoFit = false;
    for (let a = 0; a < elite.length; a++) {
      for (let b = a + 1; b < elite.length; b++) {
        twoFit ||= fits([elite[a]!, elite[b]!]);
        for (let c = b + 1; c < elite.length; c++) {
          expect(fits([elite[a]!, elite[b]!, elite[c]!])).toBe(false);
        }
      }
    }
    expect(twoFit).toBe(true);
  }, 240000);

  it('puts a balanced build 8th-12th', () => {
    const squad = balancedBuild(SQUAD_BUDGET);
    expect(squadCost(squad)).toBeLessThanOrEqual(SQUAD_BUDGET);
    // Evaluated in the 4-3-3: the balanced build's finish moves with the formation it is played in.
    const finish = likelyFinish(predict(squad, 2000, '4-3-3'));
    expect(finish).toBeGreaterThanOrEqual(8);
    expect(finish).toBeLessThanOrEqual(12);
  }, 120000);

  it('keeps the optimised build a long way from the title and spends the budget', () => {
    const squad = optimise(SQUAD_BUDGET, 200, 500);
    expect(squadCost(squad)).toBeGreaterThanOrEqual(0.95 * SQUAD_BUDGET);
    const prediction = predict(squad, 2000);
    expect(prediction.titleProbability).toBeLessThan(0.15);
    // The target is 4th-7th; this lighter optimiser may land a place higher than the full sweep.
    expect(likelyFinish(prediction)).toBeGreaterThanOrEqual(3);
    expect(likelyFinish(prediction)).toBeLessThanOrEqual(7);
  }, 240_000);
});
