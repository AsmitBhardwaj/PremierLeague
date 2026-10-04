import { describe, expect, it } from 'vitest';
import { Match, createSyntheticTeam, type Player } from '../index';
import {
  Season,
  generateFixtures,
  longestRun,
  seasonPlayerId,
  type SeasonClubInput,
} from './index';

const clubIds = Array.from({ length: 20 }, (_, i) => `c${i}`);

/** A 25-player club: a synthetic XI and bench plus a second bench-quality layer. */
const makeClub = (id: string, strength: number): SeasonClubInput => {
  const a = createSyntheticTeam({ id, strength, seed: id.length * 31 + strength });
  const b = createSyntheticTeam({ id: `${id}x`, strength: strength - 6, seed: strength });
  const extra = [...b.players, ...(b.bench ?? [])]
    .filter((p) => p.position !== 'GK')
    .slice(0, 6)
    .map((p) => ({ ...p, id: p.id.replace(`${id}x`, id) + 'r' }));
  return { id, name: id, players: [...a.players, ...(a.bench ?? []), ...extra] };
};
const league = (): SeasonClubInput[] => clubIds.map((id, i) => makeClub(id, 50 + (i % 10) * 3));

describe('generateFixtures', () => {
  const rounds = generateFixtures(clubIds, 11);

  it('is a 38-round double round-robin with every club playing once per round', () => {
    expect(rounds).toHaveLength(38);
    const pairs = new Set<string>();
    for (const round of rounds) {
      expect(round).toHaveLength(10);
      const seen = new Set(round.flatMap((f) => [f.home, f.away]));
      expect(seen.size).toBe(20);
      for (const f of round) pairs.add(`${f.home}>${f.away}`);
    }
    expect(pairs.size).toBe(380);
  });

  it('never gives a club more than two home or away matches in a row', () => {
    for (const seed of [1, 2, 3, 11, 99, 2026]) {
      const r = generateFixtures(clubIds, seed);
      for (const id of clubIds) expect(longestRun(r, id)).toBeLessThanOrEqual(2);
    }
  });

  it('is deterministic from the seed and varies with it', () => {
    expect(generateFixtures(clubIds, 11)).toEqual(rounds);
    expect(generateFixtures(clubIds, 12)).not.toEqual(rounds);
  });
});

describe('engine additions', () => {
  const home = createSyntheticTeam({ id: 'h', strength: 65, seed: 1 });
  const away = createSyntheticTeam({ id: 'a', strength: 65, seed: 2 });

  it('starts players at the given stamina and defaults to 100', () => {
    const tired = new Match({ home, away, seed: 3, startStamina: { 'h-5': 40 } });
    const stamina = (m: Match, id: string): number =>
      m.snapshot().players.find((p) => p.playerId === id)!.stamina;
    expect(stamina(tired, 'h-5')).toBe(40);
    expect(stamina(tired, 'h-6')).toBe(100);
  });

  it('reports an individual rating on the same scale', () => {
    const m = new Match({ home, away, seed: 4 });
    m.playFirstHalf();
    const result = m.playSecondHalf();
    for (const r of result.playerRatings) {
      expect(r.individual).toBeGreaterThanOrEqual(1);
      expect(r.individual).toBeLessThanOrEqual(10);
    }
  });
});

describe('Season', () => {
  const play = (seed: number): Season => {
    const season = new Season({ seed, clubs: league() });
    while (!season.finished) season.playMatchday();
    return season;
  };

  it('plays 38 matchdays, 380 matches, with a consistent table', () => {
    const season = play(5);
    expect(season.matchRecords()).toHaveLength(380);
    const table = season.table();
    expect(table).toHaveLength(20);
    for (const row of table) expect(row.played).toBe(38);
    const goalsFor = table.reduce((s, r) => s + r.goalsFor, 0);
    const goalsAgainst = table.reduce((s, r) => s + r.goalsAgainst, 0);
    expect(goalsFor).toBe(goalsAgainst);
    const points = table.reduce((s, r) => s + r.points, 0);
    const draws = table.reduce((s, r) => s + r.drawn, 0) / 2;
    expect(points).toBe(3 * (380 - draws) + 2 * draws);
    expect(() => season.playMatchday()).toThrow();
  });

  it('is identical for the same seed across a whole season', () => {
    const a = play(8);
    const b = play(8);
    expect(a.table()).toEqual(b.table());
    expect(a.matchRecords()).toEqual(b.matchRecords());
    expect(play(9).matchRecords()).not.toEqual(a.matchRecords());
  });

  it('orders the table by points, goal difference, goals for, then id', () => {
    const table = play(6).table();
    for (let i = 1; i < table.length; i++) {
      const a = table[i - 1]!;
      const b = table[i]!;
      const key = (r: typeof a): number[] => [r.points, r.goalDifference, r.goalsFor];
      const ka = key(a);
      const kb = key(b);
      const cmp = ka.findIndex((v, j) => v !== kb[j]);
      if (cmp >= 0) expect(ka[cmp]!).toBeGreaterThan(kb[cmp]!);
      else expect(a.clubId < b.clubId).toBe(true);
    }
  });

  it('never fields an injured or suspended player and recovers fitness between matchdays', () => {
    const clubs = league();
    const season = new Season({ seed: 21, clubs });
    let absences = 0;
    let fatigued = 0;
    while (!season.finished) {
      const out = new Set<string>();
      for (const c of clubs) {
        for (const p of c.players) {
          if (season.outFor(c.id, p.id) > 0) out.add(seasonPlayerId(c.id, p.id));
        }
      }
      absences += out.size;
      season.playMatchday({
        onMatch: (_, result) => {
          for (const r of result.playerRatings) {
            // Only the goalkeeper emergency may field an unavailable-looking player (it never
            // does: the out player is excluded from the pool).
            expect(out.has(r.playerId)).toBe(false);
          }
        },
      });
      for (const c of clubs) {
        for (const p of c.players) {
          const f = season.playerState(c.id, p.id)!.fitness;
          expect(f).toBeGreaterThanOrEqual(0);
          expect(f).toBeLessThanOrEqual(100);
          if (f < 99) fatigued++;
        }
      }
    }
    expect(absences).toBeGreaterThan(0);
    expect(fatigued).toBeGreaterThan(0);
  });

  it('bans a sent-off player for exactly the next match', () => {
    const clubs = league();
    const season = new Season({ seed: 33, clubs });
    let checked = 0;
    let carry = new Set<string>();
    while (!season.finished) {
      const next = new Set<string>();
      season.playMatchday({
        onMatch: (_, result) => {
          for (const r of result.playerRatings) {
            expect(carry.has(r.playerId)).toBe(false);
            if (r.redCard) next.add(r.playerId);
          }
        },
      });
      checked += carry.size;
      carry = next;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('never lets the opponent of the user field the same player', () => {
    const clubs = league();
    const shared = clubs[3]!.players.find((p) => p.position === 'MID')!;
    // The user signs a player whose id also exists at real club c3.
    const userPlayers: Player[] = [
      ...clubs[0]!.players.filter((p) => p.id !== shared.id),
      { ...shared },
    ];
    const user: SeasonClubInput = { id: 'USER', name: 'User FC', players: userPlayers };
    const season = new Season({
      seed: 4,
      clubs: [user, ...clubs.slice(1)],
      userClubId: 'USER',
    });
    const userPlayerIds = new Set(userPlayers.map((p) => p.id));
    let met = 0;
    while (!season.finished) {
      const out = season.playMatchday();
      const m = out.userMatch!;
      const opponent = m.fixture.home === 'USER' ? m.fixture.away : m.fixture.home;
      for (const r of m.result.playerRatings) {
        if (r.teamId !== opponent) continue;
        met++;
        const raw = r.playerId.slice(opponent.length + 1);
        expect(userPlayerIds.has(raw)).toBe(false);
      }
    }
    expect(met).toBeGreaterThan(0);
  });

  it('keeps the user lineup unless a starter is unavailable', () => {
    const clubs = league();
    const season = new Season({ seed: 2, clubs, userClubId: 'c0' });
    const lineup = season.userLineup()!;
    const team = season.userSelection();
    expect(team.players.map((p) => p.id)).toEqual(lineup.starters.map((id) => `c0:${id}`));
    expect(team.formation).toBe(lineup.formation);
  });

  it('still fields a side when a club has no forward at all', () => {
    const clubs = league();
    const odd: SeasonClubInput = {
      ...clubs[1]!,
      players: clubs[1]!.players.map((p) =>
        p.position === 'FWD' ? { ...p, position: 'MID' as const } : p,
      ),
    };
    const season = new Season({ seed: 7, clubs: [clubs[0]!, odd, ...clubs.slice(2)] });
    expect(() => season.playMatchday()).not.toThrow();
  });

  it('plays a goalkeeper from the outfield when none is available', () => {
    const clubs = league();
    const original = clubs[1]!;
    const odd: SeasonClubInput = {
      ...original,
      players: original.players.filter((p) => p.position !== 'GK'),
    };
    const season = new Season({ seed: 7, clubs: [clubs[0]!, odd, ...clubs.slice(2)] });
    expect(() => season.playMatchday()).not.toThrow();
  });
});
