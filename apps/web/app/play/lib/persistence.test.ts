import { describe, expect, it } from 'vitest';
import playerData from '../data/players.json';
import { cheapestLegalCompletion, pickFormationXI, type MarketPlayer } from './squad';
import { emptyIdentity, parseSavedFlow, type SavedFlow } from './persistence';

const market = playerData as MarketPlayer[];
const identity = {
  ...emptyIdentity,
  name: 'Northstar FC',
  shortName: 'NFC',
  stadium: 'Northstar Ground',
};

const completeSquad = () => {
  const completion = cheapestLegalCompletion([], market)!;
  return completion.playerIds.map((id) => market.find((player) => player.id === id)!);
};

describe('saved flow parsing and recovery', () => {
  it('restores valid completed progress', () => {
    const squad = completeSquad();
    const saved: SavedFlow = {
      step: 'prediction',
      identity,
      selectedIds: squad.map((player) => player.id),
      formation: '4-3-3',
      starterIds: pickFormationXI(squad, '4-3-3'),
    };
    const restored = parseSavedFlow(JSON.stringify(saved), market);
    expect(restored?.step).toBe('prediction');
    expect(restored?.selected).toHaveLength(18);
    expect(restored?.starterIds).toHaveLength(11);
  });

  it('returns null for malformed saved data', () => {
    expect(parseSavedFlow('{broken', market)).toBeNull();
    expect(parseSavedFlow(JSON.stringify({ step: 'prediction' }), market)).toBeNull();
  });

  it('recovers invalid identity, squad and XI to the appropriate step', () => {
    const squad = completeSquad();
    const base: SavedFlow = {
      step: 'prediction',
      identity,
      selectedIds: squad.map((player) => player.id),
      formation: '4-4-2',
      starterIds: pickFormationXI(squad, '4-4-2'),
    };
    expect(parseSavedFlow(JSON.stringify({ ...base, identity: emptyIdentity }), market)?.step).toBe(
      'identity',
    );
    expect(
      parseSavedFlow(JSON.stringify({ ...base, selectedIds: ['missing'] }), market)?.step,
    ).toBe('squad');
    expect(parseSavedFlow(JSON.stringify({ ...base, starterIds: ['missing'] }), market)?.step).toBe(
      'lineup',
    );
  });

  it('sanitises unknown ids, duplicate ids, invalid colours and formations', () => {
    const restored = parseSavedFlow(
      JSON.stringify({
        step: 'squad',
        identity: { ...identity, primaryColor: 'red', crestShape: 'copied-logo' },
        selectedIds: [market[0]!.id, market[0]!.id, 'missing'],
        formation: '2-2-6',
        starterIds: [],
      }),
      market,
    );
    expect(restored?.selectedIds).toEqual([market[0]!.id]);
    expect(restored?.identity.primaryColor).toBe(emptyIdentity.primaryColor);
    expect(restored?.identity.crestShape).toBe(emptyIdentity.crestShape);
    expect(restored?.formation).toBe('4-4-2');
  });
});
