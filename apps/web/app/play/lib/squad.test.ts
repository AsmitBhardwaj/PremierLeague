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
  validateLineup,
  validateSquad,
  type MarketPlayer,
} from './squad';

const market = playerData as MarketPlayer[];
const cheapestSquad = (): MarketPlayer[] => {
  const completion = cheapestLegalCompletion([], market);
  if (!completion) throw new Error('Expected the market to contain a legal squad');
  return completion.playerIds.map((id) => market.find((player) => player.id === id)!);
};

describe('complete roster validation', () => {
  it('accepts exactly 18 players with the approved positional mix', () => {
    const squad = cheapestSquad();
    expect(validateSquad(squad)).toEqual([]);
    expect(squad).toHaveLength(18);
    for (const [position, quota] of Object.entries(POSITION_QUOTAS)) {
      expect(squad.filter((player) => player.position === position)).toHaveLength(quota);
    }
  });

  it('rejects incomplete squads', () => {
    expect(validateSquad(cheapestSquad().slice(0, -1))).toContain('Select exactly 18 players.');
  });
});

describe('selection constraints', () => {
  it('enforces the £275m budget', () => {
    const squad = cheapestSquad().map((player, index) =>
      index === 0 ? { ...player, value: SQUAD_BUDGET } : player,
    );
    expect(validateSquad(squad)).toContain('The squad is over the £275m budget.');
    expect(assessSelection({ ...market[0]!, value: SQUAD_BUDGET + 1 }, [], market).message).toMatch(
      /over £275m/,
    );
  });

  it('enforces each positional quota', () => {
    const squad = cheapestSquad().map((player) => ({ ...player, position: 'MID' as const }));
    expect(validateSquad(squad)).toContain('Select exactly 2 GK players.');
    const sixDefenders = cheapestSquad().filter((player) => player.position === 'DEF');
    const defender = market.find(
      (player) => player.position === 'DEF' && !sixDefenders.some((item) => item.id === player.id),
    )!;
    expect(assessSelection(defender, sixDefenders, market).message).toBe(
      'Your DEF quota is already full.',
    );
  });

  it('prevents duplicate players', () => {
    const squad = cheapestSquad();
    expect(validateSquad([...squad, squad[0]!])).toContain('A player can only be selected once.');
    expect(assessSelection(squad[0]!, squad, market).message).toMatch(/already in your squad/);
  });

  it('enforces the maximum of three players per real club', () => {
    const club = market.find(
      (candidate) => market.filter((player) => player.clubId === candidate.clubId).length >= 4,
    )!.clubId;
    const clubPlayers = market.filter((player) => player.clubId === club).slice(0, 4);
    expect(assessSelection(clubPlayers[3]!, clubPlayers.slice(0, 3), market).message).toMatch(
      /3 players/,
    );
    const invalid = cheapestSquad().map((player, index) =>
      index < 4 ? { ...player, clubId: 'same', clubName: 'Same Club' } : player,
    );
    expect(validateSquad(invalid)).toContain('Select no more than 3 players from any real club.');
  });
});

describe('cheapest legal completion', () => {
  it('finds an exact legal minimum-cost completion', () => {
    const completion = cheapestLegalCompletion([], market);
    expect(completion).not.toBeNull();
    const squad = completion!.playerIds.map((id) => market.find((player) => player.id === id)!);
    expect(completion!.cost).toBe(squad.reduce((sum, player) => sum + player.value, 0));
    expect(validateSquad(squad)).toEqual([]);
  });

  it('rejects a selection whose cheapest legal completion exceeds the budget', () => {
    const inflated = market.map((player) => ({ ...player, value: 200 }));
    expect(assessSelection(inflated[0]!, [], inflated).message).toMatch(
      /cheapest legal completion/,
    );
  });

  it('returns null when club limits make completion impossible', () => {
    const oneClub = market.map((player) => ({ ...player, clubId: 'only-club' }));
    expect(cheapestLegalCompletion([], oneClub)).toBeNull();
  });
});

describe('formation, XI and bench validation', () => {
  it.each(Object.keys(FORMATIONS) as (keyof typeof FORMATIONS)[])(
    'builds a valid %s XI with a seven-player bench',
    (formation) => {
      const squad = cheapestSquad();
      const starters = pickFormationXI(squad, formation);
      expect(validateFormation(squad, starters, formation)).toEqual([]);
      expect(validateLineup(squad, starters, formation)).toEqual([]);
      const team = createPredictionTeam('test', 'Test Club', squad, starters, formation);
      expect(team.players).toHaveLength(11);
      expect(team.bench).toHaveLength(7);
    },
  );

  it('rejects invalid formation composition and invalid bench membership', () => {
    const squad = cheapestSquad();
    const starters = pickFormationXI(squad, '4-4-2');
    const goalkeeper = squad.find(
      (player) => player.position === 'GK' && !starters.includes(player.id),
    )!;
    const defenderIndex = starters.findIndex(
      (id) => squad.find((player) => player.id === id)?.position === 'DEF',
    );
    const invalidShape = starters.map((id, index) =>
      index === defenderIndex ? goalkeeper.id : id,
    );
    expect(validateFormation(squad, invalidShape, '4-4-2')).toContain(
      'The starting XI must contain exactly one goalkeeper.',
    );
    expect(validateLineup(squad, [...starters.slice(0, -1), 'not-in-squad'], '4-4-2')).toContain(
      'Every starter must belong to the selected squad.',
    );
  });
});

describe('predictSeason integration', () => {
  it('is deterministic for a completed user squad and explicit replacement club', () => {
    const squad = cheapestSquad();
    const formation = '4-4-2';
    const team = createPredictionTeam(
      'test',
      'Test Club',
      squad,
      pickFormationXI(squad, formation),
      formation,
    );
    const options = { seasons: 100, seed: 2103, replacedClubId: 'IPS' };
    expect(predictSeason(team, options)).toEqual(predictSeason(team, options));
  });
});
