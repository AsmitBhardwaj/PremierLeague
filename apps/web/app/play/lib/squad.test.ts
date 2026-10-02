import { describe, expect, it } from 'vitest';
import { predictSeason } from '@pl/engine';
import playerData from '../data/players.json';
import {
  FORMATIONS,
  POSITION_QUOTAS,
  SQUAD_BUDGET,
  assessSelection,
  cheapestLegalCompletion,
  createPredictionTeam,
  pickFormationXI,
  validateFormation,
  validateSquad,
  type MarketPlayer,
} from './squad';

const market = playerData as MarketPlayer[];
const cheapestSquad = (): MarketPlayer[] => {
  const completion = cheapestLegalCompletion([], market);
  if (!completion) throw new Error('Expected the market to contain a legal squad');
  return completion.playerIds.map((id) => market.find((player) => player.id === id)!);
};

describe('Phase 3 squad rules', () => {
  it('finds an exact legal minimum-cost completion', () => {
    const squad = cheapestSquad();
    expect(squad).toHaveLength(18);
    expect(validateSquad(squad)).toEqual([]);
    expect(squad.reduce((sum, player) => sum + player.price, 0)).toBeLessThanOrEqual(SQUAD_BUDGET);
    for (const [position, quota] of Object.entries(POSITION_QUOTAS)) {
      expect(squad.filter((player) => player.position === position)).toHaveLength(quota);
    }
  });

  it('enforces budget, position quotas, duplicates and the three-per-club limit', () => {
    const squad = cheapestSquad();
    expect(validateSquad([...squad, squad[0]!])).toContain('A player can only be selected once.');
    const expensive = squad.map((player, index) =>
      index === 0 ? { ...player, price: SQUAD_BUDGET } : player,
    );
    expect(validateSquad(expensive)).toContain('The squad is over the £95.0m budget.');

    const sameClub = squad.map((player, index) =>
      index < 4 ? { ...player, clubId: 'same', clubName: 'Same Club' } : player,
    );
    expect(validateSquad(sameClub)).toContain(
      'Select no more than three players from any real club.',
    );
    expect(
      validateSquad(squad.map((player) => ({ ...player, position: 'MID' as const }))),
    ).toContain('Select exactly 2 GK players.');
  });

  it('rejects an addition when a club cap or cheapest completion makes it illegal', () => {
    const club = market.find(
      (candidate) => market.filter((player) => player.clubId === candidate.clubId).length >= 4,
    )!.clubId;
    const clubPlayers = market.filter((player) => player.clubId === club).slice(0, 4);
    expect(assessSelection(clubPlayers[3]!, clubPlayers.slice(0, 3), market).message).toMatch(
      /three players/,
    );

    const inflated = market.map((player) => ({ ...player, price: 100 }));
    expect(assessSelection(inflated[0]!, [], inflated).message).toMatch(
      /cheapest legal completion/,
    );
  });
});

describe('formation and prediction integration', () => {
  it.each(Object.keys(FORMATIONS) as (keyof typeof FORMATIONS)[])(
    'builds a valid %s XI and seven-player bench',
    (formation) => {
      const squad = cheapestSquad();
      const starters = pickFormationXI(squad, formation);
      expect(validateFormation(squad, starters, formation)).toEqual([]);
      const team = createPredictionTeam('test', 'Test Club', squad, starters, formation);
      expect(team.players).toHaveLength(11);
      expect(team.bench).toHaveLength(7);
    },
  );

  it('runs the real prediction deterministically for the completed user squad', () => {
    const squad = cheapestSquad();
    const formation = '4-4-2';
    const team = createPredictionTeam(
      'test',
      'Test Club',
      squad,
      pickFormationXI(squad, formation),
      formation,
    );
    expect(predictSeason(team, { seasons: 100, seed: 2103 })).toEqual(
      predictSeason(team, { seasons: 100, seed: 2103 }),
    );
  });
});
