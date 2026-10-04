import { describe, expect, it } from 'vitest';
import { createSyntheticTeam } from '../index';
import {
  Career,
  WINDOW_AFTER_ROUND,
  cacheOf,
  computeDataVersion,
  parseCareerSave,
  replayCareer,
  type CareerSave,
  type Decision,
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
const setup = (seed = 3): SeasonSetup => ({
  seed,
  userClubId: 'USER',
  clubs: [
    makeClub('USER', 60),
    ...Array.from({ length: 19 }, (_, i) => makeClub(`c${i}`, 50 + (i % 10) * 3)),
  ],
});

const subs = (career: Career): Decision => {
  const squad = career.squad();
  const lineup = career.userLineup();
  const off = lineup.starters.find((id) => squad.find((p) => p.id === id)!.position === 'MID')!;
  const on = squad.find((p) => p.position === 'MID' && !lineup.starters.includes(p.id))!.id;
  return { type: 'play', halfTime: { tactic: 'high_press', substitutions: [{ off, on }] } };
};

describe('Career', () => {
  it('pauses at the January window and resumes only when it is closed', () => {
    const career = new Career(setup());
    career.apply({ type: 'sim', to: 'end' });
    expect(career.phase).toBe('window');
    expect(career.round).toBe(WINDOW_AFTER_ROUND);
    expect(() => career.apply({ type: 'sim', to: 'next' })).toThrow();
    expect(() => career.beginPlay()).toThrow();
    career.apply({ type: 'closeWindow' });
    expect(career.phase).toBe('matchday');
    expect(() => career.apply({ type: 'closeWindow' })).toThrow();
    career.apply({ type: 'sim', to: 'end' });
    expect(career.phase).toBe('finished');
    expect(career.round).toBe(38);
  });

  it('sims to January from the start but not once the window has passed', () => {
    const career = new Career(setup());
    career.apply({ type: 'sim', to: 'january' });
    expect(career.phase).toBe('window');
    career.apply({ type: 'closeWindow' });
    expect(() => career.apply({ type: 'sim', to: 'january' })).toThrow();
  });

  it('replays its decision log to exactly the same season', () => {
    const live = new Career(setup(9));
    live.apply({ type: 'sim', to: 'next' });
    live.apply(subs(live));
    const lineup = live.userLineup();
    live.apply({ ...lineup, type: 'lineup', tactic: 'counter', starters: [...lineup.starters] });
    live.apply({ type: 'play' });
    live.apply({ type: 'sim', to: 'end' });
    live.apply({ type: 'closeWindow' });
    live.apply(subs(live));
    live.apply({ type: 'sim', to: 'end' });
    expect(live.phase).toBe('finished');

    const replayed = new Career(setup(9), JSON.parse(JSON.stringify(live.decisions)));
    expect(replayed.season.table()).toEqual(live.season.table());
    expect(replayed.season.matchRecords()).toEqual(live.season.matchRecords());
    expect(replayed.decisions).toEqual(live.decisions);
  }, 120_000);

  it('logs a viewed match once, and an abandoned match not at all', () => {
    const career = new Career(setup());
    const first = career.beginPlay();
    const events = first.user.snapshot.events.length;
    career.abandonPlay();
    expect(career.decisions).toHaveLength(0);
    expect(career.round).toBe(0);

    const again = career.beginPlay();
    expect(again.user.snapshot.events).toHaveLength(events);
    career.completePlay();
    expect(career.decisions).toEqual([{ type: 'play' }]);
    expect(career.round).toBe(1);
    expect(career.lastMatchday?.userMatch).toBeDefined();
    expect(() => career.completePlay()).toThrow();
  });

  it('rejects a lineup with players from outside the squad', () => {
    const career = new Career(setup());
    const lineup = career.userLineup();
    expect(() =>
      career.apply({
        type: 'lineup',
        formation: lineup.formation,
        tactic: 'balanced',
        starters: ['nobody', ...lineup.starters.slice(1)],
      }),
    ).toThrow();
  });

  it('projects a finish from the current table, deterministically', () => {
    const career = new Career(setup());
    career.apply({ type: 'sim', to: 'next' });
    const a = career.projection(300);
    expect(a).toEqual(career.projection(300));
    expect(a.positions.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 9);
    expect(a.meanPosition).toBeGreaterThanOrEqual(1);
    expect(a.meanPosition).toBeLessThanOrEqual(20);
    career.apply({ type: 'sim', to: 'january' });
    expect(career.projection(300).meanPoints).toBeGreaterThan(
      career.season.table().find((r) => r.clubId === 'USER')!.points,
    );
  });

  it('reports positions after earlier matchdays for movement arrows', () => {
    const career = new Career(setup());
    career.apply({ type: 'sim', to: 'next' });
    career.apply({ type: 'sim', to: 'next' });
    const before = career.positionsAfter(1);
    const now = career.positionsAfter(2);
    expect(before.size).toBe(20);
    expect([...now.values()].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    expect(now.get(career.season.table()[0]!.clubId)).toBe(1);
  });
});

describe('career saves', () => {
  const dataVersion = computeDataVersion(setup().clubs.flatMap((c) => c.players));
  const build = (): { save: CareerSave; career: Career } => {
    const career = new Career(setup(5));
    career.apply({ type: 'sim', to: 'next' });
    career.apply(subs(career));
    career.apply({ type: 'sim', to: 'january' });
    return {
      career,
      save: {
        version: 1,
        seed: 5,
        dataVersion,
        identity: { name: 'Test FC' },
        replacedClubId: 'c0',
        squadIds: career.squad().map((p) => p.id),
        prediction: { meanPoints: 50 },
        decisions: career.decisions,
        cache: cacheOf(career),
      },
    };
  };

  it('survives a JSON round trip and replays to the same state', () => {
    const { save, career } = build();
    const parsed = parseCareerSave(JSON.parse(JSON.stringify(save)));
    expect(parsed).not.toBeNull();
    const result = replayCareer(parsed!, setup(5), dataVersion);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.career.season.table()).toEqual(career.season.table());
      expect(result.career.phase).toBe('window');
    }
  }, 60_000);

  it('refuses a save from different data, and one whose replay disagrees with its cache', () => {
    const { save } = build();
    expect(replayCareer(save, setup(5), 'different')).toEqual({
      ok: false,
      reason: 'data_version',
    });
    const tampered = { ...save, decisions: save.decisions.slice(0, 1) };
    expect(replayCareer(tampered, setup(5), dataVersion)).toEqual({
      ok: false,
      reason: 'cache_mismatch',
    });
    const bad = { ...save, decisions: [{ type: 'sim', to: 'next' }, { type: 'closeWindow' }] };
    expect(replayCareer(bad as CareerSave, setup(5), dataVersion)).toEqual({
      ok: false,
      reason: 'replay_failed',
    });
  }, 60_000);

  it('rejects malformed saves', () => {
    expect(parseCareerSave(null)).toBeNull();
    expect(parseCareerSave({ version: 2 })).toBeNull();
    const { save } = build();
    expect(parseCareerSave({ ...save, decisions: [{ type: 'nonsense' }] })).toBeNull();
    expect(parseCareerSave({ ...save, seed: 1.5 })).toBeNull();
  }, 60_000);

  it('changes the data version when a rating changes', () => {
    const players = setup().clubs.flatMap((c) => c.players);
    const changed = players.map((p, i) =>
      i === 0 ? { ...p, ratings: { ...p.ratings, pace: p.ratings.pace + 1 } } : p,
    );
    expect(computeDataVersion(changed)).not.toBe(computeDataVersion(players));
    expect(computeDataVersion(players)).toBe(computeDataVersion(players));
  });
});
