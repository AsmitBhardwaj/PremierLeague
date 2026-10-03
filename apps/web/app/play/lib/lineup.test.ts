import { describe, expect, it } from 'vitest';
import playerData from '../data/players.json';
import { benchOf, pitchPositions, startersOf, swapStarter } from './lineup';
import {
  FORMATIONS,
  cheapestLegalCompletion,
  pickFormationXI,
  validateLineup,
  type Formation,
  type MarketPlayer,
} from './squad';

const market = playerData as MarketPlayer[];
const squad = cheapestLegalCompletion([], market)!.playerIds.map((id) =>
  market.find((player) => player.id === id)!,
);

describe('swapStarter', () => {
  const formation: Formation = '4-4-2';
  const starterIds = pickFormationXI(squad, formation);
  const bench = benchOf(squad, starterIds);

  it('accepts a same-position swap and keeps the lineup valid', () => {
    for (const position of ['GK', 'DEF', 'MID', 'FWD'] as const) {
      const starter = startersOf(squad, starterIds).find((p) => p.position === position)!;
      const sub = bench.find((p) => p.position === position)!;
      const result = swapStarter(squad, starterIds, formation, starter.id, sub.id);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(validateLineup(squad, result.starterIds, formation)).toEqual([]);
        expect(result.starterIds).toContain(sub.id);
        expect(result.starterIds).not.toContain(starter.id);
      }
    }
  });

  it('rejects a different-position swap, so exactly one GK always remains', () => {
    const keeper = startersOf(squad, starterIds).find((p) => p.position === 'GK')!;
    const outfield = startersOf(squad, starterIds).find((p) => p.position === 'DEF')!;
    const benchKeeper = bench.find((p) => p.position === 'GK')!;
    const benchMid = bench.find((p) => p.position === 'MID')!;
    expect(swapStarter(squad, starterIds, formation, outfield.id, benchKeeper.id).ok).toBe(false);
    expect(swapStarter(squad, starterIds, formation, keeper.id, benchMid.id).ok).toBe(false);
  });

  it('rejects swaps with nothing selected or with a player already in the XI', () => {
    expect(swapStarter(squad, starterIds, formation, null, bench[0]!.id).ok).toBe(false);
    expect(swapStarter(squad, starterIds, formation, starterIds[1]!, starterIds[2]!).ok).toBe(
      false,
    );
  });

  it('always yields a valid formation for each of the six supported shapes', () => {
    const shapes = Object.keys(FORMATIONS) as Formation[];
    expect(shapes).toHaveLength(6);
    for (const shape of shapes) {
      const ids = pickFormationXI(squad, shape);
      expect(validateLineup(squad, ids, shape)).toEqual([]);
      expect(
        validateLineup(squad, ids, shape === '4-4-2' ? '3-5-2' : '4-4-2').length,
      ).toBeGreaterThan(0);
      const slots = pitchPositions[shape];
      expect(slots.GK).toHaveLength(1);
      expect(slots.DEF).toHaveLength(FORMATIONS[shape].DEF);
    }
  });
});
