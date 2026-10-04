import { describe, expect, it } from 'vitest';
import {
  MARKET_VALUE,
  curveValue,
  marketValues,
  qualityPercentiles,
  roundValue,
  type ValuationInput,
} from './market-value';
import type { Position } from './types';

const sizes: Record<Position, number> = { GK: 20, DEF: 60, MID: 80, FWD: 30 };

/** A deterministic synthetic pool: prices and overalls are loosely correlated, with ties. */
function pool(overrides: Partial<ValuationInput> = {}): ValuationInput[] {
  const out: ValuationInput[] = [];
  for (const position of ['GK', 'DEF', 'MID', 'FWD'] as const) {
    for (let i = 0; i < sizes[position]; i++) {
      out.push({
        id: `${position}-${i}`,
        position,
        fplPrice: 40 + ((i * 7) % 30) + Math.floor(i / 4),
        overall: 45 + ((i * 11) % 38),
        ...overrides,
      });
    }
  }
  return out;
}

describe('market value', () => {
  it('is deterministic and independent of pool order', () => {
    const a = marketValues(pool());
    const b = marketValues(pool());
    expect([...a]).toEqual([...b]);
    const shuffled = [...pool()].reverse();
    const c = marketValues(shuffled);
    for (const [id, value] of a) expect(c.get(id)).toBe(value);
  });

  it('orders players strictly by blended quality within a position (available players)', () => {
    const players = pool();
    const values = marketValues(players);
    const quality = qualityPercentiles(players);
    for (const position of ['GK', 'DEF', 'MID', 'FWD'] as const) {
      const group = players
        .filter((p) => p.position === position)
        .sort((a, b) => quality.get(a.id)! - quality.get(b.id)!);
      // Quality is a strict rank, so it never ties; values never fall as quality rises.
      expect(new Set(group.map((p) => quality.get(p.id))).size).toBe(group.length);
      for (let i = 1; i < group.length; i++) {
        expect(values.get(group[i]!.id)!).toBeGreaterThanOrEqual(values.get(group[i - 1]!.id)!);
      }
    }
  });

  it('never prices a player lower for a better rating at the same FPL price', () => {
    const players = pool();
    const values = marketValues(players);
    for (const a of players) {
      for (const b of players) {
        if (a.position === b.position && a.fplPrice === b.fplPrice && a.overall > b.overall) {
          expect(values.get(a.id)!).toBeGreaterThanOrEqual(values.get(b.id)!);
        }
      }
    }
  });

  it('keeps the position ceilings in order: GK < DEF < MID and FWD', () => {
    const top = (position: Position): number =>
      Math.max(...MARKET_VALUE.curves[position].map((k) => k[1]));
    expect(top('GK')).toBeLessThan(top('DEF'));
    expect(top('DEF')).toBeLessThan(top('MID'));
    expect(top('DEF')).toBeLessThan(top('FWD'));
    const values = marketValues(pool());
    const best = (position: Position): number =>
      Math.max(
        ...pool()
          .filter((p) => p.position === position)
          .map((p) => values.get(p.id)!),
      );
    expect(best('GK')).toBeLessThan(best('DEF'));
    expect(best('DEF')).toBeLessThan(best('MID'));
    expect(best('DEF')).toBeLessThan(best('FWD'));
  });

  it('never prices a defender above a midfielder or forward of the same quality, nor a keeper above a defender', () => {
    for (let i = 0; i <= 100; i++) {
      const q = i / 100;
      expect(curveValue('DEF', q)).toBeLessThanOrEqual(curveValue('MID', q) + 1e-9);
      expect(curveValue('DEF', q)).toBeLessThanOrEqual(curveValue('FWD', q) + 1e-9);
      expect(curveValue('GK', q)).toBeLessThanOrEqual(curveValue('DEF', q) + 1e-9);
    }
  });

  it('has convex, increasing curves', () => {
    for (const position of ['GK', 'DEF', 'MID', 'FWD'] as const) {
      const knots = MARKET_VALUE.curves[position];
      let previousSlope = 0;
      for (let i = 1; i < knots.length; i++) {
        const slope = (knots[i]![1] - knots[i - 1]![1]) / (knots[i]![0] - knots[i - 1]![0]);
        expect(slope).toBeGreaterThanOrEqual(previousSlope - 1e-9);
        previousSlope = slope;
      }
    }
  });

  it('rounds to realistic increments', () => {
    expect(roundValue(1.23)).toBe(12);
    expect(roundValue(9.94)).toBe(99);
    expect(roundValue(12.3)).toBe(125);
    expect(roundValue(12.2)).toBe(120);
    expect(roundValue(49.9)).toBe(500);
    expect(roundValue(57.4)).toBe(570);
    expect(roundValue(174.6)).toBe(1750);
    for (const value of marketValues(pool()).values()) {
      const millions = value / 10;
      if (millions >= 50) expect(Number.isInteger(millions)).toBe(true);
      else if (millions >= 10) expect(Number.isInteger(millions * 2)).toBe(true);
      else expect(Number.isInteger(millions * 10)).toBe(true);
    }
  });
});
