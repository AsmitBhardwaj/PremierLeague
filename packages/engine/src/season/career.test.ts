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

/** A kick-off with the current lineup, then half-time changes (a tactic and a midfield swap). */
const playWithChanges = (career: Career): void => {
  const squad = career.squad();
  const lineup = career.userLineup();
  const off = lineup.starters.find((id) => squad.find((p) => p.id === id)!.position === 'MID')!;
  const on = squad.find((p) => p.position === 'MID' && !lineup.starters.includes(p.id))!.id;
  career.kickOff(lineup);
  career.halfTime({ tactic: 'high_press', substitutions: [{ off, on }] });
};

describe('Career', () => {
  it('pauses at the January window and resumes only when it is closed', () => {
    const career = new Career(setup());
    career.apply({ type: 'sim', to: 'end' });
    expect(career.phase).toBe('window');
    expect(career.round).toBe(WINDOW_AFTER_ROUND);
    expect(() => career.apply({ type: 'sim', to: 'next' })).toThrow();
    expect(() => career.kickOff(career.userLineup())).toThrow();
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
    playWithChanges(live);
    const lineup = live.userLineup();
    live.apply({ ...lineup, type: 'lineup', tactic: 'counter', starters: [...lineup.starters] });
    live.playInstant(live.userLineup());
    live.apply({ type: 'sim', to: 'end' });
    live.apply({ type: 'closeWindow' });
    playWithChanges(live);
    live.apply({ type: 'sim', to: 'end' });
    expect(live.phase).toBe('finished');

    const replayed = new Career(setup(9), JSON.parse(JSON.stringify(live.decisions)));
    expect(replayed.season.table()).toEqual(live.season.table());
    expect(replayed.season.matchRecords()).toEqual(live.season.matchRecords());
    expect(replayed.decisions).toEqual(live.decisions);
  }, 120_000);

  it('logs the XI at kick-off and the half-time changes when the second half starts', () => {
    const career = new Career(setup());
    const lineup = career.userLineup();
    career.kickOff({ ...lineup, tactic: 'counter' });
    expect(career.decisions.map((d) => d.type)).toEqual(['kickoff']);
    expect(career.inProgress).toBeDefined();
    expect(career.round).toBe(0);
    expect(career.lastWatched).toBeUndefined();

    career.halfTime({ tactic: 'defensive' });
    expect(career.decisions.map((d) => d.type)).toEqual(['kickoff', 'halftime']);
    expect(career.inProgress).toBeUndefined();
    expect(career.round).toBe(1);
    expect(career.lastWatched?.result.score).toBeDefined();
    expect(() => career.halfTime()).toThrow();
  });

  it('cannot be refreshed into a different XI or tactic once the match has kicked off', () => {
    const live = new Career(setup(4));
    const lineup = live.userLineup();
    const first = live.kickOff(lineup);
    const firstHalf = first.user.snapshot.events.length;

    // A refresh rebuilds the career from its log: the match is still open at half-time.
    const refreshed = new Career(setup(4), JSON.parse(JSON.stringify(live.decisions)));
    expect(refreshed.inProgress).toBeDefined();
    expect(refreshed.inProgress!.user.snapshot.events).toHaveLength(firstHalf);
    expect(refreshed.inProgress!.user.home.players.map((p) => p.id)).toEqual(
      first.user.home.players.map((p) => p.id),
    );

    // Neither a new XI, a new kick-off nor a sim can be applied over the open match.
    const other = [...lineup.starters].reverse();
    expect(() =>
      refreshed.apply({
        type: 'lineup',
        formation: lineup.formation,
        starters: other,
        tactic: 'counter',
      }),
    ).toThrow();
    expect(() => refreshed.kickOff({ ...lineup, tactic: 'counter' })).toThrow();
    expect(() => refreshed.apply({ type: 'sim', to: 'next' })).toThrow();
    expect(refreshed.decisions).toEqual(live.decisions);
  });

  it('cannot be refreshed out of half-time decisions once the second half has started', () => {
    const live = new Career(setup(6));
    playWithChanges(live);
    const logged = JSON.parse(JSON.stringify(live.decisions));

    const refreshed = new Career(setup(6), logged);
    expect(refreshed.inProgress).toBeUndefined();
    expect(refreshed.round).toBe(1);
    // There is no half-time left to decide, and no way back to the pick-team step.
    expect(() => refreshed.halfTime({ tactic: 'defensive' })).toThrow();
    expect(refreshed.decisions).toEqual(live.decisions);
    expect(refreshed.decisions.find((d) => d.type === 'halftime')).toMatchObject({
      tactic: 'high_press',
    });
  });

  it('resumes to the identical final score, events and table', () => {
    const live = new Career(setup(8));
    playWithChanges(live);
    const refreshed = new Career(setup(8), JSON.parse(JSON.stringify(live.decisions)));
    expect(refreshed.lastWatched?.result.score).toEqual(live.lastWatched?.result.score);
    expect(refreshed.lastWatched?.result.events).toEqual(live.lastWatched?.result.events);
    expect(refreshed.lastWatched?.firstHalfEvents).toBe(live.lastWatched?.firstHalfEvents);
    expect(refreshed.season.table()).toEqual(live.season.table());

    // A match refreshed at half-time and then decided gives what the live one gave.
    const a = new Career(setup(8));
    a.kickOff(a.userLineup());
    const b = new Career(setup(8), JSON.parse(JSON.stringify(a.decisions)));
    a.halfTime({ tactic: 'defensive' });
    b.halfTime({ tactic: 'defensive' });
    expect(b.lastWatched?.result.score).toEqual(a.lastWatched?.result.score);
    expect(b.season.table()).toEqual(a.season.table());
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
    playWithChanges(career);
    career.apply({ type: 'sim', to: 'january' });
    return {
      career,
      save: {
        version: 2,
        seed: 5,
        dataVersion,
        identity: { name: 'Test FC' },
        replacedClubId: 'c0',
        squadIds: career.squad().map((p) => p.id),
        prediction: { meanPoints: 50 },
        decisions: career.decisions,
        revealed: -1,
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
    expect(parseCareerSave({ version: 1 })).toBeNull();
    expect(parseCareerSave({ ...build().save, version: 1 })).toBeNull();
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
