import { describe, expect, it } from 'vitest';
import playerData from '../../play/data/players.json';
import { cheapestLegalCompletion, pickFormationXI, type MarketPlayer } from '../../play/lib/squad';
import { parseSavedMatchFlow, type SavedMatchFlow } from './persistence';

const market = playerData as MarketPlayer[];
const completion = cheapestLegalCompletion([], market)!;
const squad = completion.playerIds.map((id) => market.find((player) => player.id === id)!);
const valid: SavedMatchFlow = {
  version: 1,
  formation: '4-4-2',
  starterIds: pickFormationXI(squad, '4-4-2'),
  tactic: 'balanced',
  mode: 'highlights',
};

describe('match persistence', () => {
  it('restores valid saved match preparation', () => {
    expect(parseSavedMatchFlow(JSON.stringify(valid), squad)).toEqual(valid);
  });

  it('rejects missing, malformed and stale squad state', () => {
    expect(parseSavedMatchFlow(null, squad)).toBeNull();
    expect(parseSavedMatchFlow('{broken', squad)).toBeNull();
    expect(
      parseSavedMatchFlow(JSON.stringify({ ...valid, starterIds: ['missing'] }), squad),
    ).toBeNull();
    expect(
      parseSavedMatchFlow(JSON.stringify({ ...valid, tactic: 'all_out_attack' }), squad),
    ).toBeNull();
  });
});
