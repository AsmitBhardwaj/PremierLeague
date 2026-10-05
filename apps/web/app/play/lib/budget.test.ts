import { describe, expect, it } from 'vitest';
import playerData from '../data/players.json';
import { BUDGET_PRESET_ORDER, DEFAULT_BUDGET_PRESET, budgetOf, parseBudgetPreset } from './budget';
import { emptyIdentity, parseSavedFlow } from './persistence';
import {
  SQUAD_BUDGET,
  assessSelection,
  cheapestLegalCompletion,
  outOfReach,
  validateSquad,
  type MarketPlayer,
} from './squad';

const market = playerData as MarketPlayer[];

describe('budget presets', () => {
  it('are £150m, £275m and £400m, with Standard the default and the engine-tuned budget', () => {
    expect(BUDGET_PRESET_ORDER.map((p) => budgetOf(p))).toEqual([1500, 2750, 4000]);
    expect(DEFAULT_BUDGET_PRESET).toBe('standard');
    expect(budgetOf('standard')).toBe(SQUAD_BUDGET);
    expect(emptyIdentity.budget).toBe('standard');
  });

  it('read a missing or unknown saved value as Standard', () => {
    expect(parseBudgetPreset(undefined)).toBe('standard');
    expect(parseBudgetPreset('cheap')).toBe('standard');
    expect(parseBudgetPreset('underdog')).toBe('underdog');
  });

  it.each(BUDGET_PRESET_ORDER)(
    '%s: any single player plus the cheapest legal completion fits, or is shown out of reach',
    (preset) => {
      const budget = budgetOf(preset);
      // Only the dearest players can fail (the cheapest legal completion of the rest never
      // exceeds what a cheaper player leaves), so the exact check covers the top 40 by value.
      const unreachable = [...market]
        .filter((p) => p.status !== 'u')
        .sort((a, b) => b.value - a.value)
        .slice(0, 40)
        .filter((p) => {
          const completion = cheapestLegalCompletion([p], market)!;
          return p.value + completion.cost > budget;
        });
      // `outOfReach` and `assessSelection` agree with the direct check, for every player.
      for (const p of unreachable) {
        expect(outOfReach(p, market, budget)).toBe(true);
        expect(assessSelection(p, [], market, budget).allowed).toBe(false);
      }
      const reachable = market.find((p) => p.status !== 'u' && p.value < 100)!;
      expect(outOfReach(reachable, market, budget)).toBe(false);
      expect(assessSelection(reachable, [], market, budget).allowed).toBe(true);
      // The hard rule is "fits at every preset" for Standard and Big spender; Underdog may exclude
      // the very dearest players, who are then labelled rather than repriced.
      if (preset !== 'underdog') expect(unreachable).toHaveLength(0);
    },
    120_000,
  );

  it('enforces the chosen budget in squad validation', () => {
    const cheapest = cheapestLegalCompletion([], market)!;
    const squad = cheapest.playerIds.map((id) => market.find((p) => p.id === id)!);
    expect(validateSquad(squad, 1500)).toEqual([]);
    expect(validateSquad(squad, cheapest.cost - 1)).toContain(
      `The squad is over the £${((cheapest.cost - 1) / 10).toFixed(1)}m budget.`,
    );
  });
});

describe('the preset in the saved flow', () => {
  const squadOf = () =>
    cheapestLegalCompletion([], market)!.playerIds.map((id) => market.find((p) => p.id === id)!);
  const flow = (budget: unknown) =>
    JSON.stringify({
      step: 'lineup',
      identity: { ...emptyIdentity, name: 'Northstar Athletic', shortName: 'NOR', budget },
      selectedIds: squadOf().map((p) => p.id),
      formation: '4-4-2',
      starterIds: [],
    });

  it('round-trips and defaults to Standard for older saves', () => {
    expect(parseSavedFlow(flow('underdog'), market)?.identity.budget).toBe('underdog');
    expect(parseSavedFlow(flow(undefined), market)?.identity.budget).toBe('standard');
  });

  it('sends a squad that no longer fits the budget back to the squad step', () => {
    const squad = squadOf();
    const dear = squad.map((p, i) => (i === 0 ? { ...p, value: 1600 } : p));
    // The cheapest legal squad with one player priced above the whole Underdog budget.
    const restored = parseSavedFlow(
      JSON.stringify({
        step: 'lineup',
        identity: { ...emptyIdentity, name: 'A', shortName: 'AB', budget: 'underdog' },
        selectedIds: dear.map((p) => p.id),
        formation: '4-4-2',
        starterIds: [],
      }),
      dear,
    );
    expect(restored?.step).toBe('squad');
  });
});
