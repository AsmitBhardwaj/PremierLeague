import { Career, cacheOf, parseCareerSave, replayCareer, type CareerSave } from '@pl/engine';
import { describe, expect, it } from 'vitest';
import playerData from '../../play/data/players.json';
import { balancedBuild } from '../../play/lib/budget-helpers';
import { computeReplacedClub } from '../../play/lib/clubs';
import {
  SQUAD_BUDGET,
  pickFormationXI,
  squadCost,
  validateSquad,
  type MarketPlayer,
} from '../../play/lib/squad';
import { USER_CLUB_ID, buildSetup, marketDataVersion } from './setup';

const market = playerData as MarketPlayer[];
const replaced = computeReplacedClub(market);
const squad = balancedBuild(2750);
const starters = pickFormationXI(squad, '4-4-2');

describe('season setup from the real market', () => {
  it("builds a 20-club league with the user in the replaced club's place", () => {
    const setup = buildSetup(market, replaced.id, 'Test FC', squad, 11);
    expect(setup.clubs).toHaveLength(20);
    expect(setup.clubs.some((c) => c.id === replaced.id)).toBe(false);
    expect(setup.clubs[0]).toMatchObject({ id: USER_CLUB_ID, name: 'Test FC' });
    expect(setup.clubs[0]!.players).toHaveLength(18);
    for (const club of setup.clubs.slice(1)) expect(club.players.length).toBeGreaterThanOrEqual(15);
  });

  it('gives the January window the budget it is built with, Standard by default', () => {
    expect(buildSetup(market, replaced.id, 'Test FC', squad, 11).transferMarket?.budget).toBe(
      SQUAD_BUDGET,
    );
    expect(buildSetup(market, replaced.id, 'Test FC', squad, 11, 1750).transferMarket?.budget).toBe(
      1750,
    );
  });

  it('plays a whole season, pauses at the window, and replays from its save', () => {
    const setup = buildSetup(market, replaced.id, 'Test FC', squad, 11);
    const career = new Career(setup);
    career.apply({ type: 'lineup', formation: '4-4-2', starters, tactic: 'balanced' });
    career.apply({ type: 'sim', to: 'end' });
    expect(career.phase).toBe('window');
    career.apply({ type: 'closeWindow' });
    career.playInstant(career.userLineup());
    career.apply({ type: 'sim', to: 'end' });
    expect(career.phase).toBe('finished');
    expect(career.season.table()).toHaveLength(20);

    const dataVersion = marketDataVersion(market);
    const save: CareerSave = {
      version: 2,
      seed: 11,
      dataVersion,
      identity: { name: 'Test FC' },
      replacedClubId: replaced.id,
      squadIds: squad.map((p) => p.id),
      prediction: null,
      decisions: career.decisions,
      revealed: -1,
      cache: cacheOf(career),
    };
    const parsed = parseCareerSave(JSON.parse(JSON.stringify(save)))!;
    const result = replayCareer(parsed, setup, dataVersion);
    expect(result.ok).toBe(true);
    expect(replayCareer(parsed, setup, 'other').ok).toBe(false);
  }, 120_000);

  it('has a stable data version', () => {
    expect(marketDataVersion(market)).toBe(marketDataVersion(market));
  });

  describe('January window with real values', () => {
    const byId = new Map(market.map((p) => [p.id, p]));
    const owned = new Set(squad.map((p) => p.id));
    const current = (career: Career) => career.squad().map((p) => byId.get(p.id)!);
    /** A market player in the position the squad has room for under all rules, cheaper or equal. */
    const swapFor = (career: Career, out: MarketPlayer, nth = 0) =>
      market
        .filter((p) => p.position === out.position && !current(career).some((s) => s.id === p.id))
        .filter((p) => {
          const next = current(career).filter((s) => s.id !== out.id);
          return validateSquad([...next, p]).length === 0;
        })
        .sort((a, b) => b.value - a.value)
        .filter((p) => p.value <= out.value + (SQUAD_BUDGET - squadCost(current(career))))[nth]!;
    const atWindow = () => {
      const career = new Career(buildSetup(market, replaced.id, 'Test FC', squad, 11));
      career.apply({ type: 'lineup', formation: '4-4-2', starters, tactic: 'balanced' });
      career.apply({ type: 'sim', to: 'january' });
      return career;
    };

    it('keep every squad rule through three swaps and refuse a fourth', () => {
      const career = atWindow();
      const outs = ['DEF', 'MID', 'FWD'].map((pos) => squad.find((p) => p.position === pos)!);
      for (const out of outs) {
        const target = swapFor(career, out);
        career.apply({ type: 'transfer', out: out.id, in: target.id });
        const next = current(career);
        expect(validateSquad(next)).toEqual([]);
        expect(squadCost(next)).toBeLessThanOrEqual(SQUAD_BUDGET);
      }
      expect(career.transfersMade).toBe(3);
      const gk = squad.find((p) => p.position === 'GK')!;
      expect(() =>
        career.apply({ type: 'transfer', out: gk.id, in: swapFor(career, gk).id }),
      ).toThrow(/3 transfers/);
    });

    it('refuse a signing that costs more than the cash available', () => {
      const career = atWindow();
      const out = squad.filter((p) => p.position === 'MID').sort((a, b) => a.value - b.value)[0]!;
      const cash = SQUAD_BUDGET - squadCost(current(career));
      const tooDear = market
        .filter((p) => p.position === 'MID' && !owned.has(p.id) && p.value > out.value + cash)
        .sort((a, b) => a.value - b.value)[0];
      expect(tooDear).toBeDefined();
      expect(() => career.apply({ type: 'transfer', out: out.id, in: tooDear!.id })).toThrow(
        /over budget/,
      );
    });

    it('can sign a player of the replaced club', () => {
      const career = atWindow();
      const out = squad.find((p) => p.position === 'DEF')!;
      const target = market
        .filter(
          (p) =>
            p.clubShortName === replaced.id &&
            p.position === 'DEF' &&
            !owned.has(p.id) &&
            validateSquad([...current(career).filter((s) => s.id !== out.id), p]).length === 0,
        )
        .sort((a, b) => a.value - b.value)[0];
      expect(target).toBeDefined();
      career.apply({ type: 'transfer', out: out.id, in: target!.id });
      expect(career.squad().some((p) => p.id === target!.id)).toBe(true);
    });

    it('replay to the same season from the seed and the log', () => {
      const run = () => {
        const career = atWindow();
        const out = squad.find((p) => p.position === 'MID')!;
        career.apply({ type: 'transfer', out: out.id, in: swapFor(career, out).id });
        career.apply({ type: 'closeWindow' });
        career.apply({ type: 'sim', to: 'end' });
        return career;
      };
      const live = run();
      const replayed = new Career(
        buildSetup(market, replaced.id, 'Test FC', squad, 11),
        live.decisions,
      );
      expect(replayed.season.table()).toEqual(live.season.table());
      expect(replayed.squad().map((p) => p.id)).toEqual(live.squad().map((p) => p.id));
      expect(run().season.table()).toEqual(live.season.table());
    }, 120_000);
  });
});
