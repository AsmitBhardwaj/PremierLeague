import type { Tactic } from '@pl/engine';
import playerData from '../../play/data/players.json';
import { cheapestLegalCompletion, pickFormationXI, type MarketPlayer } from '../../play/lib/squad';
import type { MatchPreparation } from './match';

export const market = playerData as MarketPlayer[];

/** A legal 18-player squad and XI used by tests. */
export function testPreparation(
  overrides: Partial<MatchPreparation> = {},
  tactic: Tactic = 'balanced',
): MatchPreparation {
  const completion = cheapestLegalCompletion([], market);
  if (!completion) throw new Error('Fixture data cannot form a legal test squad.');
  const squad = completion.playerIds.map((id) => market.find((player) => player.id === id)!);
  return {
    identity: {
      name: 'Test Athletic',
      shortName: 'TST',
      stadium: 'Test Ground',
      primaryColor: '#f7f8f8',
      secondaryColor: '#1c1d1f',
      crestShape: 'shield',
      budget: 'standard',
    },
    squad,
    formation: '4-4-2',
    starterIds: pickFormationXI(squad, '4-4-2'),
    tactic,
    opponentId: 'ARS',
    venue: 'home',
    ...overrides,
  };
}
