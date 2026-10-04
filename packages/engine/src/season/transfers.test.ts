import { describe, expect, it } from 'vitest';
import { createSyntheticTeam } from '../index';
import type { Player, Position } from '../types';
import {
  Career,
  MAX_TRANSFERS,
  MIN_AWARD_APPEARANCES,
  cacheOf,
  computeDataVersion,
  replayCareer,
  type CareerSave,
  type SeasonClubInput,
  type SeasonSetup,
} from './index';

const makeClub = (id: string, strength: number): SeasonClubInput => {
  const a = createSyntheticTeam({ id, strength, seed: id.length * 31 + strength });
  const b = createSyntheticTeam({ id: `${id}x`, strength: strength - 6, seed: strength });
  const extra = [...b.players, ...(b.bench ?? [])]
    .filter((p) => p.position !== 'GK')
    .slice(0, 6)
    .map((p) => ({ ...p, id: p.id.replace(`${id}x`, id) + 'r' }));
  return { id, name: id, players: [...a.players, ...(a.bench ?? []), ...extra] };
};

const QUOTA: Record<Position, number> = { GK: 2, DEF: 6, MID: 6, FWD: 4 };
const BUDGET = 100;

/** A user squad of 2/6/6/4 players drawn from the real clubs (never more than three per club). */
function setup(seed = 3): SeasonSetup {
  const reals = Array.from({ length: 19 }, (_, i) => makeClub(`c${i}`, 50 + (i % 10) * 3));
  const squad: Player[] = [];
  const used = new Map<string, number>();
  for (const position of ['GK', 'DEF', 'MID', 'FWD'] as Position[]) {
    let need = QUOTA[position];
    for (const club of reals) {
      if (need === 0) break;
      if ((used.get(club.id) ?? 0) >= 3) continue;
      const player = club.players.find((p) => p.position === position && !squad.includes(p));
      if (!player) continue;
      squad.push(player);
      used.set(club.id, (used.get(club.id) ?? 0) + 1);
      need--;
    }
    if (need > 0) throw new Error('test squad could not be built');
  }
  const values: Record<string, number> = {};
  for (const club of reals) for (const p of club.players) values[p.id] = 5;
  return {
    seed,
    userClubId: 'USER',
    clubs: [{ id: 'USER', name: 'USER', players: squad }, ...reals],
    transferMarket: { budget: BUDGET, values },
  };
}

const atWindow = (seed = 3): Career => {
  const career = new Career(setup(seed));
  career.apply({ type: 'sim', to: 'january' });
  return career;
};

/** A real-club player in the position who is not in the user's squad. */
const candidate = (
  career: Career,
  position: Position,
  exceptClubs: string[] = [],
  nth = 0,
): { player: Player; clubId: string } => {
  const squad = new Set(career.squad().map((p) => p.id));
  const owned = new Map<string, number>();
  for (const p of career.squad()) {
    const clubId = career.season.findSignable(p.id)!.clubId;
    owned.set(clubId, (owned.get(clubId) ?? 0) + 1);
  }
  for (const [clubId, n] of owned) if (n >= 3) exceptClubs = [...exceptClubs, clubId];
  const found = career.season
    .clubIds()
    .filter((id) => id !== 'USER' && !exceptClubs.includes(id))
    .flatMap((id) => career.season.squadOf(id).map((p) => ({ player: p, clubId: id })))
    .filter((c) => c.player.position === position && !squad.has(c.player.id));
  return found[nth]!;
};
const mine = (career: Career, position: Position, nth = 0): Player =>
  career.squad().filter((p) => p.position === position)[nth]!;

describe('January window transfers', () => {
  it('are refused outside the window', () => {
    const career = new Career(setup());
    const target = candidate(career, 'MID');
    expect(() =>
      career.apply({ type: 'transfer', out: mine(career, 'MID').id, in: target.player.id }),
    ).toThrow();
    career.apply({ type: 'sim', to: 'january' });
    career.apply({ type: 'closeWindow' });
    expect(() =>
      career.apply({ type: 'transfer', out: mine(career, 'MID').id, in: target.player.id }),
    ).toThrow();
  });

  it('swap a player for another in the same position and keep the squad shape', () => {
    const career = atWindow();
    const out = mine(career, 'MID');
    const target = candidate(career, 'MID');
    career.apply({ type: 'transfer', out: out.id, in: target.player.id });
    const squad = career.squad();
    expect(squad).toHaveLength(18);
    expect(squad.some((p) => p.id === out.id)).toBe(false);
    expect(squad.some((p) => p.id === target.player.id)).toBe(true);
    for (const position of Object.keys(QUOTA) as Position[]) {
      expect(squad.filter((p) => p.position === position)).toHaveLength(QUOTA[position]);
    }
    expect(career.transfersMade).toBe(1);
    // The signing takes the sold player's place in a lineup that started him.
    const lineup = career.userLineup();
    expect(lineup.starters).not.toContain(out.id);
    expect(lineup.starters).toHaveLength(11);
  });

  it('allow three transfers and no more', () => {
    const career = atWindow();
    for (let i = 0; i < MAX_TRANSFERS; i++) {
      career.apply({
        type: 'transfer',
        out: mine(career, 'DEF', i).id,
        in: candidate(career, 'DEF', [], 10 + i * 3).player.id,
      });
    }
    expect(career.transfersMade).toBe(MAX_TRANSFERS);
    expect(() =>
      career.apply({
        type: 'transfer',
        out: mine(career, 'GK').id,
        in: candidate(career, 'GK').player.id,
      }),
    ).toThrow(/3 transfers/);
    expect(career.decisions.filter((d) => d.type === 'transfer')).toHaveLength(3);
  });

  it('enforce position, membership, club limit and budget', () => {
    const career = atWindow();
    const out = mine(career, 'FWD');
    // A different position.
    expect(() =>
      career.apply({ type: 'transfer', out: out.id, in: candidate(career, 'MID').player.id }),
    ).toThrow(/for a FWD/);
    // Selling a player who is not in the squad, or buying one already owned.
    expect(() =>
      career.apply({
        type: 'transfer',
        out: candidate(career, 'FWD').player.id,
        in: candidate(career, 'FWD', [], 1).player.id,
      }),
    ).toThrow(/not in your squad/);
    expect(() =>
      career.apply({ type: 'transfer', out: out.id, in: mine(career, 'FWD', 1).id }),
    ).toThrow(/already in your squad/);
    expect(() => career.apply({ type: 'transfer', out: out.id, in: 'nobody' })).toThrow(
      /not on the market/,
    );
    // A fourth player from one club: find a club the user already has three players at.
    const counts = new Map<string, number>();
    for (const p of career.squad()) {
      const clubId = career.season.findSignable(p.id)!.clubId;
      counts.set(clubId, (counts.get(clubId) ?? 0) + 1);
    }
    const full = [...counts].find(([, n]) => n === 3)![0];
    const fullClubFwd = career.season
      .squadOf(full)
      .find((p) => p.position === 'FWD' && !career.squad().some((s) => s.id === p.id));
    expect(fullClubFwd).toBeDefined();
    expect(() =>
      career.apply({
        type: 'transfer',
        out: mine(career, 'FWD').id,
        in: fullClubFwd!.id,
      }),
    ).toThrow(/3 players from that club/);
    expect(career.transfersMade).toBe(0);
  });

  it('refuse a signing that takes the squad over budget', () => {
    const base = setup();
    const target = candidate(atWindow(), 'MID').player;
    const values = { ...base.transferMarket!.values, [target.id]: 500 };
    const career = new Career({ ...base, transferMarket: { ...base.transferMarket!, values } });
    career.apply({ type: 'sim', to: 'january' });
    expect(() =>
      career.apply({ type: 'transfer', out: mine(career, 'MID').id, in: target.id }),
    ).toThrow(/over budget/);
    expect(career.transfersMade).toBe(0);
  });

  it('can sign players of a club outside the league', () => {
    const base = setup();
    const outsider: Player = {
      ...base.clubs[1]!.players.find((p) => p.position === 'MID')!,
      id: 'out1',
    };
    const withOutside = {
      ...base,
      transferMarket: {
        ...base.transferMarket!,
        values: { ...base.transferMarket!.values, out1: 5 },
        outside: [{ clubId: 'GONE', players: [outsider] }],
      },
    };
    const career = new Career(withOutside);
    career.apply({ type: 'sim', to: 'january' });
    career.apply({ type: 'transfer', out: mine(career, 'MID').id, in: 'out1' });
    expect(career.squad().some((p) => p.id === 'out1')).toBe(true);
  });

  it('replay deterministically from the seed', () => {
    const play = (career: Career): void => {
      career.apply({
        type: 'transfer',
        out: mine(career, 'MID').id,
        in: candidate(career, 'MID', [], 20).player.id,
      });
      career.apply({
        type: 'transfer',
        out: mine(career, 'FWD').id,
        in: candidate(career, 'FWD', [], 8).player.id,
      });
      career.apply({ type: 'closeWindow' });
      career.apply({ type: 'sim', to: 'end' });
    };
    const live = atWindow(11);
    play(live);
    const copy = new Career(setup(11), live.decisions);
    expect(copy.season.table()).toEqual(live.season.table());
    expect(copy.squad().map((p) => p.id)).toEqual(live.squad().map((p) => p.id));
    expect(copy.squadStates()).toEqual(live.squadStates());
    // Through a JSON save, as the site does it.
    const players = setup(11).clubs.flatMap((c) => c.players);
    const save: CareerSave = {
      version: 2,
      seed: 11,
      dataVersion: computeDataVersion(players),
      identity: {},
      replacedClubId: 'x',
      squadIds: [],
      prediction: {},
      decisions: JSON.parse(JSON.stringify(live.decisions)),
      revealed: -1,
      cache: cacheOf(live),
    };
    const replayed = replayCareer(save, setup(11), save.dataVersion);
    expect(replayed.ok).toBe(true);
  }, 60_000);

  it('make a signing unavailable to his real club against you at once', () => {
    const career = atWindow();
    // The best forward of the next opponent's club, whom that club would start.
    const { clubId: club } = candidate(career, 'FWD');
    const star = [...career.season.squadOf(club)]
      .filter((p) => p.position === 'FWD' && !career.squad().some((s) => s.id === p.id))
      .sort((a, b) => b.ratings.shooting - a.ratings.shooting)[0]!;
    const inXi = (c: Career) =>
      c.season.opponentPreview(club).players.some((p) => p.id === `${club}:${star.id}`);
    expect(inXi(career)).toBe(true);
    career.apply({ type: 'transfer', out: mine(career, 'FWD').id, in: star.id });
    expect(inXi(career)).toBe(false);
    // He no longer features for his club against the user, and he is still in the user's squad.
    expect(career.squad().some((p) => p.id === star.id)).toBe(true);
  });

  it("bring a signing with his real club's injury and fitness", () => {
    const career = atWindow();
    const hurt = career.season
      .clubIds()
      .flatMap((id) => (id === 'USER' ? [] : career.season.squadOf(id).map((p) => ({ id, p }))))
      .find(
        ({ id, p }) =>
          career.season.outFor(id, p.id) > 0 && !career.squad().some((s) => s.id === p.id),
      );
    if (!hurt) return; // no injury at this seed: nothing to carry
    const out = mine(career, hurt.p.position);
    career.apply({ type: 'transfer', out: out.id, in: hurt.p.id });
    expect(career.season.outFor('USER', hurt.p.id)).toBe(career.season.outFor(hurt.id, hurt.p.id));
  });
});

describe('season awards', () => {
  const finish = (seed: number, swap: boolean): Career => {
    const career = atWindow(seed);
    if (swap) {
      career.apply({
        type: 'transfer',
        out: mine(career, 'FWD').id,
        in: candidate(career, 'FWD', [], 6).player.id,
      });
    }
    career.apply({ type: 'closeWindow' });
    career.apply({ type: 'sim', to: 'end' });
    return career;
  };

  it('pick the league-wide top scorer and player of the season from the match ratings', () => {
    const career = finish(5, false);
    const awards = career.awards();
    const stats = career.season.playerStats();
    const goals = new Map<string, number>();
    for (const s of stats) goals.set(s.playerId, (goals.get(s.playerId) ?? 0) + s.goals);
    expect(awards.topScorer!.goals).toBe(Math.max(...goals.values()));
    expect(awards.topScorer!.goals).toBeGreaterThan(0);
    expect(awards.playerOfSeason!.appearances).toBeGreaterThanOrEqual(MIN_AWARD_APPEARANCES);
    expect(awards.playerOfSeason!.averageRating).toBeGreaterThan(6);
  }, 60_000);

  it("pick the user's own top scorer and best player from his own squad", () => {
    const career = finish(5, false);
    const awards = career.awards();
    const squad = new Set(career.squad().map((p) => p.id));
    expect(awards.userBestPlayer).not.toBeNull();
    expect(squad.has(awards.userBestPlayer!.playerId)).toBe(true);
    expect(awards.userBestPlayer!.clubId).toBe('USER');
    if (awards.userTopScorer) expect(squad.has(awards.userTopScorer.playerId)).toBe(true);
  }, 60_000);

  it('keep what a sold player did for the club and are deterministic', () => {
    const a = finish(7, true);
    const b = finish(7, true);
    expect(a.awards()).toEqual(b.awards());
    const soldLines = a.season
      .playerStats()
      .filter((s) => s.clubId === 'USER' && !a.squad().some((p) => p.id === s.playerId));
    expect(soldLines.length).toBeGreaterThan(0);
  }, 120_000);
});
